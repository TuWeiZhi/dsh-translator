// dsh-translator host regression suite. Run: npm test  (node --test tests/)
//
// Drives the packaged Host half end to end over the exact Connection Fetch
// routes it registers on the authenticated `/api` channel, mocking
// ctx.llm/ctx.connection like scripts/host-sim.mjs does.
//
// The asserted BEHAVIOR (config resolution, live config edits, direction
// detection, error codes, cancellation, timeout) is the frozen contract.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply as applyPlugin, Config, inject as pluginInject, name as pluginName, LIMITS, RATE_MAX, MAX_TEXT_CHARS } from '../src/index.js'
import { resetProviderHealth } from '../src/free-translate.js'

/** The shared cross-copy volatile write symbol (cosmokit's protocol). */
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')

/** Current value behind volatile references, recursively. */
function plain(value) {
  if (value !== null && typeof value === 'object' && VOLATILE_WRITE in value) return plain(value.get())
  if (Array.isArray(value)) return value.map(plain)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, plain(child)]))
  }
  return value
}

/** Build a mock context + captured exact Fetch routes. */
function makeCtx(llm = makeFakeLlm(), config = undefined) {
  const calls = []
  const routes = new Map()
  const injections = []
  let llmTarget = llm
  const ctx = {
    get: (name) => name === 'agentDefaultModel' ? null : undefined,
    timeout: (cb, ms) => { const t = setTimeout(cb, ms); return () => clearTimeout(t) },
    effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
    inject: (deps, callback) => {
      injections.push(deps)
      callback({
        connection: {
          fetch: {
            register: (route) => { routes.set(route.path, route); return async () => { routes.delete(route.path) } },
          },
        },
      })
    },
    llm: {
      listProviders: () => llmTarget.listProviders(),
      listModels: (p) => llmTarget.listModels(p),
      resolveModelInfo: (p, m) => llmTarget.resolveModelInfo ? llmTarget.resolveModelInfo(p, m) : Promise.reject(new Error('no info')),
      stream: (o) => { calls.push(o); return llmTarget.stream(o) },
    },
  }
  applyPlugin(ctx, config)
  return { ctx, routes, calls, injections }
}

function makeFakeLlm() {
  return {
    listProviders: () => [{ id: 'test-provider', name: 'Test' }],
    listModels: async () => [{ id: 'test-model' }],
    stream: () => (async function* () {
      yield { type: 'text-delta', index: 0, text: '模型翻译结果' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })(),
  }
}

/** Drive one exact Fetch route with a JSON body. */
async function hit(routes, path, payload) {
  const response = await start(routes, path, payload)
  return { status: response.status, headers: response.headers, body: response.body }
}

/**
 * Kick off one route call without awaiting it, so it can be cancelled while it
 * is still in flight. `hit` is the awaiting form of the same thing.
 */
function start(routes, path, payload) {
  const route = routes.get(path)
  assert.ok(route !== undefined, 'route ' + path + ' is registered')
  const request = new Request('http://127.0.0.1:3080' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return route.fetch(request).then(async response => ({
    status: response.status,
    headers: response.headers,
    body: await response.json(),
  }))
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/** A model engine whose stream answers slowly, so a cancel has a target. */
function slowLlm(reply = 'a', delay = 300) {
  const llm = makeFakeLlm()
  llm.stream = () => (async function* () {
    yield { type: 'text-delta', index: 0, text: reply }
    await sleep(delay)
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
  return llm
}


const TRANSLATE = '/api/translator/translate'

/**
 * Serve the public provider endpoints from a fake `fetch` while `run` executes.
 *
 * The `api` engine talks to the outside world itself, so the only way to drive
 * it without a network is to stand in for `fetch`. `handler(url)` answers with
 * `{ json }`, `{ text }`, or a falsy value for "no route". The provider health
 * map is reset on both sides so one case's cooldowns cannot leak into another.
 */
async function withFetch(handler, run) {
  const original = globalThis.fetch
  const seen = []
  resetProviderHealth()
  globalThis.fetch = async (url, init) => {
    const href = String(url)
    seen.push(href)
    const reply = handler(href, init)
    if (!reply) return new Response('not found', { status: 404 })
    if (reply.text !== undefined) return new Response(reply.text, { status: reply.status || 200 })
    return new Response(JSON.stringify(reply.json), {
      status: reply.status || 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    return await run(seen)
  } finally {
    globalThis.fetch = original
    resetProviderHealth()
  }
}

/** A Bing translator page whose signature markers the parser can read. */
const BING_PORTAL = '<html>IG:"ABCDEF0123456789"'
  + '<div data-iid="translator.5023">'
  + 'var params_AbusePreventionHelper = [1700000000000,"bing-token",3600000];</html>'

test('Config schema: defaults filled, invalid values rejected', () => {
  assert.equal(pluginName, 'dsh-translator')
  assert.deepEqual([...pluginInject].sort(), ['llm', 'timer'])
  const cfg = plain(Config({}))
  // The keyless API engine is the default: a fresh install translates with
  // nothing configured at all.
  assert.equal(cfg.engine, 'api')
  assert.equal(cfg.apiProvider, 'auto')
  assert.equal(cfg.primaryLanguage, 'zh-Hans')
  assert.equal(cfg.reasoningEffort, 'low')
  assert.equal(cfg.timeoutMs, 30000)
  assert.equal(cfg.maxTokens, 1024)
  assert.equal(cfg.temperature, 0.3)
  assert.deepEqual(cfg.customModel, { provider: '', model: '' })
  assert.throws(() => Config({ reasoningEffort: 'bogus' }))
  assert.throws(() => Config({ timeoutMs: 100 }))
  assert.throws(() => Config({ engine: 'bogus' }))
  assert.throws(() => Config({ apiProvider: 'bogus' }))
})

test('Config schema: every apiProvider value the client offers is accepted', () => {
  for (const id of ['auto', 'tencent', 'bing', 'volcengine', 'mymemory']) {
    assert.equal(plain(Config({ apiProvider: id })).apiProvider, id)
  }
})

test('Config schema: the numeric fields carry an upper bound, not just a floor', () => {
  // Without a ceiling a value over the 32-bit setTimeout limit overflows the
  // harness timer and fires after ~1 ms, so every translation "times out"
  // instantly instead of waiting.
  assert.equal(LIMITS.timeoutMs.max, 600000)
  assert.equal(LIMITS.maxTokens.max, 32768)
  assert.throws(() => Config({ timeoutMs: LIMITS.timeoutMs.max + 1 }))
  assert.throws(() => Config({ maxTokens: LIMITS.maxTokens.max + 1 }))
  assert.throws(() => Config({ timeoutMs: 3000000000 }))
  assert.throws(() => Config({ temperature: LIMITS.temperature.max + 0.1 }))
  assert.doesNotThrow(() => Config({ timeoutMs: LIMITS.timeoutMs.max, maxTokens: LIMITS.maxTokens.max }))
})

test('apply registers exact authenticated /api routes through ctx.connection', () => {
  const { routes, injections } = makeCtx()
  assert.deepEqual(injections, [['connection']])
  assert.deepEqual([...routes.keys()].sort(), [
    '/api/translator/default-model',
    '/api/translator/list-models',
    '/api/translator/translate',
    '/api/translator/translate-cancel',
  ].sort())
  for (const route of routes.values()) {
    assert.deepEqual(route.methods, ['POST'])
    assert.equal(route.requestBody, 'buffered')
    assert.equal(typeof route.fetch, 'function')
  }
  // The unauthenticated webserver prefix of the 0.2 line is gone.
  assert.equal(routes.has('/translator/api'), false)
})

test('translate: success envelope + stream parameters', async () => {
  const { routes, calls } = makeCtx(undefined, Config({ engine: 'model' }))
  const out = await hit(routes, TRANSLATE, { text: 'Hello world' })
  assert.equal(out.status, 200)
  assert.match(out.headers.get('content-type'), /application\/json/)
  assert.equal(out.body.ok, true)
  const v = out.body.value
  assert.equal(v.target, 'zh-Hans') // no CJK → translate into primary language
  assert.equal(v.text, '模型翻译结果')
  assert.equal(v.engine, 'model')
  assert.equal(v.truncated, false)
  assert.equal(v.model, 'test-model')
  assert.equal(typeof v.tokens.input, 'number')
  assert.equal(typeof v.tokens.output, 'number')
  const opts = calls[0]
  assert.equal(opts.provider, 'test-provider')
  assert.equal(opts.model, 'test-model')
  assert.equal(opts.maxTokens, 1024)
  assert.equal(typeof opts.system, 'string')
  assert.ok(opts.messages[0].content[0].text === 'Hello world')
})

test('translate: direction detection (CJK text → en)', async () => {
  const { routes } = makeCtx(undefined, Config({ engine: 'model' }))
  const out = await hit(routes, TRANSLATE, { text: '你好世界' })
  assert.equal(out.body.value.target, 'en')
})

test('translate: empty text rejected', async () => {
  const { routes } = makeCtx()
  const out = await hit(routes, TRANSLATE, { text: '' })
  assert.equal(out.body.ok, false)
  assert.equal(out.body.error.code, 'empty')
})

test('translate: long text capped at 2000 chars', async () => {
  const { routes, calls } = makeCtx(undefined, Config({ engine: 'model' }))
  await hit(routes, TRANSLATE, { text: 'x'.repeat(3000) })
  assert.equal(calls[0].messages[0].content[0].text.length, 2000)
})

test('translate: provider failure → model-error code + detail', async () => {
  const failing = makeFakeLlm()
  failing.stream = () => (async function* () {
    yield { type: 'finish', reason: { kind: 'error', failure: { message: 'provider exploded', code: 'X' } } }
  })()
  const { routes } = makeCtx(failing, Config({ engine: 'model' }))
  const out = await hit(routes, TRANSLATE, { text: 'hello' })
  assert.equal(out.body.ok, false)
  assert.equal(out.body.error.code, 'model-error')
  assert.equal(out.body.error.detail, 'provider exploded')
})

test('translate: reasoning effort stripped when the model cannot support it', async () => {
  const llm = makeFakeLlm()
  llm.resolveModelInfo = async () => ({ reasoning: { efforts: [{ id: 'low' }] } })
  const c = makeCtx(llm, Config({ engine: 'model', reasoningEffort: 'max' }))
  const out = await hit(c.routes, TRANSLATE, { text: 'hello' })
  assert.equal(out.body.ok, true)
  assert.equal(c.calls[0].reasoningEffort, undefined)
})

test('translate-cancel: seq-matched cancel on an in-flight run', async () => {
  const slow = makeFakeLlm()
  slow.stream = () => (async function* () {
    yield { type: 'text-delta', index: 0, text: 'a' }
    await new Promise(res => setTimeout(res, 300))
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
  const { routes } = makeCtx(slow, Config({ engine: 'model' }))
  const pending = routes.get(TRANSLATE).fetch(new Request('http://127.0.0.1:3080' + TRANSLATE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'hello' }),
  }))
  await new Promise(res => setTimeout(res, 50))
  const cancelOut = await hit(routes, '/api/translator/translate-cancel', { seq: 1 })
  assert.equal(cancelOut.body.ok, true)
  assert.equal(cancelOut.body.value, null)
  await pending
})

test('list-models enumerates provider/model pairs', async () => {
  const { routes } = makeCtx()
  const out = await hit(routes, '/api/translator/list-models', {})
  assert.equal(out.body.ok, true)
  assert.ok(Array.isArray(out.body.value))
  assert.equal(out.body.value[0].provider, 'test-provider')
  assert.equal(out.body.value[0].model, 'test-model')
})

test('default-model falls back to first provider/model', async () => {
  const { routes } = makeCtx()
  const out = await hit(routes, '/api/translator/default-model', {})
  assert.equal(out.body.ok, true)
  assert.equal(out.body.value.provider, 'test-provider')
})

test('row config (cordis.yml) is applied', async () => {
  const { routes, calls } = makeCtx(undefined, Config({ engine: 'model', maxTokens: 512, reasoningEffort: 'high', timeoutMs: 45000 }))
  await hit(routes, TRANSLATE, { text: 'hello' })
  assert.equal(calls[0].maxTokens, 512)
  assert.equal(calls[0].reasoningEffort, 'high')
})

test('a live settings edit updates an in-flight-less plugin without a reload', async () => {
  const config = Config({ engine: 'model', maxTokens: 512 })
  const { routes, calls } = makeCtx(undefined, config)
  await hit(routes, TRANSLATE, { text: 'hello' })
  assert.equal(calls[0].maxTokens, 512)
  // What the loader does on a settings write: update the reference in place.
  config.maxTokens[VOLATILE_WRITE](2048)
  await hit(routes, TRANSLATE, { text: 'hello again' })
  assert.equal(calls[1].maxTokens, 2048)
})

test('an unregistered method has no route (404 from the shared channel)', () => {
  const { routes } = makeCtx()
  assert.equal(routes.has('/api/translator/get-config'), false)
  assert.equal(routes.has('/api/translator/bogus'), false)
})

test('stalled stream + timeout: the abort signal settles the handler', async () => {
  // A provider that never yields chunks and never fails on its own: without
  // the AbortSignal ride-along the for-await would block forever past the
  // timeout. The fake generator rejects on `signal` abort, exactly like a
  // provider fetch that honors GenerateOptions.signal.
  const stalled = makeFakeLlm()
  stalled.stream = (opts) => (async function* () {
    await new Promise((resolve, reject) => {
      if (opts.signal) opts.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
      })
    })
    yield { type: 'text-delta', index: 0, text: 'unreachable' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
  const { routes } = makeCtx(stalled, Config({ engine: 'model', timeoutMs: 1200 }))
  const started = Date.now()
  const out = await hit(routes, TRANSLATE, { text: 'hello' })
  assert.equal(out.body.ok, false)
  assert.equal(out.body.error.code, 'timeout')
  assert.ok(Date.now() - started < 4000, 'handler must settle shortly after the timeout')
})

test('cancel aborts the underlying stream instead of leaving it running', async () => {
  let aborted = false
  const slow = makeFakeLlm()
  slow.stream = (opts) => (async function* () {
    try {
      await new Promise((resolve, reject) => {
        if (opts.signal) opts.signal.addEventListener('abort', () => { aborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) })
      })
    } catch { /* settle the iterator */ }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
  const { routes } = makeCtx(slow, Config({ engine: 'model' }))
  const pending = routes.get(TRANSLATE).fetch(new Request('http://127.0.0.1:3080' + TRANSLATE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'hello' }),
  }))
  await new Promise(res => setTimeout(res, 100))
  await hit(routes, '/api/translator/translate-cancel', { seq: 1 })
  await pending
  assert.equal(aborted, true, 'the underlying stream must be aborted on cancel')
})

// ---------------------------------------------------------------------------
// The keyless `api` engine. `fetch` is faked; nothing here reaches the network.
// ---------------------------------------------------------------------------

test('translate: the api engine is the default and needs no model at all', async () => {
  const { routes, calls } = makeCtx()
  const out = await withFetch((href) => {
    if (href.includes('transmart.qq.com')) {
      return { json: { header: { ret_code: 'succ' }, auto_translation: ['你好，世界'] } }
    }
    return null
  }, () => hit(routes, TRANSLATE, { text: 'Hello world' }))

  assert.equal(out.body.ok, true)
  assert.equal(out.body.value.engine, 'api')
  assert.equal(out.body.value.provider, 'tencent')
  assert.equal(out.body.value.text, '你好，世界')
  assert.equal(out.body.value.target, 'zh-Hans')
  // No model was picked and no stream opened: the free path is independent of
  // whatever the harness happens to have configured.
  assert.equal(calls.length, 0)
})

test('translate: the api chain falls over to the next provider', async () => {
  const { routes } = makeCtx()
  const out = await withFetch((href) => {
    if (href.includes('transmart.qq.com')) return { status: 500, text: 'tencent down' }
    if (href.includes('bing.com/translator')) return { text: BING_PORTAL }
    if (href.includes('ttranslatev3')) return { json: [{ translations: [{ text: '你好，世界' }] }] }
    return null
  }, () => hit(routes, TRANSLATE, { text: 'Hello world' }))

  assert.equal(out.body.ok, true)
  assert.equal(out.body.value.provider, 'bing')
  assert.equal(out.body.value.text, '你好，世界')
})

test('translate: a provider that failed is benched for the following request', async () => {
  const { routes } = makeCtx()
  await withFetch((href) => {
    if (href.includes('transmart.qq.com')) return { status: 500, text: 'tencent down' }
    if (href.includes('bing.com/translator')) return { text: BING_PORTAL }
    if (href.includes('ttranslatev3')) return { json: [{ translations: [{ text: '你好' }] }] }
    return null
  }, async (seen) => {
    const first = await hit(routes, TRANSLATE, { text: 'Hello world' })
    const second = await hit(routes, TRANSLATE, { text: 'Hello again' })
    assert.equal(first.body.value.provider, 'bing')
    assert.equal(second.body.value.provider, 'bing')
    // The dead endpoint is not retried on the very next translation.
    assert.equal(seen.filter(href => href.includes('transmart.qq.com')).length, 1)
    // The portal signature is minted once and then reused.
    assert.equal(seen.filter(href => href.endsWith('/translator')).length, 1)
  })
})

test('translate: a chain where every provider echoes returns the source, marked untranslated', async () => {
  // Measured provider behaviour: an unsupported direction still answers 200
  // with the source text. That is not a failure — nothing is down — so the
  // chain returns the source with `untranslated` and the card says so, instead
  // of either claiming a translation that is not one or blaming the endpoints.
  const { routes } = makeCtx()
  const out = await withFetch((href) => {
    if (href.includes('translate.googleapis.com')) {
      return { json: { sentences: [{ trans: 'Hello world' }], src: 'en' } }
    }
    if (href.includes('transmart.qq.com')) {
      return { json: { header: { ret_code: 'succ' }, auto_translation: ['Hello world'] } }
    }
    if (href.includes('bing.com/translator')) return { text: BING_PORTAL }
    if (href.includes('ttranslatev3')) return { json: [{ translations: [{ text: 'Hello world' }] }] }
    if (href.includes('volcengine')) return { json: { base_resp: { status_code: 0 }, translation: 'Hello world' } }
    if (href.includes('mymemory')) {
      return { json: { responseStatus: 200, responseData: { translatedText: 'Hello world' } } }
    }
    return null
  }, () => hit(routes, TRANSLATE, { text: 'Hello world' }))

  assert.equal(out.body.ok, true)
  assert.equal(out.body.value.untranslated, true)
  assert.equal(out.body.value.text, 'Hello world', 'the reader gets their own text, labelled')
  assert.equal(out.body.value.provider, null)
})

test('translate: one echoed provider still falls through to the next', async () => {
  const { routes } = makeCtx()
  const out = await withFetch((href) => {
    if (href.includes('transmart.qq.com')) {
      return { json: { header: { ret_code: 'succ' }, auto_translation: ['Hello world'] } }
    }
    if (href.includes('bing.com/translator')) return { text: BING_PORTAL }
    if (href.includes('ttranslatev3')) return { json: [{ translations: [{ text: '你好，世界' }] }] }
    return null
  }, () => hit(routes, TRANSLATE, { text: 'Hello world' }))

  assert.equal(out.body.ok, true)
  assert.equal(out.body.value.provider, 'bing')
  assert.equal(out.body.value.text, '你好，世界')
  assert.equal(out.body.value.untranslated, false)
})

test('translate: an echo mixed with a real failure is still a failure', async () => {
  // Only an all-echo chain means "nothing to translate". One dead endpoint
  // means the chain never got a usable answer, so it must not pass the source
  // off as one.
  const { routes } = makeCtx()
  const out = await withFetch((href) => {
    if (href.includes('transmart.qq.com')) {
      return { json: { header: { ret_code: 'succ' }, auto_translation: ['Hello world'] } }
    }
    return { status: 503, text: 'down' }
  }, () => hit(routes, TRANSLATE, { text: 'Hello world' }))

  assert.equal(out.body.ok, false)
  assert.equal(out.body.error.code, 'api-failed')
  assert.ok(out.body.error.detail.some(a => a.reason === 'echo'))
  assert.ok(out.body.error.detail.some(a => a.reason === 'failed'))
})

test('translate: digits and emoji echoed back are not shown as a translation', async () => {
  // These used to slip past the guard, which also required a letter.
  const { routes } = makeCtx()
  for (const text of ['12345', '🎉']) {
    const result = await withFetch((href) => {
      if (href.includes('transmart.qq.com')) {
        return { json: { header: { ret_code: 'succ' }, auto_translation: [text] } }
      }
      return { status: 503, text: 'down' }
    }, () => hit(routes, TRANSLATE, { text }))
    assert.equal(result.body.ok, false, `${text}: an echo among failures must not become a result`)
    assert.ok(result.body.error.detail.some(a => a.reason === 'echo'), text)
  }
})

test('translate: every provider failing reports api-failed, never a model code', async () => {
  const { routes } = makeCtx()
  const out = await withFetch(() => ({ status: 503, text: 'down' }),
    () => hit(routes, TRANSLATE, { text: 'Hello world' }))

  assert.equal(out.body.ok, false)
  assert.equal(out.body.error.code, 'api-failed')
  assert.ok(Array.isArray(out.body.error.detail), 'the attempts are reported for diagnosis')
  assert.ok(out.body.error.detail.length >= 2)
})

test('translate: a benched chain says so, and re-asks nobody', async () => {
  const { routes } = makeCtx()
  await withFetch(() => ({ status: 503, text: 'down' }), async (seen) => {
    const first = await hit(routes, TRANSLATE, { text: 'Hello world' })
    assert.equal(first.body.error.code, 'api-failed')
    const afterFirst = seen.length

    const second = await hit(routes, TRANSLATE, { text: 'Hello again' })
    assert.equal(second.body.error.code, 'api-failed')
    // Every record carries the locale-independent reason the card renders.
    assert.ok(second.body.error.detail.every(a => a.reason === 'benched'),
      JSON.stringify(second.body.error.detail))
    // The point of the cooldown: not one request goes out the second time.
    assert.equal(seen.length, afterFirst)
  })
})

test('translate: retry forces past every cooldown', async () => {
  const { routes } = makeCtx()
  let healthy = false
  await withFetch((href) => {
    if (healthy && href.includes('transmart.qq.com')) {
      return { json: { header: { ret_code: 'succ' }, auto_translation: ['你好'] } }
    }
    return { status: 503, text: 'down' }
  }, async (seen) => {
    const first = await hit(routes, TRANSLATE, { text: 'Hello world' })
    assert.equal(first.body.error.code, 'api-failed')
    const afterFirst = seen.length

    // The network heals, but every provider is still benched.
    healthy = true
    const stillBenched = await hit(routes, TRANSLATE, { text: 'Hello world' })
    assert.equal(stillBenched.body.error.code, 'api-failed')
    assert.equal(seen.length, afterFirst)

    // An explicit retry ignores the cooldown and reaches the network again.
    const forced = await hit(routes, TRANSLATE, { text: 'Hello world', retry: true })
    assert.equal(forced.body.ok, true)
    assert.equal(forced.body.value.provider, 'tencent')
    assert.ok(seen.length > afterFirst, 'the forced retry actually hit the network')
  })
})

test('translate: mymemory is skipped for text beyond its 500-byte cap', async () => {
  const { routes } = makeCtx()
  await withFetch((href) => {
    if (href.includes('mymemory')) return { json: { responseStatus: 200, responseData: { translatedText: '不应该被调用' } } }
    return { status: 503, text: 'down' }
  }, async (seen) => {
    await hit(routes, TRANSLATE, { text: 'x'.repeat(600) })
    assert.equal(seen.some(href => href.includes('mymemory')), false)
  })
})

test('translate: a hanging chain still settles on the api timeout', async () => {
  const { routes } = makeCtx(undefined, Config({ engine: 'api', timeoutMs: 1000 }))
  const original = globalThis.fetch
  resetProviderHealth()
  globalThis.fetch = (url, init) => new Promise((resolve, reject) => {
    if (init && init.signal) {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }
  })
  try {
    const started = Date.now()
    const out = await hit(routes, TRANSLATE, { text: 'Hello world' })
    assert.equal(out.body.ok, false)
    // The overall cap surfaces as the same code the model engine reports.
    assert.equal(out.body.error.code, 'timeout')
    assert.ok(Date.now() - started < 5000, 'the handler must settle at its own timeout')
  } finally {
    globalThis.fetch = original
    resetProviderHealth()
  }
})

// ---------------------------------------------------------------------------
// Run identity. The browser names each run; the Host cancels by that token and
// keeps one live run per client, never one per process.
//
// These cases exist because the counter-matched protocol they replace only
// worked while a single tab ran and nobody ever reloaded: after a page reload
// the two counters drifted forever, so cancel became a silent no-op.
// ---------------------------------------------------------------------------

const RUN = (letter) => 'run-' + letter.repeat(12)
const CLIENT = (letter) => 'client-' + letter.repeat(8)

test('translate: the response names the run the caller minted', async () => {
  const { routes } = makeCtx(undefined, Config({ engine: 'model' }))
  const out = await hit(routes, TRANSLATE, { text: 'hello', runId: RUN('a'), clientId: CLIENT('a') })
  assert.equal(out.body.ok, true)
  assert.equal(out.body.value.runId, RUN('a'))
})

test('translate-cancel: a run token cancels its run without any counter agreement', async () => {
  // The pairing that used to break: this is the *second* request of the
  // process, so an old-style cancel would have had to guess a counter value.
  const { routes } = makeCtx(slowLlm(), Config({ engine: 'model' }))
  await hit(routes, TRANSLATE, { text: 'first' })
  const pending = start(routes, TRANSLATE, { text: 'second', runId: RUN('b'), clientId: CLIENT('b') })
  await sleep(50)
  const cancelOut = await hit(routes, '/api/translator/translate-cancel', { runId: RUN('b'), clientId: CLIENT('b') })
  assert.equal(cancelOut.body.ok, true)
  assert.equal(cancelOut.body.value, null)
  const out = await pending
  assert.equal(out.body.ok, false)
  assert.equal(out.body.error.code, 'cancelled')
})

test('translate-cancel: a run token that names nothing is a harmless no-op', async () => {
  const { routes } = makeCtx(slowLlm(), Config({ engine: 'model' }))
  const pending = start(routes, TRANSLATE, { text: 'hello', runId: RUN('c'), clientId: CLIENT('c') })
  await sleep(50)
  const cancelOut = await hit(routes, '/api/translator/translate-cancel', { runId: 'run-' + 'z'.repeat(12), clientId: CLIENT('c') })
  assert.equal(cancelOut.body.ok, true)
  const out = await pending
  assert.equal(out.body.ok, true, 'the untouched run still finishes')
})

test('translate-cancel: another client cannot cancel a run it does not own', async () => {
  const { routes } = makeCtx(slowLlm(), Config({ engine: 'model' }))
  const pending = start(routes, TRANSLATE, { text: 'hello', runId: RUN('d'), clientId: CLIENT('d') })
  await sleep(50)
  // The token is known (it is not a secret), but the owner is not this caller.
  await hit(routes, '/api/translator/translate-cancel', { runId: RUN('d'), clientId: CLIENT('x') })
  const out = await pending
  assert.equal(out.body.ok, true, 'the owner keeps its result')
})

test('translate: two clients translate at once without cancelling each other', async () => {
  // The single-flight bug: one process-wide slot meant the second tab aborted
  // the first one's stream and answered it `cancelled`.
  const { routes, calls } = makeCtx(slowLlm(), Config({ engine: 'model' }))
  const first = start(routes, TRANSLATE, { text: 'first', runId: RUN('e'), clientId: CLIENT('e') })
  await sleep(30)
  const second = start(routes, TRANSLATE, { text: 'second', runId: RUN('f'), clientId: CLIENT('f') })
  const [a, b] = await Promise.all([first, second])
  assert.equal(a.body.ok, true, JSON.stringify(a.body))
  assert.equal(b.body.ok, true, JSON.stringify(b.body))
  assert.equal(calls.length, 2, 'both streams reached the provider')
})

test('translate: a run the client asks to keep survives the next translation', async () => {
  // The pin promise, enforced where it can actually be broken: the Host's own
  // one-live-run-per-client rule used to abort a pinned card's run the moment
  // the reader translated something else.
  const { routes } = makeCtx(slowLlm('pinned', 200), Config({ engine: 'model' }))
  const clientId = CLIENT('k')
  const pinned = start(routes, TRANSLATE, { text: 'pinned', runId: RUN('k'), clientId })
  await sleep(30)
  const next = await hit(routes, TRANSLATE, { text: 'next', runId: RUN('l'), clientId, keep: [RUN('k')] })
  const pinnedOut = await pinned
  assert.equal(next.body.ok, true)
  assert.equal(pinnedOut.body.ok, true, 'the kept run was not superseded')
  assert.equal(pinnedOut.body.value.text, 'pinned')
})

test('translate: an unlisted run is superseded even when keep is present', async () => {
  // `keep` names runs, it does not disable the rule.
  const { routes } = makeCtx(slowLlm('first', 200), Config({ engine: 'model' }))
  const clientId = CLIENT('m')
  const first = start(routes, TRANSLATE, { text: 'first', runId: RUN('m'), clientId })
  await sleep(30)
  const second = await hit(routes, TRANSLATE, { text: 'second', runId: RUN('n'), clientId, keep: ['short'] })
  const firstOut = await first
  assert.equal(second.body.ok, true)
  assert.equal(firstOut.body.error.code, 'cancelled', 'a malformed keep entry keeps nothing')
})

test('translate: a client supersedes only its own earlier run', async () => {
  const { routes } = makeCtx(slowLlm(), Config({ engine: 'model' }))
  const mine1 = start(routes, TRANSLATE, { text: 'one', runId: RUN('g'), clientId: CLIENT('g') })
  await sleep(30)
  const theirs = start(routes, TRANSLATE, { text: 'theirs', runId: RUN('h'), clientId: CLIENT('h') })
  await sleep(10)
  const mine2 = start(routes, TRANSLATE, { text: 'two', runId: RUN('i'), clientId: CLIENT('g') })
  const [a, b, c] = await Promise.all([mine1, theirs, mine2])
  assert.equal(a.body.error.code, 'cancelled', 'the same client\'s earlier run is retired')
  assert.equal(b.body.ok, true, 'the other client is untouched')
  assert.equal(c.body.ok, true)
})

test('translate: a reloaded page cancels its own new run, not the previous page count', async () => {
  // What a freshly loaded page looks like: same browser, new client id, run
  // tokens that have nothing to do with any earlier request.
  const { routes } = makeCtx(slowLlm(), Config({ engine: 'model' }))
  await hit(routes, TRANSLATE, { text: 'before reload' })
  await hit(routes, TRANSLATE, { text: 'after reload' })
  const pending = start(routes, TRANSLATE, { text: 'current', runId: RUN('j'), clientId: CLIENT('j') })
  await sleep(50)
  const cancelOut = await hit(routes, '/api/translator/translate-cancel', { runId: RUN('j'), clientId: CLIENT('j') })
  assert.equal(cancelOut.body.ok, true)
  const out = await pending
  assert.equal(out.body.error.code, 'cancelled')
})

test('translate: a legacy payload with no run token still cancels by counter', async () => {
  // A browser still running the previously shipped bundle: no token, the old
  // seq-matched contract, and it must keep working across the upgrade.
  const { routes } = makeCtx(slowLlm(), Config({ engine: 'model' }))
  const pending = start(routes, TRANSLATE, { text: 'legacy' })
  await sleep(50)
  const cancelOut = await hit(routes, '/api/translator/translate-cancel', { seq: 1 })
  assert.equal(cancelOut.body.ok, true)
  const out = await pending
  assert.equal(out.body.error.code, 'cancelled')
})

test('translate: a hanging model lookup still settles on the configured deadline', async () => {
  // The provider/model lookup runs before any stream, so it has to ride the
  // same clock: otherwise a provider whose model list never answers leaves the
  // request — and the card — spinning forever.
  const llm = makeFakeLlm()
  llm.listModels = () => new Promise(() => {})
  const { routes } = makeCtx(llm, Config({ engine: 'model', timeoutMs: 1000 }))
  const started = Date.now()
  const out = await hit(routes, TRANSLATE, { text: 'hello' })
  assert.equal(out.body.ok, false)
  assert.equal(out.body.error.code, 'timeout')
  assert.ok(Date.now() - started < 5000, 'the lookup must not outlive the deadline')
})

test('translate: the reasoning-effort retry does not inherit the first attempt', async () => {
  // A provider that emits a delta and only then rejects the reasoning effort:
  // the retry must start from an empty accumulator, or the card shows
  // "A" + "B" as one translation.
  const llm = makeFakeLlm()
  let attempt = 0
  llm.resolveModelInfo = async () => ({ reasoning: { efforts: [{ id: 'low' }] } })
  llm.stream = () => (async function* () {
    attempt += 1
    if (attempt === 1) {
      yield { type: 'text-delta', index: 0, text: 'A' }
      throw new Error('reasoning effort "low" is not supported by this model')
    }
    yield { type: 'text-delta', index: 0, text: 'B' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
  const { routes } = makeCtx(llm, Config({ engine: 'model' }))
  const out = await hit(routes, TRANSLATE, { text: 'hello' })
  assert.equal(out.body.ok, true)
  assert.equal(out.body.value.text, 'B')
  assert.equal(attempt, 2, 'the retry actually happened')
})

test('translate: a malformed run token falls back to the legacy path', async () => {
  const { routes } = makeCtx(undefined, Config({ engine: 'model' }))
  const out = await hit(routes, TRANSLATE, { text: 'hello', runId: 'short', clientId: 'c' })
  assert.equal(out.body.ok, true)
  // The Host mints the id itself on this path, so it can still be cancelled
  // the old way by a caller that never learned a token.
  assert.match(out.body.value.runId, /^legacy-\d+$/)
})

test('readConfig clamps an out-of-range timeout instead of overflowing the timer', async () => {
  // A profile written by a schema that had no ceiling (or hand-edited) can
  // still carry an absurd value; the loader writes it straight into the
  // volatile reference, so readConfig is the last place it can be caught.
  const config = Config({ engine: 'model', timeoutMs: 30000 })
  const { routes, calls } = makeCtx(slowLlm('clamped', 60), config)
  config.timeoutMs[VOLATILE_WRITE](3000000000)
  const out = await hit(routes, TRANSLATE, { text: 'hello' })
  assert.equal(out.body.ok, true, JSON.stringify(out.body))
  assert.equal(calls.length, 1)
  assert.equal(out.body.value.text, 'clamped')
})

// ---------------------------------------------------------------------------
// Reuse and metering: a repeated selection is answered from the cache, and one
// page cannot turn the host into an amplifier pointed at the providers.
// ---------------------------------------------------------------------------

test('translate: an identical repeat is served from the cache', async () => {
  const { routes } = makeCtx()
  const result = await withFetch((href) => {
    if (href.includes('transmart.qq.com')) {
      return { json: { header: { ret_code: 'succ' }, auto_translation: ['你好，世界'] } }
    }
    return null
  }, async (seen) => {
    const first = await hit(routes, TRANSLATE, { text: 'Hello world' })
    const calls = seen.length
    const second = await hit(routes, TRANSLATE, { text: 'Hello world' })
    return { first, second, calls, after: seen.length }
  })

  assert.equal(result.first.body.value.cached, undefined)
  assert.equal(result.second.body.value.cached, true)
  assert.equal(result.second.body.value.text, '你好，世界')
  assert.equal(result.second.body.value.provider, 'tencent')
  assert.equal(result.after, result.calls, 'the second answer must not touch the network')
})

test('translate: an explicit retry skips the cache', async () => {
  // Retry means "ask again", so a cached answer must not swallow it.
  const { routes } = makeCtx()
  const result = await withFetch((href) => {
    if (href.includes('transmart.qq.com')) {
      return { json: { header: { ret_code: 'succ' }, auto_translation: ['你好'] } }
    }
    return null
  }, async (seen) => {
    await hit(routes, TRANSLATE, { text: 'Hello world' })
    const calls = seen.length
    const retried = await hit(routes, TRANSLATE, { text: 'Hello world', retry: true })
    return { calls, after: seen.length, retried }
  })

  assert.equal(result.retried.body.value.cached, undefined)
  assert.ok(result.after > result.calls, 'the retry reached the provider')
})

test('translate: changing a setting misses the cache instead of reusing the old answer', async () => {
  // The cache key carries the settings that produced the answer, so switching
  // the service must not hand back the previous service's translation.
  const config = Config({ engine: 'api', apiProvider: 'tencent' })
  const { routes } = makeCtx(undefined, config)
  await withFetch((href) => {
    if (href.includes('transmart.qq.com')) return { json: { header: { ret_code: 'succ' }, auto_translation: ['腾讯'] } }
    if (href.includes('bing.com/translator')) return { text: BING_PORTAL }
    if (href.includes('ttranslatev3')) return { json: [{ translations: [{ text: '必应' }] }] }
    return null
  }, async () => {
    const first = await hit(routes, TRANSLATE, { text: 'Hello world' })
    assert.equal(first.body.value.provider, 'tencent')
    config.apiProvider[VOLATILE_WRITE]('bing')
    const second = await hit(routes, TRANSLATE, { text: 'Hello world' })
    assert.equal(second.body.value.provider, 'bing')
    assert.equal(second.body.value.cached, undefined)
  })
})

test('translate: one client is metered, and the budget does not touch another', async () => {
  const { routes } = makeCtx(undefined, Config({ engine: 'model' }))
  const mine = 'client-' + 'r'.repeat(8)
  let limitedAt = null
  for (let i = 0; i <= RATE_MAX; i++) {
    const out = await hit(routes, TRANSLATE, { text: 'text ' + i, clientId: mine })
    if (out.body.ok === false) {
      assert.equal(out.body.error.code, 'rate-limited')
      limitedAt = i
      break
    }
  }
  assert.equal(limitedAt, RATE_MAX, 'the request after the budget is the one refused')
  const other = await hit(routes, TRANSLATE, { text: 'other', clientId: 'client-' + 's'.repeat(8) })
  assert.equal(other.body.ok, true, 'a different client still has its own budget')
})

test('translate: the retry button forces a benched chain, but no more often than the floor', async () => {
  const { routes } = makeCtx(undefined, Config({ engine: 'api' }))
  const clientId = 'client-' + 't'.repeat(8)
  await withFetch(() => ({ status: 503, text: 'down' }), async (seen) => {
    const first = await hit(routes, TRANSLATE, { text: 'Hello world', clientId })
    assert.equal(first.body.error.code, 'api-failed')
    const afterFirst = seen.length

    // The first explicit retry is allowed through every cooldown.
    const forced = await hit(routes, TRANSLATE, { text: 'Hello world', clientId, retry: true })
    assert.equal(forced.body.error.code, 'api-failed')
    const afterForced = seen.length
    assert.ok(afterForced > afterFirst, 'the first retry reaches the network')

    // A second one inside the floor is absorbed: every provider is still
    // benched, so it fails without a single request.
    const floored = await hit(routes, TRANSLATE, { text: 'Hello world', clientId, retry: true })
    assert.equal(floored.body.error.code, 'api-failed')
    assert.equal(seen.length, afterForced, 'the floor absorbs the immediate second retry')
  })
})

// ---------------------------------------------------------------------------
// What the free engine hands back on the way out.
// ---------------------------------------------------------------------------

test('translate: a truncated free-API request says so, and sends exactly the cap', async () => {
  const { routes } = makeCtx()
  let sent = null
  const out = await withFetch((href, init) => {
    if (href.includes('transmart.qq.com')) {
      sent = JSON.parse(init.body).source.text_list[0]
      return { json: { header: { ret_code: 'succ' }, auto_translation: ['你好'] } }
    }
    return null
  }, () => hit(routes, TRANSLATE, { text: 'x'.repeat(MAX_TEXT_CHARS + 500) }))

  assert.equal(out.body.ok, true)
  assert.equal(out.body.value.truncated, true)
  assert.equal(sent.length, MAX_TEXT_CHARS)
})

test('translate: a request inside the cap is not flagged as truncated', async () => {
  const { routes } = makeCtx()
  const out = await withFetch((href) => {
    if (href.includes('transmart.qq.com')) {
      return { json: { header: { ret_code: 'succ' }, auto_translation: ['你好'] } }
    }
    return null
  }, () => hit(routes, TRANSLATE, { text: 'Hello world' }))
  assert.equal(out.body.ok, true)
  assert.equal(out.body.value.truncated, false)
})

test('translate: MyMemory entities are decoded before the card sees them', async () => {
  // MyMemory escapes its output; `&quot;` on the card is a bug, not a quote.
  const { routes } = makeCtx()
  const out = await withFetch((href) => {
    if (href.includes('mymemory')) {
      return { json: { responseStatus: 200, responseData: { translatedText: '&quot;你好&quot; &#39;世界&#39; &amp; more' } } }
    }
    return { status: 503, text: 'down' }
  }, () => hit(routes, TRANSLATE, { text: 'Hello world' }))

  assert.equal(out.body.ok, true)
  assert.equal(out.body.value.provider, 'mymemory')
  assert.equal(out.body.value.text, '"你好" \'世界\' & more')
})
