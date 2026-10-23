// dsh-translator Client half regression suite. Run: npm test  (node --test tests/)
//
// The Client core runs in the browser bundle factory, so this suite evaluates
// it with a minimal React/document stub. It asserts the two things that are
// ours to get right without a browser:
//
//   1. WHERE the plugin contributes: the shell.overlay entry and the
//      `plugins.row.config` cell keyed "<package>#<row id>" the Plugins page
//      dispatches, plus the locale dictionary the `t` seat reads.
//   2. WHAT a save writes: one path op per changed field, never the
//      non-volatile `customModel` container, which the Host refuses.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Config, LIMITS } from '../src/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'client/core.js'), 'utf8')

const EXPORTS = '{ apply, inject, settingsOps, PACKAGE_NAME, SETTINGS_NS, TranslatorSettings, SettingsForm, SettingsSummary, TranslatorRoot, I18N, ERROR_KEY, REASON_KEY, CONFIG_PATHS, CONFIG_BOUNDS, API_PROVIDER_IDS, failureDetail, cancelPayload, normalizeAbort, redactDiagnostic, outOfBounds, runToken, CLIENT_ID, needsPrivacyNotice, privacyAcknowledged, acknowledgePrivacy, PRIVACY_KEY, isInsideRoot, selectionAnchorRect }'

/** The section the Host resolves for this entry: schema defaults with no override. */
const SAMPLE_VALUE = {
  engine: 'api',
  apiProvider: 'auto',
  primaryLanguage: 'zh-Hans',
  customModel: { provider: '', model: '' },
  reasoningEffort: 'low',
  timeoutMs: 30000,
  maxTokens: 1024,
  temperature: 0.3,
}

/** A `ConfigForm` as `ctx.configForms.get(ns)` hands it out. */
function makeForm(value = SAMPLE_VALUE) {
  const state = { status: 'ready', value, base: value, user: {}, revision: 3, writable: true, mode: 'host' }
  return { getSnapshot: () => state, subscribe: () => () => {}, mutate: async () => true, state }
}

/** Minimal React that records elements, so rendered text is assertable. */
function makeReact() {
  const seen = []
  return {
    seen,
    createElement(type, props, ...children) {
      const element = { type, props, children }
      seen.push(element)
      return element
    },
    createContext: value => ({ Provider: props => props.children, value }),
    useContext: () => ({}),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    // The panel is wrapped in an error boundary, and a boundary has to be a
    // class: `getDerivedStateFromError` has no hook equivalent. The stub only
    // has to exist for the module to load and for `render` to be reachable.
    Component: class Component {
      constructor(props) {
        this.props = props || {}
        this.state = {}
      }

      setState(next) {
        this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
      }

      render() {
        return null
      }
    },
  }
}

/** Every string rendered under the recorded elements. */
function renderedText(react) {
  const walk = (child) => {
    if (typeof child === 'string') return [child]
    if (Array.isArray(child)) return child.flatMap(walk)
    if (child !== null && typeof child === 'object' && Array.isArray(child.children)) return child.children.flatMap(walk)
    return []
  }
  return react.seen.flatMap(element => element.children.flatMap(walk))
}

/** The `Translate` seat the slot framework hands a registration that declares `locale`. */
function seat(core, locale = 'en') {
  return key => core.I18N[locale][key]
}

/** A document stub that records style elements so disposal is observable. */
function fakeDocument() {
  const head = {
    children: [],
    appendChild(el) { this.children.push(el) },
  }
  return {
    head,
    body: { appendChild() {}, removeChild() {} },
    createElement: () => ({
      style: {},
      textContent: '',
      remove() {
        const index = head.children.indexOf(this)
        if (index >= 0) head.children.splice(index, 1)
      },
    }),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    activeElement: null,
  }
}

/** A `localStorage` stand-in, so the privacy acknowledgement is observable. */
function fakeStorage() {
  const entries = new Map()
  return {
    getItem: key => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => { entries.set(key, String(value)) },
    removeItem: key => { entries.delete(key) },
  }
}

/** Evaluate the bundle core with the stubs and hand back the named internals. */
function loadCore(documentStub, react = makeReact(), storage = fakeStorage()) {
  // eslint-disable-next-line no-new-func -- the bundle core is a browser script body, not a module.
  const factory = new Function('require', 'document', 'window', 'localStorage', `${source}\n;return ${EXPORTS}`)
  return factory(
    spec => spec === 'react' ? react : (() => { throw new Error('unexpected require: ' + spec) })(),
    documentStub,
    {},
    storage,
  )
}

test('client: injects slots + locale + configForms and contributes both seats', () => {
  const documentStub = fakeDocument()
  const core = loadCore(documentStub)
  assert.deepEqual([...core.inject].sort(), ['configForms', 'locale', 'slots'])

  const form = makeForm()
  const disposers = []
  const injections = []
  const registrations = []
  const dictionaries = []
  const watched = []
  const ctx = {
    effect: (fn) => { const dispose = fn(); disposers.push(dispose); return dispose },
    slots: {
      inject: (key, callback) => { injections.push(key); callback(); return () => {} },
      register: (options, component) => { registrations.push({ options, component }); return () => {} },
    },
    locale: { register: (ns, dicts) => { dictionaries.push({ ns, dicts }); return () => {} } },
    configForms: {
      get: (ns) => { assert.equal(ns, core.SETTINGS_NS); return form },
      whileServed: (namespaces, register) => { watched.push([...namespaces]); register(new Set(namespaces)); return () => {} },
    },
  }

  core.apply(ctx)

  assert.equal(documentStub.head.children.length, 1, 'one stylesheet is injected')
  assert.deepEqual([...injections].sort(), ['plugins.bundle.config', 'shell.overlay'])
  assert.deepEqual(dictionaries.map(entry => entry.ns), ['dsh-translator'])
  assert.deepEqual(Object.keys(dictionaries[0].dicts).sort(), ['en', 'zh'])
  // The page appears only while the Host serves the entry the form belongs to.
  assert.deepEqual(watched, [[core.SETTINGS_NS]])

  const bySlot = new Map(registrations.map(entry => [entry.options.name, entry]))
  assert.deepEqual(bySlot.get('shell.overlay').options, {
    name: 'shell.overlay', id: 'dsh-translator-overlay', locale: 'dsh-translator',
  })
  // One click from the Plugins list: the bundle's own page, keyed by its name.
  assert.deepEqual(bySlot.get('plugins.bundle.config').options, {
    name: 'plugins.bundle.config', key: core.PACKAGE_NAME, locale: 'dsh-translator',
  })
  assert.equal(core.PACKAGE_NAME, '@nicearrack/dsh-translator')
  for (const entry of registrations) assert.equal(typeof entry.component, 'function')
  // The registered component receives the shared entry form, since this seat
  // passes no `form` prop of its own.
  const bound = bySlot.get('plugins.bundle.config').component({ view: 'summary' })
  assert.equal(typeof bound, 'object')

  // Fiber teardown removes the stylesheet it injected.
  disposers[0]()
  assert.equal(documentStub.head.children.length, 0)
})

test('client: a save writes leaf paths, never the customModel container', () => {
  const core = loadCore(fakeDocument())
  const base = {
    engine: 'model',
    apiProvider: 'auto',
    primaryLanguage: 'zh-Hans',
    customModel: { provider: '', model: '' },
    reasoningEffort: 'low',
    timeoutMs: 30000,
    maxTokens: 1024,
    temperature: 0.3,
  }
  const value = JSON.parse(JSON.stringify(base))
  const draft = JSON.parse(JSON.stringify(base))
  draft.customModel = { provider: 'local', model: 'm1' }
  draft.maxTokens = 2048

  const ops = core.settingsOps(draft, value, base, {})
  assert.deepEqual(ops, [
    { op: 'set', path: ['customModel', 'provider'], value: 'local' },
    { op: 'set', path: ['customModel', 'model'], value: 'm1' },
    { op: 'set', path: ['maxTokens'], value: 2048 },
  ])
  assert.equal(ops.some(op => op.path.length === 1 && op.path[0] === 'customModel'), false)
})

test('client: resetting a field clears it back to its layer', () => {
  const core = loadCore(fakeDocument())
  const base = {
    engine: 'model',
    apiProvider: 'auto',
    primaryLanguage: 'zh-Hans',
    customModel: { provider: '', model: '' },
    reasoningEffort: 'low',
    timeoutMs: 30000,
    maxTokens: 1024,
    temperature: 0.3,
  }
  const value = JSON.parse(JSON.stringify(base))
  value.maxTokens = 4096
  value.reasoningEffort = 'max'
  // The draft is back at the layer for both fields.
  const ops = core.settingsOps(base, value, base, {})
  assert.deepEqual(ops, [
    { op: 'unset', path: ['reasoningEffort'] },
    { op: 'unset', path: ['maxTokens'] },
  ])
})

test('client: resetting the model clears both of its leaves', () => {
  const core = loadCore(fakeDocument())
  const base = {
    engine: 'model',
    apiProvider: 'auto',
    primaryLanguage: 'zh-Hans',
    customModel: { provider: '', model: '' },
    reasoningEffort: 'low',
    timeoutMs: 30000,
    maxTokens: 1024,
    temperature: 0.3,
  }
  const value = JSON.parse(JSON.stringify(base))
  value.customModel = { provider: 'local', model: 'm1' }
  const ops = core.settingsOps(base, value, base, {})
  assert.deepEqual(ops, [
    { op: 'unset', path: ['customModel', 'provider'] },
    { op: 'unset', path: ['customModel', 'model'] },
  ])
})

test('client: an unchanged field with a stale user entry is cleaned in the same write', () => {
  const core = loadCore(fakeDocument())
  const base = {
    engine: 'model',
    apiProvider: 'auto',
    primaryLanguage: 'zh-Hans',
    customModel: { provider: '', model: '' },
    reasoningEffort: 'low',
    timeoutMs: 30000,
    maxTokens: 1024,
    temperature: 0.3,
  }
  const value = JSON.parse(JSON.stringify(base))
  const ops = core.settingsOps(base, value, base, { temperature: 0.3, customModel: { model: '' } })
  assert.deepEqual(ops, [
    { op: 'unset', path: ['customModel', 'model'] },
    { op: 'unset', path: ['temperature'] },
  ])
  assert.deepEqual(core.settingsOps(base, value, base, {}), [], 'nothing to write when nothing is stale')
})

test('client: the fields the form writes are exactly the schema\'s volatile leaves', () => {
  // The Host's settings transport exposes an entry only when its Config has a
  // volatile field, and it accepts a write only under a volatile path. So the
  // form's paths and the schema's volatile leaves must be the same set — a
  // write to the `customModel` container, for one, would be refused.
  const core = loadCore(fakeDocument())
  const json = JSON.parse(JSON.stringify(Config.toJSON()))
  const leaves = []
  const visit = (node, path) => {
    if (typeof node === 'number') node = json.refs[String(node)]
    if (node === null || typeof node !== 'object') return
    if (node.meta && node.meta.volatile === true) { leaves.push(path.join('.')); return }
    for (const [key, child] of Object.entries(node.dict || {})) visit(child, [...path, key])
  }
  visit(json.uid, [])

  const written = core.CONFIG_PATHS.map(path => path.join('.'))
  assert.deepEqual([...written].sort(), [...leaves].sort())
  assert.equal(written.includes('customModel'), false, 'the container is not volatile')
})

/** The recorded options of the one select whose values match exactly. */
function selectOptions(react, values) {
  const wanted = values.join('|')
  for (const element of react.seen) {
    const options = element.props && element.props.options
    if (Array.isArray(options) && options.map(o => o.value).join('|') === wanted) return options
  }
  return null
}

test('client: the page view renders localized labels through the function seat', () => {
  // The framework hands a registration that declares `locale` a `Translate`
  // FUNCTION, not a dictionary: reading `t.model` instead of `t('model')`
  // would render nothing at all, which this test would catch.
  const react = makeReact()
  const core = loadCore(fakeDocument(), react)
  const form = makeForm()

  assert.doesNotThrow(() => core.SettingsForm({ view: 'page', form, t: seat(core, 'en') }))
  const texts = renderedText(react)
  for (const label of [
    'Engine', 'Primary language', 'Translation service', 'Timeout (ms)',
    'Save', 'Discard changes',
    'Public free endpoints — no key to enter. Selected text is sent to a third-party translation service.',
  ]) {
    assert.ok(texts.includes(label), `rendered label: ${label}`)
  }

  // The two selects the api engine owns carry the localized labels as options.
  const engineOptions = selectOptions(react, ['api', 'model'])
  assert.deepEqual(engineOptions.map(o => o.label), ['Free API (recommended)', 'Model'])
  const providerOptions = selectOptions(react, ['auto', 'google', 'tencent', 'bing', 'volcengine', 'mymemory'])
  assert.deepEqual(providerOptions.map(o => o.label), [
    'Automatic (recommended)', 'Google Translate', 'Tencent', 'Microsoft Bing', 'Volcengine', 'MyMemory',
  ])

  // The dispatcher and the overlay render with the same seat without throwing.
  assert.doesNotThrow(() => core.TranslatorSettings({ view: 'summary', form, t: seat(core, 'en') }))
  assert.doesNotThrow(() => core.TranslatorRoot({ t: seat(core, 'en') }))
  // A runtime that forwards no seat falls back to the built-in dictionary.
  assert.doesNotThrow(() => core.TranslatorRoot({}))
})

test('client: the api engine hides every model-only control', () => {
  const react = makeReact()
  const core = loadCore(fakeDocument(), react)
  core.SettingsForm({ view: 'page', form: makeForm(JSON.parse(JSON.stringify(SAMPLE_VALUE))), t: seat(core, 'en') })
  const texts = renderedText(react)

  // None of these is read on the free-API path, so none of them may appear.
  for (const label of ['Model', 'Reasoning effort', 'Max tokens', 'Temperature']) {
    assert.equal(texts.includes(label), false, `api mode must not render: ${label}`)
  }
  assert.equal(texts.includes('Session default'), false)
})

test('client: the model engine renders every model-only control', () => {
  const react = makeReact()
  const core = loadCore(fakeDocument(), react)
  const value = JSON.parse(JSON.stringify(SAMPLE_VALUE))
  value.engine = 'model'
  core.SettingsForm({ view: 'page', form: makeForm(value), t: seat(core, 'en') })
  const texts = renderedText(react)

  for (const label of [
    'Model', 'Reasoning effort', 'Max tokens', 'Timeout (ms)', 'Temperature',
    'Save', 'Discard changes', "Leave both empty to use the session's default model",
  ]) {
    assert.ok(texts.includes(label), `rendered label: ${label}`)
  }
  // The free-API-only control is gone in the other direction.
  assert.equal(texts.includes('Translation service'), false)
  assert.equal(selectOptions(react, ['auto', 'tencent', 'bing', 'volcengine', 'mymemory']), null)
})

test('client: switching the engine writes exactly one path', () => {
  const core = loadCore(fakeDocument())
  const base = { engine: 'api', apiProvider: 'auto', primaryLanguage: 'zh-Hans', customModel: { provider: '', model: '' }, reasoningEffort: 'low', timeoutMs: 30000, maxTokens: 1024, temperature: 0.3 }
  const draft = JSON.parse(JSON.stringify(base))
  draft.engine = 'model'
  assert.deepEqual(core.settingsOps(draft, base, base, {}), [
    { op: 'set', path: ['engine'], value: 'model' },
  ])
  // Choosing a specific provider is likewise one volatile leaf.
  const draft2 = JSON.parse(JSON.stringify(base))
  draft2.apiProvider = 'bing'
  assert.deepEqual(core.settingsOps(draft2, base, base, {}), [
    { op: 'set', path: ['apiProvider'], value: 'bing' },
  ])
})

test('client: every provider the form offers is one the Host schema accepts', () => {
  // The select's options and the schema's union are declared in two places.
  // A provider added to one and not the other would be offered by the form and
  // then refused on save, so the two lists are pinned to each other here.
  const core = loadCore(fakeDocument())
  assert.equal(core.API_PROVIDER_IDS[0], 'auto', 'Automatic is offered first')
  for (const id of core.API_PROVIDER_IDS) {
    assert.doesNotThrow(() => Config({ apiProvider: id }), `the Host accepts apiProvider=${id}`)
  }
  const defined = Object.keys(core.I18N.en).filter(key => key.startsWith('provider'))
  assert.deepEqual(
    defined.sort(),
    core.API_PROVIDER_IDS.map(id => 'provider' + id.charAt(0).toUpperCase() + id.slice(1)).sort(),
    'every offered provider has a localized label',
  )
})

/** The data-attribute names of the footer's rendered children, in DOM order. */
function footerMarks(react) {
  const footer = react.seen.find(el => el.props && el.props['data-dsh-translator-settings-footer'] !== undefined)
  assert.ok(footer, 'the settings footer rendered')
  return footer.children.map((child) => {
    if (child === null || typeof child !== 'object' || !child.props) return null
    if (child.props['data-dsh-translator-settings-discard'] !== undefined) return 'discard'
    if (child.props['data-dsh-translator-settings-save'] !== undefined) return 'save'
    if (child.props['data-dsh-translator-settings-status'] !== undefined) return 'status'
    return null
  }).filter(Boolean)
}

test('client: the footer leads with the actions and trails the status', () => {
  // The actions sit on the left, so they must come first in DOM order too:
  // visual order and tab order have to agree.
  const react = makeReact()
  const core = loadCore(fakeDocument(), react)
  core.SettingsForm({ view: 'page', form: makeForm(), t: seat(core, 'en') })
  assert.deepEqual(footerMarks(react), ['discard', 'save'])

  // When there is something to report it belongs after the buttons, on the
  // right. A read-only connection is the one status a fresh form shows.
  const roReact = makeReact()
  const roCore = loadCore(fakeDocument(), roReact)
  const roForm = makeForm()
  roForm.state.writable = false
  roCore.SettingsForm({ view: 'page', form: roForm, t: seat(roCore, 'en') })
  assert.deepEqual(footerMarks(roReact), ['discard', 'save', 'status'])
})

test('client: a Host that predates the engine field falls back to the model form', () => {
  // A `link:` install reads the Host half at instance startup. Updating the
  // bundle on disk and refreshing only the page leaves a new client talking to
  // an old schema, whose resolved section carries no `engine`. The form must
  // then show what that Host can actually store, not two blank selects whose
  // writes would be refused.
  const react = makeReact()
  const core = loadCore(fakeDocument(), react)
  const value = JSON.parse(JSON.stringify(SAMPLE_VALUE))
  delete value.engine
  delete value.apiProvider
  core.SettingsForm({ view: 'page', form: makeForm(value), t: seat(core, 'en') })
  const texts = renderedText(react)

  assert.equal(selectOptions(react, ['api', 'model']), null, 'no engine select')
  assert.equal(selectOptions(react, ['auto', 'tencent', 'bing', 'volcengine', 'mymemory']), null, 'no service select')
  assert.equal(texts.includes('Engine'), false)
  assert.equal(texts.includes('Translation service'), false)
  // The engine this Host does understand is shown, plus the reason.
  for (const label of ['Model', 'Reasoning effort', 'Max tokens', 'Temperature']) {
    assert.ok(texts.includes(label), `rendered label: ${label}`)
  }
  assert.ok(texts.some(text => text.includes('restart it')), 'the reason is stated')

  // The summary must not advertise an engine the Host cannot run either.
  const summary = makeReact()
  const summaryCore = loadCore(fakeDocument(), summary)
  summaryCore.SettingsSummary({ view: 'summary', form: makeForm(value), t: seat(summaryCore, 'en') })
  const summaryText = renderedText(summary).join(' ')
  assert.equal(summaryText.includes('Free API'), false)
  assert.ok(summaryText.includes('Session default'))
})

test('client: the summary names the engine that will actually run', () => {
  const api = makeReact()
  const apiCore = loadCore(fakeDocument(), api)
  apiCore.SettingsSummary({ view: 'summary', form: makeForm(), t: seat(apiCore, 'en') })
  assert.ok(renderedText(api).some(text => text.includes('Free API (recommended)')))
  assert.ok(renderedText(api).some(text => text.includes('Automatic (recommended)')))

  const model = makeReact()
  const modelCore = loadCore(fakeDocument(), model)
  const value = JSON.parse(JSON.stringify(SAMPLE_VALUE))
  value.engine = 'model'
  modelCore.SettingsSummary({ view: 'summary', form: makeForm(value), t: seat(modelCore, 'en') })
  // With no model chosen the model engine falls back to the session default.
  assert.ok(renderedText(model).some(text => text.includes('Session default')))
})

test('client: a failed chain is explained through the dictionary, not the provider text', () => {
  const core = loadCore(fakeDocument())
  const t = key => core.I18N.zh[key]

  // A fully benched chain is named outright: nothing was even asked, so the
  // generic "endpoints are unavailable" would be actively misleading.
  assert.equal(
    core.failureDetail(t, [
      { provider: 'tencent', reason: 'benched', error: 'benched after an earlier failure' },
      { provider: 'bing', reason: 'benched', error: 'benched after an earlier failure' },
    ]),
    core.I18N.zh.errorApiBenched,
  )

  // A mixed chain names each provider with a translated reason, and never
  // leaks the raw English `error` string the Host attached.
  const mixed = core.failureDetail(t, [
    { provider: 'tencent', reason: 'failed', error: 'tencent: HTTP 500' },
    { provider: 'mymemory', reason: 'too-long', error: 'text exceeds 500 bytes' },
  ])
  assert.match(mixed, /腾讯交互翻译: 请求失败/)
  assert.match(mixed, /MyMemory: 文本过长/)
  assert.equal(mixed.includes('HTTP 500'), false)

  // Anything that is not a per-attempt record yields no second line at all.
  assert.equal(core.failureDetail(t, undefined), null)
  assert.equal(core.failureDetail(t, 'provider exploded'), null)
  assert.equal(core.failureDetail(t, []), null)
})

// ---------------------------------------------------------------------------
// Run identity: the card names the run it started, so a cancel does not have to
// rely on a counter this page and the Host agree about.
// ---------------------------------------------------------------------------

test('client: a cancel names the run token, and only falls back to the old counter', () => {
  const core = loadCore(fakeDocument())
  const runId = 'run-' + 'a'.repeat(12)
  assert.deepEqual(core.cancelPayload({ runId, reqId: 7 }), { runId, clientId: core.CLIENT_ID })
  // A card without a token is a payload shape this half no longer produces,
  // but the fallback keeps the old protocol reachable.
  assert.deepEqual(core.cancelPayload({ reqId: 4 }), { seq: 4 })
  assert.deepEqual(core.cancelPayload(null), { seq: 0 })
})

test('client: every token this half mints is one the Host will accept', () => {
  // The Host ignores a malformed token and serves the legacy path instead, so
  // a token outside this shape would silently lose cancellation.
  const core = loadCore(fakeDocument())
  const shape = /^[A-Za-z0-9_-]{8,64}$/
  for (let i = 0; i < 20; i++) {
    const token = core.runToken()
    assert.equal(shape.test(token), true, `minted token: ${token}`)
    assert.ok(token.length <= 64, token)
  }
  assert.equal(shape.test(core.CLIENT_ID), true, core.CLIENT_ID)
})

test('client: an aborted fetch is reported as the cancelled code', () => {
  const core = loadCore(fakeDocument())
  const abort = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
  assert.equal(core.normalizeAbort(abort).code, 'cancelled')
  // Anything that is not an abort must survive untouched.
  const failure = new Error('boom')
  assert.equal(core.normalizeAbort(failure), failure)
})

test('client: cancellation renders through the dictionary instead of spinning', () => {
  // Before this, `cancelled` had no entry and the handler returned early, so a
  // Host-retired run left the card on "translating…" with no Retry.
  const core = loadCore(fakeDocument())
  assert.equal(core.ERROR_KEY['cancelled'], 'errorCancelled')
  for (const locale of ['zh', 'en']) {
    assert.equal(typeof core.I18N[locale][core.ERROR_KEY['cancelled']], 'string')
  }
})

// ---------------------------------------------------------------------------
// Failure reporting and numeric bounds.
// ---------------------------------------------------------------------------

test('client: every error code maps to a phrase, and no phrase is unreachable', () => {
  // The two halves agree on codes by convention, not by import, so the map is
  // the contract: a code with no entry used to print the Host's raw English.
  const core = loadCore(fakeDocument())
  for (const [code, key] of Object.entries(core.ERROR_KEY)) {
    for (const locale of ['zh', 'en']) {
      assert.equal(typeof core.I18N[locale][key], 'string', `${code} → ${key} (${locale})`)
    }
  }
  for (const key of Object.values(core.REASON_KEY)) {
    for (const locale of ['zh', 'en']) {
      assert.equal(typeof core.I18N[locale][key], 'string', `${key} (${locale})`)
    }
  }
  // `errorApiBenched` is produced by failureDetail's all-benched branch rather
  // than through either map, so it is named here.
  const reachable = new Set([...Object.values(core.ERROR_KEY), ...Object.values(core.REASON_KEY), 'errorApiBenched'])
  for (const key of Object.keys(core.I18N.en)) {
    // `reasoningLevel` is a field label, not a failure phrase.
    if (/^error[A-Z]/.test(key) || /^reason(?!ing)[A-Z]/.test(key)) {
      assert.ok(reachable.has(key), `unreachable dictionary key: ${key}`)
    }
  }
})

test('client: a diagnostic loses its credentials before it reaches the card', () => {
  const core = loadCore(fakeDocument())
  const raw = 'fetch failed: https://internal.example/v1/chat/completions 401 invalid api key sk-abc123456789'
  const safe = core.redactDiagnostic(raw)
  assert.equal(safe.includes('sk-abc123456789'), false, safe)
  assert.ok(safe.includes('401'), 'the actionable part survives')

  const bearer = core.redactDiagnostic('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def')
  assert.equal(bearer.includes('eyJhbGciOiJIUzI1NiJ9'), false, bearer)
  assert.ok(bearer.includes('Bearer ***'), bearer)

  const configured = core.redactDiagnostic('provider rejected: api_key="AKIAIOSFODNN7EXAMPLE"')
  assert.equal(configured.includes('AKIAIOSFODNN7EXAMPLE'), false, configured)

  // Nothing to show, or nothing that survives: no second line at all.
  assert.equal(core.redactDiagnostic('   '), null)
  assert.equal(core.redactDiagnostic(undefined), null)
  assert.equal(core.redactDiagnostic(42), null)
  assert.ok(core.redactDiagnostic('x'.repeat(400)).length <= 200)
})

test('client: the untranslated marker has a label in both dictionaries', () => {
  // The Host now answers an all-echo chain with the source plus this flag, so
  // the label is part of the contract rather than decoration.
  const core = loadCore(fakeDocument())
  for (const locale of ['zh', 'en']) {
    assert.equal(typeof core.I18N[locale].untranslated, 'string', locale)
    assert.equal(typeof core.I18N[locale].cached, 'string', locale)
    assert.equal(typeof core.I18N[locale].privacyNotice, 'string', locale)
    assert.equal(typeof core.I18N[locale].privacyDismiss, 'string', locale)
  }
})

test('client: the free engine is disclosed once, and only once', () => {
  // The default engine sends the selection to a third party. The reader hears
  // about it on the first answer that proves it, dismisses it, and is not
  // nagged again.
  const storage = fakeStorage()
  const core = loadCore(fakeDocument(), makeReact(), storage)
  assert.equal(core.privacyAcknowledged(), false)
  assert.equal(core.needsPrivacyNotice({ result: { engine: 'api' } }, core.privacyAcknowledged()), true)

  core.acknowledgePrivacy()
  assert.equal(storage.getItem(core.PRIVACY_KEY), '1')
  assert.equal(core.privacyAcknowledged(), true)
  assert.equal(core.needsPrivacyNotice({ result: { engine: 'api' } }, core.privacyAcknowledged()), false)
})

test('client: the model engine needs no privacy notice', () => {
  // It is the whole point of the other engine: the text never leaves the
  // configured model pipeline, so there is nothing to disclose.
  const core = loadCore(fakeDocument())
  assert.equal(core.needsPrivacyNotice({ result: { engine: 'model' } }, false), false)
  assert.equal(core.needsPrivacyNotice({ status: 'loading' }, false), false)
  assert.equal(core.needsPrivacyNotice(null, false), false)
})

test('client: a runtime that refuses localStorage is treated as acknowledged', () => {
  // Better to stay silent than to show the notice on every single answer.
  const hostile = {
    getItem() { throw new Error('denied') },
    setItem() { throw new Error('denied') },
  }
  const core = loadCore(fakeDocument(), makeReact(), hostile)
  assert.equal(core.privacyAcknowledged(), true)
  assert.doesNotThrow(() => core.acknowledgePrivacy())
})

test('client: the numeric bounds mirror the Host schema', () => {
  const core = loadCore(fakeDocument())
  for (const [key, bound] of Object.entries(core.CONFIG_BOUNDS)) {
    assert.equal(bound.min, LIMITS[key].min, key + ' min')
    assert.equal(bound.max, LIMITS[key].max, key + ' max')
  }
  // The Host refuses these, which is exactly why the form must too.
  assert.throws(() => Config({ timeoutMs: LIMITS.timeoutMs.max + 1 }))
  assert.throws(() => Config({ maxTokens: LIMITS.maxTokens.max + 1 }))
})

test('client: an out-of-range number is named before the write, not after', () => {
  const core = loadCore(fakeDocument())
  const base = JSON.parse(JSON.stringify(SAMPLE_VALUE))
  assert.deepEqual(core.outOfBounds(base), [])
  assert.deepEqual(core.outOfBounds({ ...base, timeoutMs: LIMITS.timeoutMs.max + 1 }), ['timeoutMs'])
  assert.deepEqual(core.outOfBounds({ ...base, maxTokens: 0, temperature: 3 }), ['maxTokens', 'temperature'])
  // `Number('')` is 0 and a JSON clone turns NaN into null; both are refused.
  assert.deepEqual(core.outOfBounds({ ...base, timeoutMs: 0 }), ['timeoutMs'])
  assert.deepEqual(core.outOfBounds({ ...base, timeoutMs: null }), ['timeoutMs'])
  assert.deepEqual(core.outOfBounds({ ...base, timeoutMs: NaN }), ['timeoutMs'])
  // A field an older Host does not report is not a field this form can bound.
  const older = { ...base }
  delete older.timeoutMs
  assert.deepEqual(core.outOfBounds(older), [])
})

test('client: the number fields declare the bounds they are checked against', () => {
  const react = makeReact()
  const core = loadCore(fakeDocument(), react)
  const value = JSON.parse(JSON.stringify(SAMPLE_VALUE))
  value.engine = 'model'
  core.SettingsForm({ view: 'page', form: makeForm(value), t: seat(core, 'en') })
  const numbers = react.seen.filter(el => el.props && el.props.type === 'number')
  assert.ok(numbers.length >= 3, 'the model form renders its number fields')
  const bounds = new Set(numbers.map(el => `${el.props.min}-${el.props.max}`))
  assert.ok(bounds.has(`${core.CONFIG_BOUNDS.timeoutMs.min}-${core.CONFIG_BOUNDS.timeoutMs.max}`), [...bounds].join(' '))
  assert.ok(bounds.has(`${core.CONFIG_BOUNDS.maxTokens.min}-${core.CONFIG_BOUNDS.maxTokens.max}`), [...bounds].join(' '))
  assert.ok(bounds.has(`${core.CONFIG_BOUNDS.temperature.min}-${core.CONFIG_BOUNDS.temperature.max}`), [...bounds].join(' '))
  for (const el of numbers) assert.equal(typeof el.props.onChange, 'function')
})


// ---------------------------------------------------------------------------
// Selection geometry and self-recognition.
// ---------------------------------------------------------------------------

test('client: a wrapped selection anchors at its end, not at the union box', () => {
  // The union rect of a selection spanning lines is the whole block, which put
  // the button on the widest line's right edge, over unrelated content.
  const caret = { top: 120, bottom: 138, left: 60, right: 60, width: 0, height: 18 }
  const union = { top: 40, bottom: 138, left: 10, right: 400, width: 390, height: 98 }
  const doc = fakeDocument()
  doc.createRange = () => ({ setStart() {}, collapse() {}, getBoundingClientRect: () => caret })
  const core = loadCore(doc)
  const rect = core.selectionAnchorRect({ endContainer: {}, endOffset: 3, getBoundingClientRect: () => union })
  assert.equal(rect.top, 120)
  assert.equal(rect.left, 60)
  assert.equal(rect.right, 68, 'widened so the button stays clickable')
})

test('client: a selection with no measurable caret falls back to the union box', () => {
  // No `createRange` at all, which is also what a hostile DOM looks like.
  const core = loadCore(fakeDocument())
  const union = { top: 40, bottom: 138, left: 10, right: 400, width: 390, height: 98 }
  const rect = core.selectionAnchorRect({ endContainer: {}, endOffset: 1, getBoundingClientRect: () => union })
  assert.equal(rect, union)
})

test('client: the overlay recognises itself through a shadow root', () => {
  const core = loadCore(fakeDocument())
  const rootHost = { nodeType: 1, hasAttribute: (name) => name === 'data-dsh-translator-root', parentNode: null }
  const shadow = { nodeType: 11, host: rootHost }
  const deep = { nodeType: 1, hasAttribute: () => false, parentNode: shadow }
  assert.equal(core.isInsideRoot(deep), true)
  // And a stray node in the page is still outside.
  assert.equal(core.isInsideRoot({ nodeType: 1, hasAttribute: () => false, parentNode: null }), false)
})

// ---------------------------------------------------------------------------
// Two forms, one section.
// ---------------------------------------------------------------------------

test('client: a save writes only the fields this editor touched', () => {
  // Two tabs on the settings page: one saves a change, the other still holds
  // the old value for that field. Writing every differing path would revert it.
  const core = loadCore(fakeDocument())
  const base = {
    engine: 'model', apiProvider: 'auto', primaryLanguage: 'zh-Hans',
    customModel: { provider: '', model: '' }, reasoningEffort: 'low',
    timeoutMs: 30000, maxTokens: 1024, temperature: 0.3,
  }
  const committed = JSON.parse(JSON.stringify(base))
  committed.maxTokens = 2048            // the other tab's save
  const stale = JSON.parse(JSON.stringify(base))  // this tab's draft: still 1024
  stale.temperature = 1                 // …and the reader changed this here

  const touched = new Set(['temperature'])
  assert.deepEqual(core.settingsOps(stale, committed, base, {}, touched), [
    { op: 'set', path: ['temperature'], value: 1 },
  ])
  // The pre-existing call shape writes every difference, which is the bug.
  assert.ok(core.settingsOps(stale, committed, base, {}).some(op => op.path.join('.') === 'maxTokens'))
})

test('client: an untouched out-of-range field does not block this save', () => {
  const core = loadCore(fakeDocument())
  const base = JSON.parse(JSON.stringify(SAMPLE_VALUE))
  assert.deepEqual(core.outOfBounds({ ...base, maxTokens: 999999, temperature: 1 }, new Set(['temperature'])), [])
  assert.deepEqual(core.outOfBounds({ ...base, maxTokens: 999999 }, new Set(['maxTokens'])), ['maxTokens'])
})
