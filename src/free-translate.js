/**
 * dsh-translator — keyless public translation providers.
 *
 * The `api` engine translates through public web endpoints that ask for no
 * account, no API key and no token of any kind: the temporary signature one of
 * them wants is minted here, on the fly, and never stored on disk. Every
 * provider below was called for real, repeatedly and in both directions, from
 * a mainland-China network before it was added — an endpoint a user cannot
 * reach is worse than no endpoint at all.
 *
 * None of these is a documented API with an SLA, and measured behaviour drove
 * the chain order rather than reputation:
 *
 *   tencent   — correct on en↔zh, ja→zh, zh→zh-Hant and en→ru, ~70–220 ms.
 *   bing      — correct everywhere and the best quality (its own `usedLLM`),
 *               but 0.8–1.5 s per call plus an hourly token page load.
 *   volcengine— fast, but its automatic source detection silently returns the
 *               input unchanged for zh→en; only an explicit source language
 *               makes it correct, so that is what this module sends.
 *   mymemory  — the only formally documented API here and the weakest: its
 *               translation memory answers some pairs with unrelated prose,
 *               caps one query at 500 UTF-8 bytes, and allows only ~5000
 *               characters a day anonymously.
 *
 * Because a provider can answer HTTP 200 with the source text echoed back, a
 * result is only accepted once {@link looksLikeEcho} agrees the script of the
 * answer matches the script the target language needs.
 *
 * Requests are issued from the Host process (Node), never from the browser, so
 * there is no CORS negotiation and no ambient cookie or credential is sent.
 */

/**
 * Providers in the order the automatic chain tries them.
 *
 * `google` leads for two measured reasons: it was the fastest endpoint here
 * (300–450 ms, both directions, first try) and it is the only one that answers
 * with a dictionary next to the sentence — part-of-speech groups with their
 * own alternatives — plus the source romanization a reader actually wants
 * (拼音 for Chinese, a rough IPA for English). The rest of the chain is
 * unchanged and still covers the directions Google is unreachable in.
 */
export const PROVIDERS = ['google', 'tencent', 'bing', 'volcengine', 'mymemory']

/**
 * Canonical plugin target → the code one provider expects.
 *
 * A provider missing a target is skipped rather than asked: an untranslatable
 * request is answered with the input, which the echo guard would reject only
 * after paying for the round trip.
 */
const PROVIDER_LANGS = {
  google: { 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', 'ja-JP': 'ja', 'ko-KR': 'ko', 'ru-RU': 'ru', 'en': 'en' },
  tencent: { 'zh-Hans': 'zh', 'zh-Hant': 'zh-tw', 'ja-JP': 'ja', 'ko-KR': 'ko', 'ru-RU': 'ru', 'en': 'en' },
  bing: { 'zh-Hans': 'zh-Hans', 'zh-Hant': 'zh-Hant', 'ja-JP': 'ja', 'ko-KR': 'ko', 'ru-RU': 'ru', 'en': 'en' },
  volcengine: { 'zh-Hans': 'zh', 'zh-Hant': 'zh-Hant', 'ja-JP': 'ja', 'ko-KR': 'ko', 'ru-RU': 'ru', 'en': 'en' },
  mymemory: { 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', 'ja-JP': 'ja-JP', 'ko-KR': 'ko-KR', 'ru-RU': 'ru-RU', 'en': 'en-GB' },
}

/** Longest per-request slice handed to one provider, in milliseconds. */
const ATTEMPT_TIMEOUT_MS = 15000

/**
 * Longest a dictionary lookup may take, in milliseconds.
 *
 * The dictionary is a bonus on top of a translation that has already arrived,
 * so it gets a short leash: a slow dictionary endpoint delays the card that is
 * already renderable, and the answer stands without it.
 */
const DICTIONARY_TIMEOUT_MS = 4000

/**
 * Per-provider ceiling on one attempt, in milliseconds.
 *
 * Google answers in 100–450 ms when healthy, so it is held to a quarter of the
 * shared budget: a network blip then costs four seconds once and benches it for
 * thirty, instead of parking every card behind a fifteen-second hang while the
 * rest of the chain — which answers in under half a second — waits its turn.
 */
const PROVIDER_TIMEOUT_MS = { google: 4000 }

/** Longest input a dictionary is asked about, in characters. */
const DICTIONARY_MAX_CHARS = 60

/** Most whitespace-separated words a dictionary is asked about. */
const DICTIONARY_MAX_WORDS = 4

/**
 * Cooldown after a provider's first failure, in milliseconds. Every consecutive
 * failure doubles it, up to {@link COOLDOWN_MAX_MS}: one transient network blip
 * then costs seconds instead of minutes, while an endpoint that is genuinely
 * broken still backs off to a single probe per five-minute window.
 */
const COOLDOWN_BASE_MS = 30 * 1000

/** Ceiling of the exponential cooldown. */
const COOLDOWN_MAX_MS = 5 * 60 * 1000

/** MyMemory's hard cap on one `q`, in UTF-8 bytes. */
const MYMEMORY_MAX_BYTES = 500

/** Sent on every request; some endpoints reject an empty agent. */
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * provider id → `{ until, strikes }`: the epoch ms it may be tried again, and
 * how many consecutive failures put it there. `strikes` drives the backoff, so
 * it is dropped together with the entry on the first success.
 */
const benched = new Map()

/**
 * Drop every cooldown and the cached Bing signature.
 *
 * Both are process-local state that outlives one translation, so a test that
 * fakes `fetch` must start from a clean slate or it would observe the previous
 * case's benchings and page load. Production never calls this.
 */
export function resetProviderHealth() {
  benched.clear()
  bingSession = null
  bingMinting = null
}

/** One failure that already knows the locale-independent code the card renders. */
class FreeTranslateError extends Error {
  constructor(message, code, detail) {
    super(message)
    this.name = 'FreeTranslateError'
    this.code = code
    if (detail !== undefined) this.detail = detail
  }
}

// ---------------------------------------------------------------------------
// Script detection — the guard against a provider echoing its input back.
// ---------------------------------------------------------------------------
// Order matters: Japanese kanji also matches the Han range, so the first
// matching script wins and kana is deliberately tested before Han.
const SCRIPT_TESTS = [
  ['kana', /[\u3040-\u30ff]/],
  ['hangul', /[\u1100-\u11ff\uac00-\ud7af]/],
  ['han', /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/],
  ['cyrillic', /[\u0400-\u04ff]/],
  ['latin', /[a-z\u00c0-\u024f]/i],
]

/** The scripts each target language can legitimately be written in. */
const TARGET_SCRIPTS = {
  'zh-Hans': ['han'],
  'zh-Hant': ['han'],
  'ja-JP': ['kana', 'han'],
  'ko-KR': ['hangul'],
  'ru-RU': ['cyrillic'],
  'en': ['latin'],
}

/** The dominant writing system of one string, or `none` for digits/punctuation. */
function scriptOf(text) {
  for (const [name, pattern] of SCRIPT_TESTS) {
    if (pattern.test(text)) return name
  }
  return 'none'
}

/**
 * Whether an answer is really the input handed back.
 *
 * A provider that cannot serve a direction still answers 200 with the source
 * text (measured: Tencent for `Hello`→ru, volcengine for every zh→en call).
 * Accepting that would show the user their own sentence as a "translation", so
 * the answer must be written in a script the target language actually uses
 * whenever it shares the source's script.
 *
 * Byte-identical output is always an echo, for every script: the provider did
 * no work. That test used to also require a letter, which let digits and emoji
 * through unchanged — `12345` was shown as a translation of `12345`. The
 * question of what to do when *every* provider echoes is answered by the
 * caller, which returns the source marked untranslated rather than an error.
 */
function looksLikeEcho(text, out, target) {
  if (out === text) return true
  const source = scriptOf(text)
  const produced = scriptOf(out)
  if (produced === 'none') return false
  const expected = TARGET_SCRIPTS[target] || []
  return produced === source && !expected.includes(produced)
}

/** Whether one provider can serve this target at all. */
function supportsTarget(id, target) {
  return Object.prototype.hasOwnProperty.call(PROVIDER_LANGS[id] || {}, target)
}

/** The provider's code for a target it supports. */
function langOf(id, target) {
  return PROVIDER_LANGS[id][target]
}

/**
 * The source language to declare to a provider that mis-detects on its own.
 *
 * Volcengine is the reason: with `source_language: "auto"` it echoed every
 * Chinese→English request untouched and truncated a Japanese→Chinese one to a
 * single punctuation mark, while the same calls with an explicit source came
 * back correct. The mapping is coarse on purpose — it only has to pick the
 * right language family.
 */
const SCRIPT_LANGS = { han: 'zh', kana: 'ja', hangul: 'ko', cyrillic: 'ru', latin: 'en', none: 'auto' }

/**
 * One combined abort signal: the caller's, plus this attempt's timeout.
 *
 * The timeout is an explicit `AbortController` rather than
 * `AbortSignal.timeout` so the caller can *clear* it: every attempt used to
 * leave a live timer (up to fifteen seconds) and a composite signal behind
 * after it had already settled.
 *
 * @returns the signal to hand to `fetch`, and the disposer that stops the clock.
 */
function attemptSignal(timeoutMs, signal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs))
  // Never let a pending attempt timer hold the process open on shutdown.
  if (typeof timer.unref === 'function') timer.unref()
  return {
    signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
    dispose: () => clearTimeout(timer),
  }
}

/** Read a bounded slice of a response body, for error text. */
async function bodyText(response) {
  try {
    return (await response.text()).slice(0, 300)
  } catch {
    return ''
  }
}

/** One request with the shared headers, timeout and abort wiring. */
async function requestJson(url, init, timeoutMs, signal) {
  const attempt = attemptSignal(timeoutMs, signal)
  try {
    const response = await fetch(url, {
      ...init,
      signal: attempt.signal,
      headers: { 'user-agent': USER_AGENT, ...(init && init.headers ? init.headers : {}) },
    })
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' ' + (await bodyText(response)))
    }
    return response.json()
  } finally {
    attempt.dispose()
  }
}

/** Reject an empty answer before it reaches the card. */
function requireText(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error('provider returned no translation')
  return text
}

/** The named HTML entities a provider is known to escape its output with. */
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }

/**
 * Decode the HTML entities one provider escapes its output with.
 *
 * MyMemory answers with `&quot;`, `&#39;` and friends inside the translated
 * text, and rendering those raw put `&quot;` on the card. Only the standard
 * named set and numeric forms are decoded, and only for the provider measured
 * to escape: a literal `&amp;` in a Bing answer is part of the text, not an
 * escape, and decoding it there would corrupt a URL.
 */
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body) => {
    const lower = body.toLowerCase()
    if (lower.startsWith('#')) {
      const code = lower.startsWith('#x')
        ? Number.parseInt(lower.slice(2), 16)
        : Number.parseInt(lower.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower) ? NAMED_ENTITIES[lower] : match
  })
}

// ---------------------------------------------------------------------------
// Google Translate (谷歌翻译) — the public gtx endpoint the web page itself
// calls. One POST answers with the sentence, the source romanization (拼音 or a
// rough IPA), the target transliteration and — for a word or a short phrase —
// a dictionary of part-of-speech groups. `dj=1` asks for the object form, so
// no field is addressed by array position.
// ---------------------------------------------------------------------------
const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single'

/**
 * Normalize Google's dictionary payload, or null when it carried none.
 *
 * Only the parts a card can show are kept, and every list is capped: the
 * endpoint answers a common verb with nineteen alternatives per group.
 */
function normalizeGoogleDict(body) {
  if (!body || typeof body !== 'object') return null
  const sentences = Array.isArray(body.sentences) ? body.sentences : []
  const joined = (field) => sentences
    .map((s) => (s && typeof s[field] === 'string' ? s[field].trim() : ''))
    .filter(Boolean)
    .join(' ')
  const phonetic = { source: joined('src_translit'), target: joined('translit') }
  const groups = []
  for (const group of (Array.isArray(body.dict) ? body.dict : [])) {
    if (!group || typeof group !== 'object') continue
    const terms = (Array.isArray(group.terms) ? group.terms : [])
      .filter((t) => typeof t === 'string' && t.trim())
      .slice(0, 12)
    const reverse = []
    for (const entry of (Array.isArray(group.entry) ? group.entry : [])) {
      if (!entry || !Array.isArray(entry.reverse_translation)) continue
      for (const item of entry.reverse_translation) {
        if (typeof item === 'string' && item.trim() && !reverse.includes(item)) reverse.push(item)
      }
    }
    if (terms.length === 0 && reverse.length === 0) continue
    groups.push({ pos: typeof group.pos === 'string' ? group.pos : '', terms, reverse: reverse.slice(0, 12) })
  }
  if (!phonetic.source && !phonetic.target && groups.length === 0) return null
  return { detected: typeof body.src === 'string' ? body.src : null, phonetic, groups }
}

async function googleTranslate(text, target, timeoutMs, signal) {
  const form = new URLSearchParams({ client: 'gtx', dj: '1', sl: 'auto', tl: langOf('google', target), q: text })
  // dt=t: the sentence. dt=bd: the dictionary. dt=rm: romanizations.
  for (const dt of ['t', 'bd', 'rm']) form.append('dt', dt)
  const body = await requestJson(GOOGLE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', referer: 'https://translate.google.com/' },
    body: form.toString(),
  }, timeoutMs, signal)
  const sentences = Array.isArray(body && body.sentences) ? body.sentences : []
  const translated = sentences.map((s) => (s && typeof s.trans === 'string' ? s.trans : '')).join('')
  return { text: requireText(translated), dict: normalizeGoogleDict(body) }
}

// ---------------------------------------------------------------------------
// Youdao 词典 (dict.youdao.com) — the enrichment layer, not a translator.
//
// Google states the sentence and its part-of-speech groups, but neither the
// 音标 a Chinese reader expects under an English word nor a bilingual example.
// Youdao answers one word with exactly that in a single keyless GET: 英美音标,
// 拼音, 带词性的释义, 词形变化 and 双语例句. It is asked only for short input,
// only after a translation already succeeded, and its absence is invisible.
// ---------------------------------------------------------------------------
const YOUDAO_ENDPOINT = 'https://dict.youdao.com/jsonapi'

/** Whether one input is small enough for a dictionary to describe it. */
export function isDictionaryQuery(text) {
  if (typeof text !== 'string') return false
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > DICTIONARY_MAX_CHARS) return false
  if (/[\n\r]/.test(trimmed)) return false
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length > DICTIONARY_MAX_WORDS) return false
  // A multi-word fragment that ends in a sentence mark is prose, not a heading.
  if (words.length > 1 && /[.!?。！？…]$/.test(trimmed)) return false
  return true
}

/** The trimmed string, or undefined when the field is absent or not text. */
function dictText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Strip the <b> highlight tags Youdao wraps its matched word in. */
function untag(text) {
  return typeof text === 'string' ? text.replace(/<\/?b>/g, '') : ''
}

/**
 * Merge Youdao's record into the dictionary already collected for this answer.
 *
 * @returns the merged dictionary, or the input dictionary when Youdao had
 *   nothing to add. Throws only what the caller must not swallow (abort).
 */
/** A Youdao 释义 line starts with its part of speech: `n.`, `adj.`, `【名】`. */
const SENSE_POS_RE = /^((?:[a-z]{1,5}\.)|【[^】]{1,6}】)\s*/i

/**
 * Split one Youdao 释义 line into its part of speech and its separate senses.
 *
 *   "n. 风俗，习俗；习惯；光顾，惠顾"  ->  { pos: 'n.', defs: ['风俗，习俗', '习惯', '光顾，惠顾'] }
 *
 * One line per sense is what makes a word with six meanings readable: the
 * single joined line was 300 characters on a common verb.
 */
function parseSenseLine(line) {
  const match = line.match(SENSE_POS_RE)
  const pos = match ? match[1].trim() : ''
  const rest = match ? line.slice(match[0].length) : line
  const defs = rest.split(/[；;]/).map((part) => part.trim()).filter(Boolean).slice(0, 8)
  if (defs.length === 0) return null
  return { pos, defs }
}

/**
 * Merge Youdao's record into the dictionary already collected for this answer.
 *
 * Youdao is what turns "定制" into a dictionary page: 英美音标, every sense
 * under its own 词性, 词组短语, 同近义词, 变形 and 双语例句. Nothing here is
 * required — each field is written only when the endpoint supplied it, so a
 * headword Youdao does not know still leaves the Google groups in place.
 */
export async function enrichDictionary(text, dict, timeoutMs, signal) {
  const base = dict && typeof dict === 'object' ? { ...dict } : {}
  const phonetic = { ...(base.phonetic || {}) }
  const body = await requestJson(
    YOUDAO_ENDPOINT + '?q=' + encodeURIComponent(text.trim()),
    { headers: { referer: 'https://dict.youdao.com/' } },
    timeoutMs,
    signal,
  )
  const simpleWord = body && body.simple && Array.isArray(body.simple.word) ? body.simple.word[0] : null
  if (simpleWord) {
    // A Chinese headword answers with 拼音 in `phone`; an English one with 音标.
    const pinyin = dictText(simpleWord.phone)
    if (pinyin) phonetic.pinyin = pinyin
  }
  const ecWord = body && body.ec && Array.isArray(body.ec.word) ? body.ec.word[0] : null
  if (ecWord) {
    const us = dictText(ecWord.usphone)
    const uk = dictText(ecWord.ukphone)
    if (us) phonetic.us = us
    if (uk) phonetic.uk = uk
    const senses = []
    for (const entry of (Array.isArray(ecWord.trs) ? ecWord.trs : [])) {
      // One 词性 entry may carry several `tr` records; each holds one line.
      const records = entry && Array.isArray(entry.tr) ? entry.tr : []
      for (const record of records) {
        const line = record && record.l && Array.isArray(record.l.i) ? record.l.i[0] : null
        if (typeof line !== 'string' || !line.trim()) continue
        const sense = parseSenseLine(line)
        if (sense) senses.push(sense)
      }
    }
    if (senses.length) base.senses = senses.slice(0, 8)
    const forms = []
    for (const wf of (Array.isArray(ecWord.wfs) ? ecWord.wfs : [])) {
      const form = wf && wf.wf
      if (form && typeof form.name === 'string' && typeof form.value === 'string') {
        forms.push({ name: form.name, value: form.value })
      }
    }
    if (forms.length) base.forms = forms.slice(0, 8)
  }
  // 词组短语 — the "custom made 定做的" list a dictionary shows under a headword.
  const phraseEntries = body && body.phrs && Array.isArray(body.phrs.phrs) ? body.phrs.phrs : []
  const phrases = []
  for (const item of phraseEntries) {
    const phr = item && item.phr
    if (!phr) continue
    const head = phr.headword && phr.headword.l ? phr.headword.l.i : null
    const record = Array.isArray(phr.trs) ? phr.trs[0] : null
    const gloss = record && record.tr && record.tr.l ? record.tr.l.i : null
    if (typeof head === 'string' && head.trim() && typeof gloss === 'string' && gloss.trim()) {
      phrases.push({ src: head.trim(), dst: gloss.trim() })
    }
    if (phrases.length >= 8) break
  }
  if (phrases.length) base.phrases = phrases
  // 同近义词, grouped by the same 词性 the senses use.
  const synoEntries = body && body.syno && Array.isArray(body.syno.synos) ? body.syno.synos : []
  const synonyms = []
  for (const item of synoEntries) {
    const syno = item && item.syno
    if (!syno) continue
    const words = (Array.isArray(syno.ws) ? syno.ws : [])
      .map((w) => (w && typeof w.w === 'string' ? w.w.trim() : ''))
      .filter(Boolean)
    if (words.length === 0) continue
    synonyms.push({
      pos: typeof syno.pos === 'string' ? syno.pos.trim() : '',
      words: words.slice(0, 8),
      tran: typeof syno.tran === 'string' ? syno.tran.trim() : '',
    })
    if (synonyms.length >= 3) break
  }
  if (synonyms.length) base.synonyms = synonyms
  // 网络释义 is the only sense list a Chinese headword gets from here: the
  // 词性 table above exists for English entries only.
  if (!Array.isArray(base.senses) || base.senses.length === 0) {
    const web = body && body.web_trans && Array.isArray(body.web_trans['web-translation'])
      ? body.web_trans['web-translation']
      : []
    const values = []
    for (const entry of web) {
      for (const t of (entry && Array.isArray(entry.trans) ? entry.trans : [])) {
        const value = t && typeof t.value === 'string' ? t.value.trim() : ''
        if (value && !values.includes(value)) values.push(value)
        if (values.length >= 6) break
      }
      if (values.length >= 6) break
    }
    if (values.length) base.web = values
  }
  const pairs = body && body.blng_sents_part && Array.isArray(body.blng_sents_part['sentence-pair'])
    ? body.blng_sents_part['sentence-pair']
    : []
  const examples = []
  for (const pair of pairs) {
    if (!pair) continue
    const src = untag(pair.sentence).trim()
    const dst = untag(pair['sentence-translation']).trim()
    if (src && dst) examples.push({ src, dst })
    if (examples.length >= 3) break
  }
  if (examples.length) base.examples = examples
  base.phonetic = phonetic
  return base
}

// ---------------------------------------------------------------------------
// Tencent interactive translation (腾讯交互翻译) — one keyless POST, and the
// only provider measured correct in every supported direction. The client_key
// is an anonymous browser fingerprint, not a credential: a fresh random one per
// process works, so none is shipped or persisted.
// ---------------------------------------------------------------------------
const TENCENT_CLIENT_KEY = 'browser-chrome-131.0.0-Win32-'
  + Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)
  + '-' + Date.now()

async function tencent(text, target, timeoutMs, signal) {
  const body = await requestJson('https://transmart.qq.com/api/imt', {
    method: 'POST',
    headers: { 'content-type': 'application/json', referer: 'https://transmart.qq.com/zh-CN/index' },
    body: JSON.stringify({
      header: { fn: 'auto_translation', client_key: TENCENT_CLIENT_KEY },
      type: 'plain',
      model_category: 'normal',
      source: { lang: 'auto', text_list: [text] },
      target: { lang: langOf('tencent', target) },
    }),
  }, timeoutMs, signal)
  const ret = body && body.header ? body.header.ret_code : undefined
  if (ret !== 'succ') throw new Error('tencent: ' + ((body && body.message) || ret || 'failed'))
  const list = body && body.auto_translation
  return requireText(Array.isArray(list) ? list[0] : '')
}

// ---------------------------------------------------------------------------
// Microsoft Bing (微软 Bing) — the translator page mints a temporary
// IG/IID/key/token set that the call must echo back. The set is cached for its
// advertised lifetime and re-minted on the first rejected call, so an hour of
// use costs one extra page load. `www.bing.com` is used rather than a regional
// host so the redirect lands on whichever edition the user's network resolves.
// ---------------------------------------------------------------------------
const IG_RE = /\bIG:"([0-9A-Fa-f]+)"/
const IID_RE = /data-iid="(translator\.[0-9]+)"/
const ABUSE_RE = /params_AbusePreventionHelper\s*=\s*\[\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*(\d+)/

/** Cached Bing page state: where to call, and the signature it handed out. */
let bingSession = null

/** The one mint in flight, shared by every caller that arrives while it runs. */
let bingMinting = null

/** Mint a fresh Bing session from the translator page (following its redirect). */
async function mintBingSession(timeoutMs, signal) {
  const attempt = attemptSignal(timeoutMs, signal)
  try {
    const response = await fetch('https://www.bing.com/translator', {
      signal: attempt.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    })
    if (!response.ok) throw new Error('bing portal HTTP ' + response.status)
    const html = await response.text()
    const ig = html.match(IG_RE)
    const iid = html.match(IID_RE)
    const abuse = html.match(ABUSE_RE)
    if (!ig || !iid || !abuse) throw new Error('bing portal: signature markers not found')
    const origin = new URL(response.url || 'https://www.bing.com/translator').origin
    return {
      origin,
      ig: ig[1],
      iid: iid[1],
      key: abuse[1],
      token: abuse[2],
      // The page advertises its own lifetime in ms; refresh a minute early.
      expires: Date.now() + Math.max(60000, Number(abuse[3]) || 3600000) - 60000,
    }
  } finally {
    attempt.dispose()
  }
}

/**
 * The cached Bing session, minting one if it is missing or past its lifetime.
 *
 * Concurrent first calls share the one mint in flight instead of each loading
 * the portal page — the session is process state, so a second page load only
 * overwrote the first and paid for a request nobody used.
 */
async function bingSessionNow(timeoutMs, signal) {
  if (bingSession && bingSession.expires > Date.now()) return bingSession
  if (!bingMinting) {
    bingMinting = mintBingSession(timeoutMs, signal)
      .then((session) => { bingSession = session; return session })
      .finally(() => { bingMinting = null })
  }
  return bingMinting
}

/** One call against an existing Bing session. */
async function bingCall(session, text, target, timeoutMs, signal) {
  const url = session.origin + '/ttranslatev3?isVertical=1&IG=' + encodeURIComponent(session.ig)
    + '&IID=' + encodeURIComponent(session.iid + '.1')
  const form = new URLSearchParams({
    fromLang: 'auto-detect',
    text,
    to: langOf('bing', target),
    token: session.token,
    key: session.key,
  })
  const body = await requestJson(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      referer: session.origin + '/translator',
    },
    body: form.toString(),
  }, timeoutMs, signal)
  // A rejected signature answers 200 with a statusCode object, not an array.
  if (!Array.isArray(body)) {
    const error = new Error('bing: ' + ((body && body.statusCode) || 'unexpected response'))
    error.expired = true
    throw error
  }
  const first = body[0]
  const translation = first && Array.isArray(first.translations) ? first.translations[0] : null
  return requireText(translation && translation.text)
}

async function bing(text, target, timeoutMs, signal) {
  try {
    return await bingCall(await bingSessionNow(timeoutMs, signal), text, target, timeoutMs, signal)
  } catch (err) {
    // Only a stale signature is worth a second page load; a real network
    // failure would just repeat itself.
    if (!err || err.expired !== true) throw err
    bingSession = null
    return bingCall(await bingSessionNow(timeoutMs, signal), text, target, timeoutMs, signal)
  }
}

// ---------------------------------------------------------------------------
// Volcengine (火山翻译) — one keyless POST and the fastest of the four, but
// only with an explicit source language (see SCRIPT_LANGS). It also answers
// HTTP 500 intermittently, which the chain absorbs as an ordinary failure.
// ---------------------------------------------------------------------------
async function volcengine(text, target, timeoutMs, signal) {
  const body = await requestJson('https://translate.volcengine.com/crx/translate/v1/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      source_language: SCRIPT_LANGS[scriptOf(text)] || 'auto',
      target_language: langOf('volcengine', target),
      text,
    }),
  }, timeoutMs, signal)
  const status = body && body.base_resp ? body.base_resp.status_code : undefined
  if (typeof status === 'number' && status !== 0) {
    throw new Error('volcengine ' + status + ': ' + ((body.base_resp && body.base_resp.status_message) || ''))
  }
  return requireText(body && body.translation)
}

// ---------------------------------------------------------------------------
// MyMemory — the only formally documented API here, and the last resort.
// ---------------------------------------------------------------------------
const MYMEMORY_ERROR_RE = /QUERY LENGTH LIMIT|INVALID (TARGET|SOURCE) LANGUAGE|MYMEMORY WARNING|YOU USED ALL AVAILABLE FREE TRANSLATIONS/i

async function mymemory(text, target, timeoutMs, signal) {
  const form = new URLSearchParams({ q: text, langpair: 'autodetect|' + langOf('mymemory', target) })
  const body = await requestJson('https://api.mymemory.translated.net/get?' + form.toString(), {}, timeoutMs, signal)
  const status = body && body.responseStatus
  const raw = body && body.responseData ? body.responseData.translatedText : ''
  if (status !== 200 || (body && body.quotaFinished === true) || MYMEMORY_ERROR_RE.test(String(raw))) {
    throw new Error('mymemory: ' + (String(raw) || ('status ' + status)).slice(0, 120))
  }
  return requireText(decodeEntities(raw))
}

/** provider id → the call that performs one translation. */
const CALLS = { google: googleTranslate, tencent, bing, volcengine, mymemory }

/**
 * Translate through the keyless public providers.
 *
 * @param text - the source text, already trimmed and length-capped by the caller.
 * @param target - canonical plugin target language (`zh-Hans`, `en`, …).
 * @param options - `provider` (`auto` or one id), `timeoutMs`, `signal`, and
 *   `force` — set by an explicit user retry to ignore every cooldown, so a
 *   chain that is merely benched is always reachable by hand.
 * @returns `{ text, provider, untranslated?, attempts }` — the first answer that
 *   is usable. When every provider echoed the input, `text` is the source and
 *   `untranslated` is `true`: the chain found no translation but has no failure
 *   to report either, and handing the reader their own text labelled as such is
 *   more honest than an "endpoints unavailable" card.
 * @throws FreeTranslateError with code `api-failed`, `api-timeout` or `cancelled`;
 *   its `detail` carries one `{ provider, reason, error }` record per attempt,
 *   where `reason` is `unsupported`, `too-long`, `benched`, `echo` or `failed`.
 */
export async function translateFree(text, target, options = {}) {
  const requested = typeof options.provider === 'string' && PROVIDERS.includes(options.provider)
    ? options.provider
    : 'auto'
  const chain = requested === 'auto' ? PROVIDERS : [requested]
  const total = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 30000
  const signal = options.signal
  const force = options.force === true
  const deadline = Date.now() + total
  const attempts = []

  for (const id of chain) {
    if (signal && signal.aborted) throw new FreeTranslateError('cancelled', 'cancelled')
    if (!supportsTarget(id, target)) {
      attempts.push({ provider: id, reason: 'unsupported', error: 'does not support ' + target })
      continue
    }
    if (id === 'mymemory' && Buffer.byteLength(text, 'utf8') > MYMEMORY_MAX_BYTES) {
      attempts.push({ provider: id, reason: 'too-long', error: 'text exceeds ' + MYMEMORY_MAX_BYTES + ' bytes' })
      continue
    }
    const health = benched.get(id)
    if (!force && health !== undefined && health.until > Date.now()) {
      attempts.push({ provider: id, reason: 'benched', error: 'benched after an earlier failure' })
      continue
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw new FreeTranslateError('translation timed out (' + total + ' ms)', 'api-timeout', attempts)
    }
    try {
      // A provider may answer with a bare string or with { text, dict }: both
      // shapes are accepted so the dictionary-aware endpoint does not force a
      // change on the other four.
      const attemptMs = Math.min(remaining, PROVIDER_TIMEOUT_MS[id] || ATTEMPT_TIMEOUT_MS)
      const raw = await CALLS[id](text, target, attemptMs, signal)
      const answer = typeof raw === 'string' ? { text: raw } : (raw || {})
      const out = requireText(answer.text)
      if (looksLikeEcho(text, out, target)) {
        const echo = new Error('provider echoed the source text instead of translating it')
        echo.reason = 'echo'
        throw echo
      }
      benched.delete(id)
      // A sentence has no dictionary entry to show: only the short inputs a
      // dictionary can actually describe keep the payload.
      let dict = isDictionaryQuery(text) && answer.dict && typeof answer.dict === 'object' ? answer.dict : null
      const left = deadline - Date.now()
      if (isDictionaryQuery(text) && left > 300) {
        try {
          dict = await enrichDictionary(text, dict, Math.min(left, DICTIONARY_TIMEOUT_MS), signal)
        } catch {
          // The dictionary is a bonus on an answer that already stands: a
          // rejected or timed-out lookup leaves the translation untouched.
        }
      }
      if (signal && signal.aborted) throw new FreeTranslateError('cancelled', 'cancelled')
      return { text: out, provider: id, attempts, dict }
    } catch (err) {
      if (signal && signal.aborted) throw new FreeTranslateError('cancelled', 'cancelled')
      const message = err instanceof Error ? err.message : String(err)
      // `reason` is the locale-independent half of the record: the card maps it
      // to a translated phrase instead of parsing the English `error` text.
      attempts.push({ provider: id, reason: (err && err.reason) || 'failed', error: message })
      // Bench the provider so a hanging or broken endpoint costs at most one
      // probe per backoff window instead of one per translation. The window
      // doubles per consecutive failure, so a transient blip — which takes the
      // whole chain down at once — no longer locks every provider out for the
      // full five minutes.
      const strikes = ((health && health.strikes) || 0) + 1
      const cooldown = Math.min(COOLDOWN_BASE_MS * 2 ** (strikes - 1), COOLDOWN_MAX_MS)
      benched.set(id, { until: Date.now() + cooldown, strikes })
    }
  }

  // Every provider that answered handed the input straight back. Nothing
  // failed — the chain simply has no translation — and a provider echoing is
  // the one outcome an error card describes wrongly: the endpoints are fine,
  // they just had nothing to say. Return the source, marked.
  if (attempts.length > 0 && attempts.every(a => a.reason === 'echo')) {
    return { text, provider: null, untranslated: true, attempts }
  }

  const timedOut = Date.now() >= deadline
  const message = attempts.length
    ? 'every free API provider failed: ' + attempts.map(a => a.provider + ' (' + a.error + ')').join('; ')
    : 'no free API provider can serve ' + target
  throw new FreeTranslateError(message, timedOut ? 'api-timeout' : 'api-failed', attempts)
}
