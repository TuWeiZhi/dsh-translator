/**
 * dsh-translator — packaged Host half.
 *
 * A plain ESM Cordis plugin module installed through the dsh bundle mechanism
 * (`package.json` `dsh.bundle.patch` → `cordis.patch.yml` row). The browser
 * Client half reaches this half over the **authenticated** `/api` channel,
 * one exact Connection Fetch route per operation:
 *
 *   POST /api/translator/translate         { text, runId, clientId, retry? }
 *   POST /api/translator/translate-cancel  { runId, clientId }  (legacy: { seq })
 *   POST /api/translator/list-models       {}
 *   POST /api/translator/default-model     {}
 *
 * A run is identified by the opaque `runId` the caller mints, not by a counter
 * this half keeps: the browser owns the card, so it must be able to name the
 * run it wants cancelled without having seen a response yet. Cancellation is
 * matched on that token alone, and `clientId` is checked when both sides carry
 * one, so one browser can never cancel another's run. A caller also supersedes
 * only *its own* earlier runs — never another client's. A payload without
 * `runId` is served the old counter-matched behaviour for a browser still
 * running the previous bundle.
 *
 * The routes are registered with `ctx.connection.fetch.register`, so the
 * carrier's Host/Origin fence and browser authentication apply before the
 * handler runs; no pattern here serves an unauthenticated prefix.
 *
 * Response envelope (kept from the 0.2 line, it is locale-independent):
 *   { ok: true, value: <json> } | { ok: false, error: { code, message } }
 *
 * Configuration is the exported `Config` alone. Every editable field is
 * declared `.volatile()`, which is what makes the entry visible to the Host's
 * schema-driven settings transport (`ctx.settings`) and lets an edit reach
 * this half **live**, without unloading the plugin: the loader rewrites the
 * profile patch and updates the same references in place, and every operation
 * reads them through {@link readConfig}. There is no settings package import
 * and no separate config source to keep in sync.
 *
 * Two engines answer a translation, chosen by the `engine` field:
 *
 *   `api`   (default) — keyless public web endpoints, walked as a fallback
 *           chain by {@link translateFree} in `free-translate.js`. No account,
 *           no API key, no token to paste, nothing to configure.
 *   `model` — streams through `ctx.llm` with the session's configured default
 *           model, a timeout, a single in-flight run, and seq-matched
 *           cancellation. This is what the 0.3 line did unconditionally.
 *
 * Both share the direction detection, the 2000-character cap, the single-flight
 * run slot and the seq-matched cancellation.
 *
 * A finished translation is cached for a few minutes under everything that
 * decided it, and every caller is metered per client bucket, so re-selecting a
 * passage costs nothing and a runaway page cannot use the host as an amplifier
 * against the providers.
 */
import z from '@deepseek-ai/schemastery'
import { isVolatile } from '@deepseek-ai/cosmokit'
import { translateFree, PROVIDERS } from './free-translate.js'

export const name = 'dsh-translator'

/**
 * Required services. `connection` is optional on purpose: a profile without a
 * browser carrier (headless, sdk) still loads this plugin, and the routes are
 * mounted by the `ctx.inject(['connection'], …)` block below only where the
 * carrier exists.
 */
export const inject = ['llm', 'timer']

/** Common prefix of the exact Fetch routes on the shared `/api` channel. */
const API_BASE = '/api/translator'

const PRIMARY_LANGS = ['zh-Hans', 'zh-Hant', 'ja-JP', 'ko-KR', 'ru-RU']
// Every language a standalone panel may request explicitly: the primary
// languages plus English, which is where the automatic direction sends Chinese.
const EXPLICIT_TARGETS = ['zh-Hans', 'zh-Hant', 'ja-JP', 'ko-KR', 'ru-RU', 'en']
const REASONING_EFFORTS = ['off', 'low', 'high', 'max']

/** Engines the plugin can translate with. */
const ENGINES = ['api', 'model']

/** `auto` plus every keyless provider, i.e. what `apiProvider` accepts. */
const API_PROVIDERS = ['auto', ...PROVIDERS]

/**
 * Ceiling for the settings-page metadata lookups (`list-models`,
 * `default-model`). A provider that never answers must cost the form a few
 * seconds, not the whole session — the translation deadline is not a suitable
 * bound here because these calls run before any translation exists.
 */
const METADATA_TIMEOUT_MS = 8000

/**
 * How long a finished translation stays reusable, and how many are kept.
 *
 * Keyed by everything that determined the answer (engine, direction, text and
 * the settings that feed it), so a settings edit simply misses. Selecting the
 * same passage twice — or opening the card again on the same word — costs one
 * provider call instead of two, and an explicit retry deliberately skips the
 * read.
 */
export const CACHE_TTL_MS = 10 * 60 * 1000
export const CACHE_MAX_ENTRIES = 200

/**
 * Per-client request budget: {@link RATE_MAX} requests per
 * {@link RATE_WINDOW_MS}.
 *
 * The `/api` channel is already authenticated, so this is not a security
 * boundary — it is what stops a runaway loop in one page from turning this
 * host into an amplifier pointed at four third-party endpoints. Cache hits are
 * charged as well: the budget bounds requests, not work.
 */
export const RATE_WINDOW_MS = 60 * 1000
export const RATE_MAX = 60

/** How often one client may force a retry past every provider cooldown. */
export const RETRY_FLOOR_MS = 3000

/** Client buckets kept before idle ones are dropped. */
const RATE_MAX_BUCKETS = 100

/**
 * Longest text one request may carry, in UTF-16 code units. Anything longer is
 * truncated, and the truncation is reported to the card so the reader is never
 * shown half a sentence as if it were the whole translation.
 */
export const MAX_TEXT_CHARS = 2000

/**
 * Numeric limits every layer agrees on.
 *
 * The schema validates them, {@link readConfig} clamps to them, and the
 * browser form mirrors them (`CONFIG_BOUNDS` in `client/core.js`). They are
 * exported so a test can pin the two halves together, and so the ceiling is
 * stated once: `timeoutMs` in particular must stay under the 32-bit
 * `setTimeout` limit the harness timer is built on, because a larger value
 * overflows and fires after about a millisecond — turning every translation
 * into an instant "timed out".
 */
export const LIMITS = {
  timeoutMs: { min: 1000, max: 600000 },
  maxTokens: { min: 1, max: 32768 },
  temperature: { min: 0, max: 2 },
}

/**
 * Plugin configuration (schemastery schema, Cordis Standard Schema).
 *
 * Defaults live here: the same schema validates the `config:` block of the
 * plugin row in `cordis.yml` and the section the settings transport reads and
 * writes, so the two layers can never drift apart. `.volatile()` marks the
 * fields a settings page may edit without remounting the plugin; without it
 * the entry carries no form at all.
 *
 * `api` is the default engine on purpose: it needs nothing configured, while
 * the `model` half of the schema only takes effect once a user selects it.
 */
export const Config = z.object({
  engine: z.union(ENGINES.map(e => z.const(e))).default('api').volatile(),
  apiProvider: z.union(API_PROVIDERS.map(p => z.const(p))).default('auto').volatile(),
  primaryLanguage: z.union([z.const('zh-Hans'), z.const('zh-Hant'), z.const('ja-JP'), z.const('ko-KR'), z.const('ru-RU')]).default('zh-Hans').volatile(),
  customModel: z.object({
    provider: z.string().default('').volatile(),
    model: z.string().default('').volatile(),
  }).default({ provider: '', model: '' }),
  reasoningEffort: z.union([z.const('off'), z.const('low'), z.const('high'), z.const('max')]).default('low').volatile(),
  timeoutMs: z.number().min(LIMITS.timeoutMs.min).max(LIMITS.timeoutMs.max).default(30000).volatile(),
  maxTokens: z.number().min(LIMITS.maxTokens.min).max(LIMITS.maxTokens.max).default(1024).volatile(),
  temperature: z.number().min(LIMITS.temperature.min).max(LIMITS.temperature.max).step(0.1).default(0.3).volatile(),
})

/** Current value behind a volatile config reference, or the plain value itself. */
function plain(node) {
  return isVolatile(node) ? node.get() : node
}

/** One finite number inside `[min, max]`, or the fallback. */
function numberIn(value, min, max, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback
}

/**
 * Read the effective configuration for one operation.
 *
 * Called per request rather than captured at apply time: a live settings edit
 * only updates the references, so a captured plain object would go stale.
 * @param config - validated plugin Config (volatile references at the marked fields).
 * @returns the plain values the translation core consumes.
 */
function readConfig(config) {
  const root = config !== null && typeof config === 'object' ? config : Config({})
  const primaryLanguage = plain(root.primaryLanguage)
  const customModel = root.customModel !== null && typeof root.customModel === 'object' ? root.customModel : {}
  const engine = plain(root.engine)
  const apiProvider = plain(root.apiProvider)
  return {
    engine: ENGINES.includes(engine) ? engine : 'api',
    apiProvider: API_PROVIDERS.includes(apiProvider) ? apiProvider : 'auto',
    primaryLanguage: PRIMARY_LANGS.includes(primaryLanguage) ? primaryLanguage : 'zh-Hans',
    customModel: {
      provider: String(plain(customModel.provider) ?? ''),
      model: String(plain(customModel.model) ?? ''),
    },
    reasoningEffort: REASONING_EFFORTS.includes(plain(root.reasoningEffort)) ? plain(root.reasoningEffort) : 'low',
    // Clamped even though the schema already bounds them: a value that reaches
    // `ctx.timeout` out of range does not merely misbehave, it overflows the
    // timer and aborts the translation immediately.
    timeoutMs: Math.floor(numberIn(plain(root.timeoutMs), LIMITS.timeoutMs.min, LIMITS.timeoutMs.max, 30000)),
    maxTokens: Math.floor(numberIn(plain(root.maxTokens), LIMITS.maxTokens.min, LIMITS.maxTokens.max, 1024)),
    temperature: numberIn(plain(root.temperature), LIMITS.temperature.min, LIMITS.temperature.max, 0.3),
  }
}

/** JSON response for one exact Fetch route. */
function json(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export function apply(ctx, config) {
  // Injected services are ready before apply runs; only optional ones use
  // ctx.get()/ctx.inject().
  const llm = ctx.llm
  /**
   * Resolved per call rather than captured at apply time: a profile can mount
   * the service that answers this after this plugin, and a captured
   * `undefined` would silently fall back to the first provider forever.
   */
  const defaultModel = () => ctx.get('agentDefaultModel')
  let seq = 0
  /** Counter behind the *legacy* cancel protocol only (a caller that sent no runId). */
  let legacySeq = 0
  /**
   * Every live run, keyed by its opaque token. A Map rather than one slot: two
   * browser tabs (or two users of a remote instance) must be able to translate
   * at the same time, and one of them cancelling must never touch the other.
   */
  const runs = new Map()

  // Fiber teardown aborts every in-flight provider stream, not just the newest.
  ctx.effect(() => () => {
    for (const run of runs.values()) cancelRun(run)
    runs.clear()
  }, 'dsh-translator: abort in-flight translations')

  /** An opaque caller-minted token, or null when it is absent or malformed. */
  function runToken(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null
  }

  /** Retire one run: flag it cancelled and tear down whatever it is awaiting. */
  function cancelRun(run) {
    if (!run || run.cancelled) return
    run.cancelled = true
    if (run.abort) run.abort()
  }

  /** The `timeout` code both engines report, so the card renders one phrase. */
  function timeoutError(ms) {
    const e = new Error('translation timed out (' + ms + ' ms)')
    e.code = 'timeout'
    e.detail = ms
    return e
  }

  /** A minimal AbortError, so race/lookup failures are recognisable. */
  function abortError() {
    const e = new Error('aborted')
    e.name = 'AbortError'
    return e
  }

  /**
   * Await `promise`, but reject as soon as `signal` aborts.
   *
   * Used to put the *whole* model path — including the provider/model lookup
   * that precedes any streaming — under the one deadline the caller configured;
   * without it a provider whose model list never answers hangs the request
   * forever. `Promise.race` subscribes to the loser too, so a late rejection
   * from the abandoned promise is observed rather than surfacing unhandled.
   */
  function raceAbort(promise, signal) {
    if (signal.aborted) return Promise.reject(abortError())
    return Promise.race([promise, new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(abortError()), { once: true })
    })])
  }

  /** Await `promise` with its own short deadline, falling back instead of throwing. */
  async function withDeadline(promise, ms, fallback) {
    try {
      return await raceAbort(promise, AbortSignal.timeout(Math.max(1, ms)))
    } catch (err) {
      return fallback
    }
  }

  /** Finished translations, keyed by everything that determined the answer. */
  const cache = new Map()
  /** Rate-limit and retry-floor state per client bucket. */
  const clientState = new Map()

  /** One cache key from the parts that decide one answer. */
  function cacheKey(parts) {
    return JSON.stringify(parts)
  }

  /**
   * The cached answer for a request, or null.
   *
   * Re-inserting a hit moves it to the end of the Map's iteration order, which
   * makes the oldest key the least recently used one to evict.
   */
  function cacheGet(key) {
    const hit = cache.get(key)
    if (hit === undefined) return null
    if (hit.expires <= Date.now()) {
      cache.delete(key)
      return null
    }
    cache.delete(key)
    cache.set(key, hit)
    return hit.value
  }

  function cacheSet(key, value) {
    cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS })
    while (cache.size > CACHE_MAX_ENTRIES) {
      cache.delete(cache.keys().next().value)
    }
  }

  /** The bucket a caller is metered under; a legacy payload has no id. */
  function clientBucket(clientId) {
    const key = clientId || 'anonymous'
    let state = clientState.get(key)
    if (state === undefined) {
      state = { hits: [], forcedAt: 0 }
      clientState.set(key, state)
    }
    return state
  }

  /** Drop buckets that are neither inside the window nor holding a retry floor. */
  function pruneClientState(now) {
    for (const [key, state] of clientState) {
      const lastHit = state.hits.length > 0 ? state.hits[state.hits.length - 1] : 0
      const idle = now - Math.max(lastHit, state.forcedAt) >= RATE_WINDOW_MS
      if (idle) clientState.delete(key)
    }
  }

  /** Charge one request to a caller and say whether it is over budget. */
  function rateLimited(clientId) {
    const now = Date.now()
    const state = clientBucket(clientId)
    state.hits = state.hits.filter(at => now - at < RATE_WINDOW_MS)
    if (state.hits.length >= RATE_MAX) return true
    state.hits.push(now)
    if (clientState.size > RATE_MAX_BUCKETS) pruneClientState(now)
    return false
  }

  /**
   * Whether a caller may bypass every provider cooldown right now.
   *
   * An explicit retry is how a reader reaches a chain that is merely benched,
   * so it stays available — but at most once per floor, or the button itself
   * becomes the amplifier.
   */
  function forceAllowed(clientId) {
    const now = Date.now()
    const state = clientBucket(clientId)
    if (now - state.forcedAt < RETRY_FLOOR_MS) return false
    state.forcedAt = now
    return true
  }

  function resolveTarget(text, c) {
    const hasZh = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)
    const hasKana = /[\u3040-\u30ff]/.test(text)
    const hasHangul = /[\uac00-\ud7af]/.test(text)
    const hasCyrillic = /[\u0400-\u04ff]/.test(text)
    switch (c.primaryLanguage) {
      case 'zh-Hans': case 'zh-Hant': return hasZh ? 'en' : c.primaryLanguage
      case 'ja-JP': return hasKana ? 'en' : 'ja-JP'
      case 'ko-KR': return hasHangul ? 'en' : 'ko-KR'
      case 'ru-RU': return hasCyrillic ? 'en' : 'ru-RU'
      default: return hasZh ? 'en' : 'zh-Hans'
    }
  }

  /**
   * A selection card always translates "away from what was selected"; the input
   * panel lets the reader pick the destination, so an explicit accepted target
   * wins over the automatic direction.
   */
  function pickTarget(text, c, payload) {
    const want = payload && typeof payload.target === 'string' ? payload.target : ''
    if (EXPLICIT_TARGETS.includes(want)) return want
    return resolveTarget(text, c)
  }

  function systemPrompt(target) {
    switch (target) {
      case 'zh-Hans': return '你是划词翻译引擎。用户消息中的内容就是需要翻译的文本，请将其翻译成简体中文。只输出译文本身：不要解释、不要加引号、不要输出原文、不要任何备注。'
      case 'zh-Hant': return '你是劃詞翻譯引擎。使用者訊息中的內容就是需要翻譯的文字，請將其翻譯成繁體中文。只輸出譯文本身：不要解釋、不要加引號、不要輸出原文、不要任何備註。'
      case 'ja-JP': return 'あなたは単語選択翻訳エンジンです。ユーザーメッセージの内容が翻訳対象のテキストです。日本語に翻訳してください。翻訳文のみを出力してください：説明・引用符・原文・注記は不要です。'
      case 'ko-KR': return '당신은 단어 선택 번역 엔진입니다. 사용자 메시지의 내용이 번역할 텍스트입니다. 한국어로 번역하세요. 번역문만 출력하세요: 설명, 인용부호, 원문, 주석은 필요 없습니다.'
      case 'ru-RU': return 'Вы — движок перевода по выделенному слову. Содержимое сообщения пользователя — это текст для перевода. Переведите его на русский язык. Выводите только перевод: без объяснений, без кавычек, без исходного текста, без примечаний.'
      default: return 'You are a word-selection translation engine. The user message content is the text to translate; translate it into English. Output ONLY the translation itself: no explanations, no quotes, no original text, no notes.'
    }
  }

  async function pickModel(c) {
    if (c.customModel.provider && c.customModel.model) {
      return { provider: c.customModel.provider, model: c.customModel.model }
    }
    try {
      const model = defaultModel()
      const sel = model && model.currentSelection()
      if (sel && sel.provider && sel.model) {
        return { provider: sel.provider, model: sel.model }
      }
    } catch (err) {
      console.error('[translator] currentSelection failed:', err)
    }
    const providers = llm.listProviders()
    if (!providers || providers.length === 0) {
      const e = new Error('no configured model: no LLM provider')
      e.code = 'no-provider'
      throw e
    }
    const models = await llm.listModels(providers[0].id)
    if (!models || models.length === 0) {
      const e = new Error('provider has no models: ' + providers[0].id)
      e.code = 'no-model'; e.detail = providers[0].id
      throw e
    }
    return { provider: providers[0].id, model: models[0].id }
  }

  /**
   * Stream one translation through the harness LLM.
   *
   * The `controller` and its deadline are owned by the caller so that the
   * provider/model lookup that precedes the stream sits under the same clock;
   * `isTimedOut()` exposes that deadline's flag without a second timer.
   */
  async function translateWithModel(provider, model, text, target, c, run, controller, isTimedOut) {
    const system = systemPrompt(target)
    let out = ''
    let failure = null
    let truncated = false
    let tokens = null
    let eff = c.reasoningEffort
    const isAbort = (err) => (err && (err.name === 'AbortError' || /abort/i.test(String((err && err.message) || err))))
    const consume = async (effort) => {
      // Each attempt starts from zero: the reasoning-effort retry below must
      // not append to, or inherit usage from, an attempt that already failed.
      out = ''
      failure = null
      truncated = false
      tokens = null
      const stream = llm.stream({
        provider,
        model,
        messages: [{ id: 'tr-' + (++seq), role: 'user', content: [{ type: 'text', text }] }],
        system,
        temperature: c.temperature,
        maxTokens: c.maxTokens,
        signal: controller.signal,
        ...(effort === undefined ? {} : { reasoningEffort: effort }),
      })
      try {
        for await (const chunk of stream) {
          if (run.cancelled) break
          if (isTimedOut()) break
          if (chunk.type === 'text-delta') {
            out += chunk.text
          } else if (chunk.type === 'usage' && chunk.usage) {
            tokens = { input: chunk.usage.inputTokens || 0, output: chunk.usage.outputTokens || 0 }
          } else if (chunk.type === 'finish') {
            if (chunk.reason.kind === 'max-tokens') {
              truncated = true
              break
            }
            if (chunk.reason.kind !== 'stop') {
              failure = chunk.reason.failure && chunk.reason.failure.message
                ? chunk.reason.failure.message
                : 'model error (' + chunk.reason.kind + ')'
              break
            }
          }
        }
      } catch (err) {
        // The provider rejected because we aborted (cancel or timeout): the
        // post-loop flags above decide the outcome, nothing to rethrow here.
        if (run.cancelled || isTimedOut() || isAbort(err)) return null
        throw err
      }
      return null
    }
    // Only pass a reasoning effort the model actually supports; otherwise
    // omit it so the model uses its own default. The lookup itself rides the
    // caller's signal so a stalled provider cannot hold the request open.
    try {
      const info = await llm.resolveModelInfo(provider, model, controller.signal)
      const efforts = info && info.reasoning && info.reasoning.efforts
      if (!efforts || !efforts.some(e => e.id === eff)) eff = undefined
    } catch (err) { /* keep eff; the stream may still reject below */ }
    try {
      await consume(eff)
    } catch (err) {
      const message = String((err && err.message) || err)
      if (eff !== undefined && !isAbort(err) && !run.cancelled && !isTimedOut() && /reasoning effort/i.test(message)) {
        eff = undefined
        await consume(undefined)
      } else {
        throw err
      }
    }
    if (run.cancelled) return { cancelled: true }
    if (isTimedOut()) throw timeoutError(c.timeoutMs)
    if (failure) {
      const e = new Error('model call failed: ' + failure)
      e.code = 'model-error'; e.detail = failure
      throw e
    }
    if (!out || !out.trim()) {
      const e = new Error('model returned no translation')
      e.code = 'translated-empty'
      throw e
    }
    // Some providers (e.g. OpenAI-compatible local endpoints) report zero
    // usage; estimate from text length rather than hiding the figure.
    if (!tokens || (tokens.input === 0 && tokens.output === 0)) {
      const est = (s) => {
        const cjk = (s.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/g) || []).length
        return Math.max(1, Math.round(cjk * 0.9 + (s.length - cjk) / 3.5))
      }
      tokens = { input: est(text), output: est(out.trim()) }
    }
    return { text: out.trim(), truncated, tokens }
  }

  async function enumerateModels() {
    const out = []
    try {
      const providers = (llm.listProviders && llm.listProviders()) || []
      for (const p of providers) {
        let models = []
        // Settings-page metadata: a provider that never answers must not hold
        // the form open, so each lookup gets its own short deadline.
        try { models = (await withDeadline(llm.listModels(p.id), METADATA_TIMEOUT_MS, [])) || [] } catch (err) { console.error('[translator] listModels failed:', p.id, err) }
        const pLabel = p.name || p.id
        for (const m of models) {
          out.push({ provider: p.id, model: m.id, label: pLabel + ' / ' + (m.name || m.id) })
        }
      }
    } catch (err) {
      console.error('[translator] list-models failed:', err)
    }
    return out
  }

  async function handleTranslate(payload) {
    const raw = payload && typeof payload.text === 'string' ? payload.text : ''
    const text = raw.trim().slice(0, MAX_TEXT_CHARS)
    if (!text) return { ok: false, error: { code: 'empty', message: 'nothing to translate' } }
    const clientId = runToken(payload && payload.clientId)
    const requested = runToken(payload && payload.runId)
    const retry = payload.retry === true
    // Metering comes first: an over-budget caller must not retire its own
    // in-flight run, and must not reach a provider at all.
    if (rateLimited(clientId)) {
      return { ok: false, error: { code: 'rate-limited', message: 'too many requests (' + RATE_MAX + ' per ' + Math.round(RATE_WINDOW_MS / 1000) + 's)' } }
    }
    // Re-using a token supersedes the earlier run under it.
    if (requested) cancelRun(runs.get(requested))
    // One live run per client: a browser that starts a second translation is
    // abandoning its first, so retire it — except the runs it asked to keep.
    // A pinned card is exactly that promise, and it must survive the next
    // translation the reader starts. Runs without a client id (a legacy caller,
    // or a payload that omitted it) are never touched here, which is what used
    // to let one tab kill another tab's translation.
    const keep = new Set(Array.isArray(payload.keep) ? payload.keep.filter(id => runToken(id) !== null) : [])
    if (clientId) {
      for (const [id, other] of runs) {
        if (id !== requested && other.clientId === clientId && !keep.has(id)) cancelRun(other)
      }
    }
    const runId = requested || ('legacy-' + (++legacySeq))
    const run = { runId, clientId, cancelled: false }
    runs.set(runId, run)
    const c = readConfig(config)
    const target = pickTarget(text, c, payload)
    // One deadline for whichever engine answers, armed before any lookup: a
    // provider whose model list stalls is capped by the same clock as a slow
    // stream, and a cancel tears down both through `run.abort`.
    const controller = new AbortController()
    let timedOut = false
    run.signal = controller.signal
    run.abort = () => controller.abort()
    const disposeTimeout = ctx.timeout(() => { timedOut = true; controller.abort() }, c.timeoutMs)
    const cancelled = () => ({ ok: false, error: { code: 'cancelled', message: 'cancelled', runId } })
    try {
      // Engine `api`: the keyless public chain, no model lookup at all — it
      // must work on a harness with no LLM provider configured.
      if (c.engine === 'api') {
        const key = cacheKey(['api', target, text, c.apiProvider])
        const cached = retry ? null : cacheGet(key)
        if (cached) return { ok: true, value: { ...cached, runId, cached: true } }
        try {
          const result = await translateFree(text, target, {
            provider: c.apiProvider,
            timeoutMs: c.timeoutMs,
            signal: controller.signal,
            // An explicit user retry ignores every provider cooldown: a chain
            // that is merely benched after a transient blip must stay reachable
            // by hand instead of failing instantly without a single request —
            // but no more often than the retry floor allows.
            force: retry && forceAllowed(clientId),
          })
          if (run.cancelled) return cancelled()
          const value = {
            target,
            text: result.text,
            engine: 'api',
            provider: result.provider,
            // A keyless endpoint can also hand back a dictionary — 音标, 词性
            // groups, 双语例句 — and the card renders it under the translation
            // instead of making the reader open a second tab for it.
            dict: result.dict && typeof result.dict === 'object' ? result.dict : undefined,
            // Every provider echoed the input: the card says so rather than
            // presenting the source as a translation.
            untranslated: result.untranslated === true,
            // The chain works on a capped slice; the card has to say so, or a
            // long passage comes back half-translated and looks complete.
            truncated: raw.trim().length > MAX_TEXT_CHARS,
          }
          // An all-echo answer says something about the moment (a benched
          // provider, a direction nobody serves), not about the text, so only a
          // real answer is worth keeping.
          if (!value.untranslated) cacheSet(key, value)
          return { ok: true, value: { ...value, runId } }
        } catch (err) {
          if (run.cancelled) return cancelled()
          if (timedOut) throw timeoutError(c.timeoutMs)
          throw err
        }
      }
      let picked
      try {
        picked = await raceAbort(pickModel(c), controller.signal)
      } catch (err) {
        if (run.cancelled) return cancelled()
        if (timedOut) throw timeoutError(c.timeoutMs)
        throw err
      }
      if (run.cancelled) return cancelled()
      if (timedOut) throw timeoutError(c.timeoutMs)
      const key = cacheKey(['model', target, text, picked.provider, picked.model, c.reasoningEffort, c.maxTokens, c.temperature])
      const cached = retry ? null : cacheGet(key)
      if (cached) return { ok: true, value: { ...cached, runId, cached: true } }
      const result = await translateWithModel(picked.provider, picked.model, text, target, c, run, controller, () => timedOut)
      if (result.cancelled) return cancelled()
      const value = { target, text: result.text, engine: 'model', truncated: result.truncated === true, model: picked.model, reasoningEffort: c.reasoningEffort, tokens: result.tokens }
      cacheSet(key, value)
      return { ok: true, value: { ...value, runId } }
    } catch (err) {
      // Error codes are the locale-independent contract; the browser card
      // renders them through its own zh/en dictionary.
      const code = err && typeof err.code === 'string' ? err.code : 'translate-failed'
      const message = err instanceof Error ? err.message : String(err)
      const detail = err && typeof err.detail !== 'undefined' ? err.detail : undefined
      return { ok: false, error: { code, message, runId, ...(detail !== undefined ? { detail } : {}) } }
    } finally {
      disposeTimeout()
      if (runs.get(runId) === run) runs.delete(runId)
    }
  }

  /**
   * Cancel one run by the token its owner minted.
   *
   * The token is the whole identity: a client only ever cancels the run it
   * named, and a run that carries a client id is only cancelled by that same
   * client. A payload with no token is a browser still running the previous
   * bundle, and keeps the old counter-matched behaviour.
   */
  function handleCancel(payload) {
    const runId = runToken(payload && payload.runId)
    if (runId) {
      const run = runs.get(runId)
      const owner = payload && typeof payload.clientId === 'string' ? payload.clientId : null
      if (run && run.clientId && run.clientId !== owner) return { ok: true, value: null }
      cancelRun(run)
      return { ok: true, value: null }
    }
    if (payload && typeof payload.seq === 'number' && payload.seq === legacySeq) {
      for (const [id, run] of runs) {
        if (id.startsWith('legacy-')) { cancelRun(run); break }
      }
    }
    return { ok: true, value: null }
  }

  async function handleListModels() {
    return { ok: true, value: await enumerateModels() }
  }

  async function handleDefaultModel() {
    try {
      const model = defaultModel()
      const sel = model && model.currentSelection()
      if (sel && sel.provider && sel.model) return { ok: true, value: { provider: sel.provider, model: sel.model } }
    } catch (err) {
      console.error('[translator] currentSelection failed:', err)
    }
    const providers = llm.listProviders()
    if (providers && providers.length > 0) {
      const models = await withDeadline(llm.listModels(providers[0].id), METADATA_TIMEOUT_MS, [])
      if (models && models.length > 0) return { ok: true, value: { provider: providers[0].id, model: models[0].id } }
    }
    return { ok: true, value: null }
  }

  async function payloadOf(request) {
    try {
      const body = await request.json()
      return body !== null && typeof body === 'object' ? body : {}
    } catch {
      return {}
    }
  }

  /**
   * Exact Fetch routes on the shared `/api` channel. `ctx.inject` keeps the
   * plugin active in profiles without a carrier and unmounts every route with
   * the child context, so an unload leaves nothing registered.
   */
  ctx.inject(['connection'], (child) => {
    const routes = [
      ['/translate', async (request) => json(await handleTranslate(await payloadOf(request)))],
      ['/translate-cancel', async (request) => json(handleCancel(await payloadOf(request)))],
      ['/list-models', async () => json(await handleListModels())],
      ['/default-model', async () => json(await handleDefaultModel())],
    ]
    for (const [suffix, handler] of routes) {
      child.connection.fetch.register({
        path: API_BASE + suffix,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: handler,
      })
    }
  })
}
