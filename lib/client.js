window.__ModuleLoader__.load({
	id: "@nicearrack/dsh-translator",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
// dsh-translator — Client half (packaged bundle core)
//
// This file is the body of the client bundle factory. scripts/build.js wraps
// it into the dsh client-modules bundle format:
//
//   window.__ModuleLoader__.load({ id: "<package-name>", factory: (require) => { ... this body ... } })
//
// Two seats are contributed through the official slot registry:
//
//   shell.overlay       the frame-wide floating layer: the translate button
//                       and the translation card.
//   plugins.row.config  the Plugins page: this bundle's own row gains a
//                       configure control and opens the settings form there,
//                       keyed "<package name>#<row id>". A bundle's
//                       configuration belongs in `plugins.bundle.config` or
//                       `plugins.row.config`, not in a per-plugin settings
//                       item (that slot is the official host-plane pages').
//
// The settings form reads and writes through the Host-supplied `form` prop
// (`view: 'page'`), which is the schema-driven configuration transport
// (`ctx.configForms` behind the page) — the Client owns no settings channel of
// its own, and the Host's Config schema is the only source of defaults.
//
// The Host half is reached over the authenticated `/api` channel for the
// business API only:
//
//   POST api/translator/translate        { text }
//   POST api/translator/translate-cancel { seq }
//   POST api/translator/list-models      {}
//   POST api/translator/default-model    {}
//
// UI strings come from the official dictionary registry (ctx.locale.register
// below); both slot registrations declare `locale:` so the framework's `t`
// seat arrives on the component props and re-renders on locale switches.
//
// CSS is injected through a <style> element whose removal is registered with
// the plugin fiber; selection guard, positioning, races, and cancellation
// follow the Host-side translation flow.

let react = require('react')

const I18N = {
  zh: {
    tooltip: '划词翻译', translating: '翻译中…', truncated: '（译文可能被截断）',
    untranslated: '未翻译（原文返回）', cached: '已缓存',
    dictUk: '英', dictUs: '美', dictPinyin: '拼音', dictSenses: '释义',
    dictAlt: '其他表达方式', dictPhrases: '词组', dictSynonyms: '同近义词', dictWeb: '网络释义',
    dictForms: '变形', dictExamples: '例句',
    panelTitle: '输入翻译', panelOpen: '输入翻译（独立面板）',
    panelPlaceholder: '输入或粘贴文本，Ctrl+Enter 翻译，Esc 关闭',
    panelGo: '翻译', panelClear: '清空', panelTarget: '目标语言', panelDragHint: '拖动可移动，右键回到默认位置',
    panelAuto: '自动（中文→英文，其他→主语言）',
    panelHistory: '历史记录', panelHistoryClear: '清空', panelHistoryEmpty: '还没有记录',
    privacyNotice: '这段文本已发送到第三方免费翻译服务。想让它留在本机，请在插件设置里把引擎改成「大模型」。',
    privacyDismiss: '知道了',
    retry: '重试', pin: '固定', unpin: '取消固定', close: '关闭',
    copied: '已复制', copiedSource: '已复制原文',
    engine: '翻译引擎', engineApi: '免费 API（推荐）', engineModel: '大模型',
    apiProvider: '翻译服务', apiHint: '公共免费接口，无需填写 Key。划选的文本会发送到第三方翻译服务。',
    hostStale: '当前 DSH 实例尚未加载新版本，重启实例后才能使用「免费 API」引擎；下面暂时按「大模型」引擎显示。',
    providerAuto: '自动（推荐）', providerTencent: '腾讯交互翻译', providerBing: '微软 Bing',
    providerGoogle: '谷歌翻译', providerVolcengine: '火山翻译', providerMymemory: 'MyMemory',
    primaryLanguage: '主语言', model: '模型', followSession: '跟随会话默认',
    modelHint: '两项都留空时使用当前会话的默认模型',
    reasoningLevel: '推理等级',
    timeout: '超时（毫秒）', maxTokens: '最大输出 token', temperature: '温度',
    save: '保存', saving: '保存中…', discard: '放弃修改', saved: '已保存', saveFailed: '保存失败', overridden: '已覆盖', resetDefault: '恢复默认',
    invalidFields: '数值超出允许范围',
    readOnly: '当前连接不接受写入',
    errorEmpty: '没有可翻译的文本',
    errorNoProvider: '未配置可用模型（无 LLM provider）',
    errorNoModel: 'provider 没有可用模型',
    errorTranslatedEmpty: '模型未返回译文',
    errorTimeout: '翻译超时',
    errorModelFailed: '模型调用失败',
    errorApiFailed: '免费翻译接口暂时不可用，请稍后重试，或把引擎切换为「大模型」',
    errorFailed: '翻译失败',
    errorApiBenched: '所有翻译服务都在冷却中（上次失败后暂不重试）——点「重试」可立即强制再试',
    errorRateLimited: '请求过于频繁，请稍后再试',
    errorCancelled: '翻译已取消',
    reasonBenched: '冷却中', reasonUnsupported: '不支持该语言', reasonTooLong: '文本过长',
    reasonEcho: '返回了原文', reasonFailed: '请求失败',
  },
  en: {
    tooltip: 'Word-selection translation', translating: 'Translating…', truncated: '(may be truncated)',
    untranslated: 'not translated (source returned)', cached: 'cached',
    dictUk: 'UK', dictUs: 'US', dictPinyin: 'pinyin', dictSenses: 'meanings',
    dictAlt: 'other ways to say', dictPhrases: 'phrases', dictSynonyms: 'synonyms', dictWeb: 'web meanings',
    dictForms: 'forms', dictExamples: 'examples',
    panelTitle: 'Input translation', panelOpen: 'Input translation (panel)',
    panelPlaceholder: 'Type or paste text — Ctrl+Enter to translate, Esc to close',
    panelGo: 'Translate', panelClear: 'Clear', panelTarget: 'Target language', panelDragHint: 'drag to move, right-click to reset',
    panelAuto: 'Auto (Chinese→English, otherwise primary language)',
    panelHistory: 'History', panelHistoryClear: 'Clear', panelHistoryEmpty: 'Nothing yet',
    privacyNotice: 'This text was sent to a third-party free translation service. To keep it on this machine, switch the engine to Model in the plugin settings.',
    privacyDismiss: 'Got it',
    retry: 'Retry', pin: 'Pin', unpin: 'Unpin', close: 'Close',
    copied: 'Copied', copiedSource: 'Copied source',
    engine: 'Engine', engineApi: 'Free API (recommended)', engineModel: 'Model',
    apiProvider: 'Translation service', apiHint: 'Public free endpoints — no key to enter. Selected text is sent to a third-party translation service.',
    hostStale: 'This DSH instance has not loaded the new version yet — restart it to get the Free API engine. The model engine is shown meanwhile.',
    providerAuto: 'Automatic (recommended)', providerTencent: 'Tencent', providerBing: 'Microsoft Bing',
    providerGoogle: 'Google Translate', providerVolcengine: 'Volcengine', providerMymemory: 'MyMemory',
    primaryLanguage: 'Primary language', model: 'Model', followSession: 'Session default',
    modelHint: 'Leave both empty to use the session\'s default model',
    reasoningLevel: 'Reasoning effort',
    timeout: 'Timeout (ms)', maxTokens: 'Max tokens', temperature: 'Temperature',
    save: 'Save', saving: 'Saving…', discard: 'Discard changes', saved: 'Saved', saveFailed: 'Save failed', overridden: 'Overridden', resetDefault: 'Reset to default',
    invalidFields: 'Value out of range',
    readOnly: 'This connection does not accept writes',
    errorEmpty: 'Nothing to translate',
    errorNoProvider: 'No configured model (no LLM provider)',
    errorNoModel: 'Provider has no available model',
    errorTranslatedEmpty: 'The model returned no translation',
    errorTimeout: 'Translation timed out',
    errorModelFailed: 'Model call failed',
    errorApiFailed: 'The free translation endpoints are unavailable — try again later, or switch the engine to Model',
    errorFailed: 'Translation failed',
    errorApiBenched: 'Every translation service is cooling down after an earlier failure — press Retry to force an immediate attempt',
    errorRateLimited: 'Too many requests — try again in a moment',
    errorCancelled: 'Translation cancelled',
    reasonBenched: 'cooling down', reasonUnsupported: 'target unsupported', reasonTooLong: 'text too long',
    reasonEcho: 'echoed the source', reasonFailed: 'request failed',
  },
}
const ERROR_KEY = {
  'empty': 'errorEmpty',
  'no-provider': 'errorNoProvider',
  'no-model': 'errorNoModel',
  'translated-empty': 'errorTranslatedEmpty',
  'timeout': 'errorTimeout',
  'api-timeout': 'errorTimeout',
  'model-error': 'errorModelFailed',
  'api-failed': 'errorApiFailed',
  'translate-failed': 'errorFailed',
  'rate-limited': 'errorRateLimited',
  // A cancelled run is terminal, not invisible: the Host may retire a run for
  // reasons this card did not ask for (the other half of a superseded pair),
  // and "loading forever with no way to retry" is worse than saying so.
  'cancelled': 'errorCancelled',
}
/** Per-attempt reason (`errors[].reason` from the Host) → dictionary key. */
const REASON_KEY = {
  'benched': 'reasonBenched',
  'unsupported': 'reasonUnsupported',
  'too-long': 'reasonTooLong',
  'echo': 'reasonEcho',
  'failed': 'reasonFailed',
}
const LANG_NAMES = {
  'zh-Hans': '简体中文', 'zh-Hant': '繁體中文', 'ja-JP': '日本語', 'ko-KR': '한국어', 'ru-RU': 'Русский', 'en': 'English',
}
/** Keyless providers the API engine offers, in chain order, `auto` first. */
const API_PROVIDER_IDS = ['auto', 'google', 'tencent', 'bing', 'volcengine', 'mymemory']
/** Localized label of one provider id, falling back to the raw id. */
function providerName(t, id) {
  if (!id) return ''
  const label = t('provider' + id.charAt(0).toUpperCase() + id.slice(1))
  return label || id
}
/**
 * Secondary line under a card error, built from the locale-independent
 * `{ provider, reason, error }` records the Host sends as `error.detail`.
 * Rendering the reason through the dictionary keeps the provider's raw English
 * text out of the card.
 *
 * A fully benched chain is named outright rather than listed: every provider
 * skipped without a request is the one case where the generic "endpoints are
 * unavailable" is actively misleading — the endpoints are fine, this plugin
 * just is not asking them.
 */
function failureDetail(t, detail) {
  if (!Array.isArray(detail) || detail.length === 0) return null
  const records = detail.filter(d => d && typeof d === 'object' && typeof d.provider === 'string')
  if (records.length === 0) return null
  if (records.every(d => d.reason === 'benched')) return t('errorApiBenched')
  const parts = records.map((d) => {
    const key = REASON_KEY[d.reason]
    const reason = key ? t(key) : null
    const name = providerName(t, d.provider)
    return reason ? name + ': ' + reason : name
  })
  return parts.join(' · ')
}
function formatTokens(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}
function langName(code) {
  return LANG_NAMES[code] || code
}

/**
 * Prepare a Host or provider message for the card's diagnostic line.
 *
 * The line is there to make a failure actionable, so the message is kept —
 * minus anything that looks like a credential. Providers do echo keys and
 * tokens in their rejection bodies, and that text used to reach the card
 * unchanged. Returns null when there is nothing worth showing.
 */
function redactDiagnostic(message) {
  if (typeof message !== 'string') return null
  let text = message.trim()
  if (!text) return null
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer ***')
  text = text.replace(/\bBasic\s+[A-Za-z0-9+/=]{8,}/gi, 'Basic ***')
  text = text.replace(/\bsk-[A-Za-z0-9_-]{6,}/g, 'sk-***')
  text = text.replace(/(api[_-]?key|access[_-]?token|secret|password)(["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi, '$1$2***')
  return text.length > 200 ? text.slice(0, 197) + '…' : text
}

/**
 * Where the one-time "this leaves your machine" acknowledgement is remembered.
 *
 * Versioned so a future notice can be shown again without colliding with this
 * one. `localStorage` is the only client-side store the harness offers — there
 * is no persistence service — and a runtime that refuses it (private mode, a
 * storage policy) simply gets asked again.
 */
const PRIVACY_KEY = 'dsh-translator.privacy-notice.v1'

/** Whether the reader has already been told where free-API text goes. */
function privacyAcknowledged() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return true
    return localStorage.getItem(PRIVACY_KEY) === '1'
  } catch (err) {
    return true
  }
}

/** Remember that the reader has seen the notice. */
function acknowledgePrivacy() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return
    localStorage.setItem(PRIVACY_KEY, '1')
  } catch (err) { /* nothing to do: the notice simply reappears next time */ }
}

/**
 * Whether this result needs the one-time notice.
 *
 * Only the free engine sends the text off the machine, so only a result it
 * produced can be worth warning about — and once the reader has dismissed the
 * notice, never again.
 */
function needsPrivacyNotice(card, acknowledged) {
  return Boolean(card && card.result && card.result.engine === 'api' && !acknowledged)
}

const TRANSLATOR_CSS = `/* Doubled attribute: outranks any single-class shell rule that sets
   pointer-events on our layer, whatever order the two land in. */
[data-dsh-translator-root][data-dsh-translator-root] {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483000;
}
[data-dsh-translator-btn] {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  pointer-events: auto;
  transition: transform 120ms ease;
}
[data-dsh-translator-btn]:hover {
  transform: scale(1.08);
}
[data-dsh-translator-btn]:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
[data-dsh-translator-card] {
  position: absolute;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  pointer-events: auto;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 1.55;
  max-height: 60vh;
  overflow: hidden;
}
[data-dsh-translator-dict] {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--dsw-alias-border-l1);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
  max-height: 46vh;
  overflow: auto;
}
[data-dsh-translator-dict-phonetic] {
  margin-bottom: 4px;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-translator-dict-label] {
  margin: 7px 0 2px;
  font-size: 11px;
  letter-spacing: 0.4px;
  opacity: 0.72;
}
[data-dsh-translator-dict-sense] {
  margin: 3px 0;
}
[data-dsh-translator-dict-def] {
  position: relative;
  padding-left: 10px;
}
[data-dsh-translator-dict-def]::before {
  content: '·';
  position: absolute;
  left: 2px;
  opacity: 0.55;
}
[data-dsh-translator-dict-group] {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  margin: 5px 0;
}
[data-dsh-translator-dict-pos] {
  font-style: italic;
  color: var(--dsw-alias-brand-primary);
  margin-right: 2px;
}
[data-dsh-translator-dict-term] {
  padding: 0 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);
}
[data-dsh-translator-dict-syn-tran] {
  opacity: 0.7;
  margin-left: 4px;
}
[data-dsh-translator-dict-phrase] {
  margin: 2px 0;
}
[data-dsh-translator-dict-phrase-src] {
  color: var(--dsw-alias-label-primary);
  margin-right: 6px;
}
[data-dsh-translator-dict-forms] {
  margin: 5px 0 0;
  opacity: 0.85;
}
[data-dsh-translator-dict-examples] > div {
  margin: 3px 0;
}
[data-dsh-translator-dict-example-src] {
  color: var(--dsw-alias-label-primary);
}
[data-dsh-translator-actions] {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  flex: 0 0 auto;
}
[data-dsh-translator-actions] button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  pointer-events: auto;
}
[data-dsh-translator-actions] button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
[data-dsh-translator-actions] [data-dsh-translator-pin="on"] {
  color: var(--dsw-alias-brand-primary);
}
[data-dsh-translator-source] {
  padding: 10px 12px 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1.5;
  max-height: 4.5em;
  overflow: hidden;
  word-break: break-word;
  cursor: move;
  -webkit-user-select: none;
  user-select: none;
}
[data-dsh-translator-body] {
  padding: 2px 12px 10px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  word-break: break-word;
  white-space: pre-wrap;
  user-select: none;
  -webkit-user-select: none;
  cursor: pointer;
}
[data-dsh-translator-error] {
  color: var(--dsw-alias-state-error-primary);
}
[data-dsh-translator-error-detail] {
  margin-top: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.4;
}
[data-dsh-translator-notice] {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.45;
}
[data-dsh-translator-notice-text] {
  flex: 1 1 auto;
  min-width: 0;
}
[data-dsh-translator-notice-dismiss] {
  appearance: none;
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
[data-dsh-translator-notice-dismiss]:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
[data-dsh-translator-foot] {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.4;
}
[data-dsh-translator-meta] {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-dsh-translator-foot] [data-dsh-translator-act] {
  appearance: none;
  padding: 2px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
[data-dsh-translator-copied] {
  position: absolute;
  right: 12px;
  bottom: 40px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
  opacity: 0.95;
}
[data-dsh-translator-settings] {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
[data-dsh-translator-settings-row] {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
[data-dsh-translator-field] {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 0;
  min-width: 0;
}
[data-dsh-translator-field-head] {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
}
[data-dsh-translator-field-label] {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.5;
}
[data-dsh-translator-field-badges] {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
[data-dsh-translator-badge] {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 1.5;
}
[data-dsh-translator-reset] {
  appearance: none;
  padding: 0;
  border: none;
  background: none;
  color: var(--dsw-alias-brand-primary);
  font-family: inherit;
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
}
[data-dsh-translator-reset]:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
[data-dsh-translator-field-hint] {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.4;
}
[data-dsh-translator-select] {
  position: relative;
}
[data-dsh-translator-select-trigger] {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  box-sizing: border-box;
  padding: 0 10px;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
}
[data-dsh-translator-select-trigger]:focus-visible {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}
[data-dsh-translator-select-trigger]:disabled {
  opacity: 0.5;
  cursor: default;
}
[data-dsh-translator-select-label] {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-dsh-translator-select-arrow] {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-tertiary);
}
[data-dsh-translator-select-menu] {
  position: absolute;
  z-index: 10;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
}
[data-dsh-translator-select-option] {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  cursor: pointer;
}
[data-dsh-translator-select-option]:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-dsh-translator-select-option][aria-selected="true"] {
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-dsh-translator-settings] input {
  height: 34px;
  padding: 0 12px;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
}
[data-dsh-translator-settings] input:focus-visible {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}
[data-dsh-translator-settings] input:disabled {
  opacity: 0.5;
}
[data-dsh-translator-settings-footer] {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
[data-dsh-translator-settings-status] {
  margin-left: auto;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
[data-dsh-translator-settings-discard] {
  appearance: none;
  padding: 5px 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
}
[data-dsh-translator-settings-discard]:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-dimmed);
}
[data-dsh-translator-settings-save] {
  appearance: none;
  padding: 5px 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-layer-3);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
}
[data-dsh-translator-settings-save]:hover:not(:disabled) {
  opacity: 0.92;
}
[data-dsh-translator-settings-discard]:disabled,
[data-dsh-translator-settings-save]:disabled {
  opacity: 0.4;
  cursor: default;
}
[data-dsh-translator-settings-discard]:focus-visible,
[data-dsh-translator-settings-save]:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

[data-dsh-translator-panel-wrap] {
  position: fixed;
  right: 20px;
  top: 96px;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: auto;
  max-height: calc(100vh - 40px);
}
[data-dsh-translator-fab] {
  box-sizing: border-box;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(125, 125, 125, 0.36);
  background: var(--dsh-surface, #fff);
  color: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: grab;
  touch-action: none;
  display: grid;
  place-items: center;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.16);
}
[data-dsh-translator-fab]:active { cursor: grabbing; }
[data-dsh-translator-fab]:hover { box-shadow: 0 8px 26px rgba(0, 0, 0, 0.24); }
[data-dsh-translator-fab]:focus-visible { outline: 2px solid rgba(59, 130, 246, 0.55); outline-offset: 2px; }
[data-dsh-translator-panel] {
  box-sizing: border-box;
  position: absolute;
  top: 54px;
  right: 0;
  width: 404px;
  max-width: calc(100vw - 32px);
  max-height: min(78vh, 660px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(125, 125, 125, 0.32);
  background: var(--dsh-surface, #fff);
  color: inherit;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  font-size: 12.5px;
}
[data-dsh-translator-panel-head] { display: flex; align-items: center; gap: 8px; }
[data-dsh-translator-panel-title] { font-weight: 600; }
[data-dsh-translator-panel-dir] { margin-left: auto; opacity: 0.6; }
[data-dsh-translator-panel-close] {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 16px;
  line-height: 1;
  padding: 2px 4px;
  cursor: pointer;
  opacity: 0.65;
}
[data-dsh-translator-panel-input] {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 68px;
  max-height: 220px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(125, 125, 125, 0.32);
  background: rgba(125, 125, 125, 0.06);
  color: inherit;
  font: inherit;
  line-height: 1.45;
}
[data-dsh-translator-panel-input]:focus-visible { outline: 2px solid rgba(59, 130, 246, 0.55); outline-offset: 1px; }
[data-dsh-translator-panel-tools] { display: flex; align-items: center; gap: 6px; }
[data-dsh-translator-panel-target] {
  max-width: 48%;
  padding: 3px 6px;
  border-radius: 7px;
  border: 1px solid rgba(125, 125, 125, 0.32);
  background: transparent;
  color: inherit;
  font: inherit;
}
[data-dsh-translator-panel-go] {
  padding: 4px 12px;
  border-radius: 7px;
  border: 1px solid rgba(125, 125, 125, 0.32);
  background: rgba(59, 130, 246, 0.12);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
[data-dsh-translator-panel-go]:disabled,
[data-dsh-translator-panel-clear]:disabled { opacity: 0.5; cursor: default; }
[data-dsh-translator-panel-clear] {
  padding: 4px 10px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  opacity: 0.7;
}
[data-dsh-translator-panel-result] {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px dashed rgba(125, 125, 125, 0.28);
  padding-top: 8px;
}
[data-dsh-translator-panel-out] { white-space: pre-wrap; line-height: 1.55; cursor: pointer; }
[data-dsh-translator-panel-meta] { opacity: 0.55; font-size: 11px; }
[data-dsh-translator-panel-error-detail] {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.3;
  opacity: 0.75;
  word-break: break-word;
}
[data-dsh-translator-panel-error] { color: #b91c1c; font-size: 12px; }
[data-dsh-translator-panel-history] {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 1px dashed rgba(125, 125, 125, 0.28);
  padding-top: 8px;
}
[data-dsh-translator-panel-history-head] { display: flex; align-items: center; justify-content: space-between; opacity: 0.7; }
[data-dsh-translator-panel-history-clear] {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  opacity: 0.8;
}
[data-dsh-translator-panel-history-item] {
  display: flex;
  gap: 8px;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 3px 4px;
  border-radius: 6px;
}
[data-dsh-translator-panel-history-item]:hover { background: rgba(125, 125, 125, 0.12); }
[data-dsh-translator-panel-history-src],
[data-dsh-translator-panel-history-dst] { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-dsh-translator-panel-history-src] { opacity: 0.8; }
[data-dsh-translator-panel-history-dst] { font-weight: 500; }
[data-dsh-translator-panel-history-empty] { opacity: 0.5; }
@media (prefers-reduced-motion: reduce) {
  [data-dsh-translator-btn] {
    transition: none;
  }
}
`

/**
 * An opaque, unguessable token for one request/run.
 *
 * The Host cancels by this token alone, so it must be this browser's own name
 * for the run rather than a counter either half keeps: a counter only lines up
 * while one tab runs and nobody ever reloads, which is exactly the case the
 * old protocol broke on.
 */
function runToken() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch (err) { /* fall through to the non-crypto form */ }
  return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/** This page's identity, so the Host can tell one browser from another. */
const CLIENT_ID = runToken()

/**
 * Hard client-side backstop, above the Host's own maximum deadline. It exists
 * only so a wedged Host cannot leave the card spinning forever; the Host's
 * configured timeout is what normally settles a slow provider.
 */
const CLIENT_TIMEOUT_MS = 630000

/** Whether an error came from aborting the fetch rather than from the Host. */
function isAbortError(err) {
  return Boolean(err) && (err.name === 'AbortError' || err.code === 'ABORT_ERR')
}

/** Fold an aborted fetch into the same `cancelled` code the Host reports. */
function normalizeAbort(err) {
  if (!isAbortError(err)) return err
  const cancelled = new Error('cancelled')
  cancelled.code = 'cancelled'
  return cancelled
}

/** Add a backstop deadline to this page's signal, when the browser can. */
function backstopSignal(signal) {
  try {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      && typeof AbortSignal.any === 'function') {
      return AbortSignal.any([signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)])
    }
  } catch (err) { /* older runtime: the page's own signal is all we have */ }
  return signal
}

/** One POST to an exact Fetch route on the authenticated `/api` channel. */
async function callApi(method, payload, signal) {
  let response
  try {
    response = await fetch('api/translator/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    })
  } catch (err) {
    throw normalizeAbort(err)
  }
  const parsed = await response.json().catch(() => null)
  if (!response.ok || parsed === null || parsed.ok !== true) {
    const error = parsed && parsed.error
    const err = new Error(error ? (error.message || error.code) : 'HTTP ' + response.status)
    if (error && typeof error.code === 'string') err.code = error.code
    if (error && typeof error.detail !== 'undefined') err.detail = error.detail
    throw err
  }
  return parsed.value
}

/**
 * The cancel payload for one card: the run token when this half minted one,
 * and the legacy counter otherwise.
 */
function cancelPayload(card) {
  if (card && typeof card.runId === 'string' && card.runId) return { runId: card.runId, clientId: CLIENT_ID }
  return { seq: card ? card.reqId : 0 }
}

const CARD_W = 320

/** How many pinned cards the overlay keeps before the oldest is dropped. */
const MAX_PINNED_CARDS = 3

/**
 * Whether a node lies inside this plugin's own overlay.
 *
 * Walks out of shadow roots and same-origin frame documents rather than
 * stopping at `parentNode`: a slot can render into a shadow tree, and a
 * selection the plugin itself drew must never raise its own button.
 */
function isInsideRoot(target) {
  let node = target
  while (node) {
    if (node.nodeType === 1 && node.hasAttribute && node.hasAttribute('data-dsh-translator-root')) return true
    if (node.nodeType === 11) {
      // A shadow root: keep going from the element that hosts it.
      node = node.host || null
      continue
    }
    if (node.nodeType === 9) {
      // A document: keep going from the frame that holds it, if any.
      const view = node.defaultView
      node = view && view.frameElement ? view.frameElement : null
      continue
    }
    node = node.parentNode
  }
  return false
}

/**
 * The rect the floating button should sit beside.
 *
 * The union rect of a selection that wraps several lines is the whole block,
 * so the button lands on the widest line's right edge — over unrelated
 * content. The caret where the gesture ended is where the reader is looking.
 * Falls back to the union rect when there is no measurable caret.
 */
function selectionAnchorRect(range) {
  const union = range.getBoundingClientRect()
  try {
    const caret = document.createRange()
    caret.setStart(range.endContainer, range.endOffset)
    caret.collapse(true)
    const end = caret.getBoundingClientRect()
    if (end && (end.height > 0 || end.width > 0)) {
      return {
        top: end.top,
        bottom: Math.max(end.bottom, end.top + 8),
        left: end.left,
        right: Math.max(end.right, end.left + 8),
      }
    }
  } catch (err) { /* nothing to measure: the union rect stands in */ }
  return union
}

/** Cancel every in-flight run among `cards`, the pinned ones excepted. */
function cancelLoadingCards(cards) {
  for (const card of cards) {
    if (card && card.status === 'loading' && !card.pinned) cancelLoadingCard(card)
  }
}

function inputSelectionRect(el, start, end) {
  try {
    const cs = window.getComputedStyle(el)
    const width = Math.max(el.clientWidth, 1)
    const css = [
      'position:absolute', 'top:0', 'left:0', 'visibility:hidden', 'pointer-events:none',
      'white-space:pre-wrap',
      'word-break:' + (cs.wordBreak || 'break-word'),
      'overflow-wrap:' + (cs.overflowWrap || 'break-word'),
      'font:' + (cs.font || ''),
      'line-height:' + (cs.lineHeight || 'normal'),
      'letter-spacing:' + (cs.letterSpacing || 'normal'),
      'word-spacing:' + (cs.wordSpacing || 'normal'),
      'tab-size:' + (cs.tabSize || '8'),
      'padding:0', 'border:0', 'box-sizing:border-box',
      'width:' + width + 'px',
    ].join(';')
    function measure(offset) {
      const mirror = document.createElement('div')
      mirror.style.cssText = css
      const mark = document.createElement('span')
      mark.textContent = '\u200b'
      mirror.textContent = el.value.slice(0, offset)
      mirror.appendChild(mark)
      document.body.appendChild(mirror)
      const r = mark.getBoundingClientRect()
      document.body.removeChild(mirror)
      return r
    }
    const s = measure(start)
    const e = measure(end)
    const elRect = el.getBoundingClientRect()
    const padLeft = parseFloat(cs.paddingLeft) || 0
    const padTop = parseFloat(cs.paddingTop) || 0
    const x = elRect.left + padLeft - (el.scrollLeft || 0)
    const y = elRect.top + padTop - (el.scrollTop || 0)
    const top = y + s.top
    const bottom = y + e.bottom
    const left = x + s.left
    const right = x + e.left
    const rect = {
      top,
      bottom: Math.max(bottom, top + 8),
      left,
      right: Math.max(right, left + 8),
    }
    if (rect.right <= rect.left || rect.bottom <= rect.top) return null
    return rect
  } catch (err) {
    return null
  }
}

function currentSelection() {
  const el = document.activeElement
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && typeof el.selectionStart === 'number' && el.selectionStart !== el.selectionEnd) {
    const text = el.value.slice(el.selectionStart, el.selectionEnd).replace(/\s+/g, ' ').trim()
    if (!text) return null
    const rect = inputSelectionRect(el, el.selectionStart, el.selectionEnd)
    if (!rect) return null
    return { text, rect }
  }
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (range.collapsed) return null
  if (isInsideRoot(range.startContainer) || isInsideRoot(range.endContainer)) return null
  const text = range.toString().replace(/\s+/g, ' ').trim()
  if (!text) return null
  const rect = selectionAnchorRect(range)
  if (!rect || (rect.width === 0 && rect.height === 0)) return null
  return { text, rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function cancelLoadingCard(card) {
  if (!card || card.status !== 'loading') return
  // Drop this page's own HTTP request first, then tell the Host to retire the
  // run — the fetch is fire-and-forget, so a wedged Host cannot keep the card
  // alive either way.
  if (typeof card.abort === 'function') {
    try { card.abort() } catch (err) { /* already gone */ }
  }
  callApi('translate-cancel', cancelPayload(card)).catch(() => {})
}

function PinIcon(props) {
  return react.createElement('svg', { viewBox: '0 0 24 24', width: 13, height: 13, 'aria-hidden': true, fill: props.filled ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    react.createElement('path', { d: 'M12 17v5' }),
    react.createElement('path', { d: 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z' }),
  )
}

// Universal translate glyph: lucide "languages" (MIT) — the 文/A pair as one
// vector path; stroke style matches the card's Pin/X icons, currentColor.
function TranslateIcon() {
  return react.createElement('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    react.createElement('path', { d: 'm5 8l6 6m-7 0l6-6l2-3M2 5h12M7 2h1m14 20l-5-10l-5 10m2-4h6' }),
  )
}

function XIcon() {
  return react.createElement('svg', { viewBox: '0 0 24 24', width: 13, height: 13, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    react.createElement('path', { d: 'M18 6 6 18' }),
    react.createElement('path', { d: 'm6 6 12 12' }),
  )
}

function ChevronDownIcon() {
  return react.createElement('svg', { viewBox: '0 0 24 24', width: 14, height: 14, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    react.createElement('path', { d: 'm6 9 6 6 6-6' }),
  )
}

// The framework delivers the typed `t` seat (a `Translate(key, params)`
// function) because both registrations declare `locale: 'dsh-translator'`; the
// dictionary-backed fallback covers a seat the runtime did not forward.
// Never read the dictionary by property here: `props.t` is a function, so
// `t.tooltip` would silently be `undefined`.
function translate(props) {
  if (props && typeof props.t === 'function') return props.t
  return (key) => I18N.zh[key]
}

// ---------------------------------------------------------------------------
// Standalone input panel
//
// The selection popup answers "what does this mean"; the panel answers "translate
// what I am typing, into the language I choose". It mounts into the same overlay
// root, so a selection made inside the panel never raises the popup button, and
// the host resolves `target: 'auto'` exactly as it does for a selection.
// ---------------------------------------------------------------------------
const PANEL_STORE_KEY = 'dsh-translator:panel'
const PANEL_HISTORY_MAX = 24
const PANEL_TARGETS = [
  ['auto', 'panelAuto', null],
  ['zh-Hans', null, '简体中文'],
  ['zh-Hant', null, '繁體中文'],
  ['en', null, 'English'],
  ['ja-JP', null, '日本語'],
  ['ko-KR', null, '한국어'],
  ['ru-RU', null, 'Русский'],
]

function shortenText(text, max) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max) + '…' : flat
}

function copyToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') return navigator.clipboard.writeText(text)
  return new Promise(function (resolve) {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try { document.execCommand('copy') } catch (err) {}
    document.body.removeChild(area)
    resolve()
  })
}

const FAB_SIZE = 44
const PANEL_WIDTH = 404
const DRAG_DOWN = typeof window !== 'undefined' && typeof window.PointerEvent === 'function' ? 'onPointerDown' : 'onMouseDown'
const DRAG_MOVE = DRAG_DOWN === 'onPointerDown' ? 'pointermove' : 'mousemove'
const DRAG_UP = DRAG_DOWN === 'onPointerDown' ? 'pointerup' : 'mouseup'

function panelViewport() {
  return { vw: window.innerWidth || 1280, vh: window.innerHeight || 800 }
}

/**
 * The button is the only anchor the panel has, so it has to stay reachable:
 * keep it fully inside the window and leave room for the panel to the right.
 */
function clampPanelPos(pos) {
  const { vw, vh } = panelViewport()
  const maxLeft = Math.max(8, vw - FAB_SIZE - 8)
  const maxTop = Math.max(8, vh - FAB_SIZE - 8)
  return {
    left: Math.min(Math.max(pos.left, 8), maxLeft),
    top: Math.min(Math.max(pos.top, 8), maxTop),
  }
}

function readPos(raw) {
  if (!raw || typeof raw.left !== 'number' || typeof raw.top !== 'number') return null
  if (!Number.isFinite(raw.left) || !Number.isFinite(raw.top)) return null
  return clampPanelPos(raw)
}

function readPanelStore() {
  const empty = { open: false, target: 'auto', history: [], pos: null }
  try {
    const raw = window.localStorage.getItem(PANEL_STORE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw)
    const target = PANEL_TARGETS.some((t) => t[0] === parsed.target) ? parsed.target : 'auto'
    const history = Array.isArray(parsed.history)
      ? parsed.history.filter((e) => e && typeof e.text === 'string').slice(0, PANEL_HISTORY_MAX)
      : []
    return { open: parsed.open === true, target, history, pos: readPos(parsed.pos) }
  } catch (err) {
    return empty
  }
}

function writePanelStore(next) {
  try { window.localStorage.setItem(PANEL_STORE_KEY, JSON.stringify(next)) } catch (err) {}
}

/**
 * Keeps a failure inside the panel: the overlay renders the selection popup and
 * the panel from the same tree, so an exception thrown by the panel must not
 * unmount the popup as well.
 */
class PanelBoundary extends react.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(err) {
    console.error('[dsh-translator] input panel failed:', err)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function TranslationPanel(props) {
  const t = props.t
  const renderDict = props.renderDict
  const h = react.createElement
  const [store, setStore] = react.useState(readPanelStore)
  const [input, setInput] = react.useState('')
  const [phase, setPhase] = react.useState('idle')
  const [result, setResult] = react.useState(null)
  const [error, setError] = react.useState(null)
  const [copied, setCopied] = react.useState(false)
  const seq = react.useRef(0)
  const panelRef = react.useRef(null)
  const dragRef = react.useRef(null)
  const suppressClick = react.useRef(false)
  const [live, setLive] = react.useState(null)
  const [tick, setTick] = react.useState(0)

  /**
   * Dragging is how the button escapes whatever else the reader has parked in
   * a corner: the position is committed only after a real move, so a plain
   * click still just opens the panel.
   */
  function startDrag(e) {
    if (typeof e.button === 'number' && e.button !== 0) return
    suppressClick.current = false
    const rect = e.currentTarget.getBoundingClientRect()
    const base = store.pos || { left: rect.left, top: rect.top }
    const started = { x: e.clientX, y: e.clientY, left: base.left, top: base.top, moved: false, last: null }
    dragRef.current = started
    function onMove(ev) {
      const current = dragRef.current
      if (!current) return
      const dx = ev.clientX - current.x
      const dy = ev.clientY - current.y
      if (!current.moved && Math.abs(dx) + Math.abs(dy) < 4) return
      current.moved = true
      current.last = clampPanelPos({ left: current.left + dx, top: current.top + dy })
      setLive(current.last)
    }
    function finish() {
      window.removeEventListener(DRAG_MOVE, onMove)
      window.removeEventListener(DRAG_UP, finish)
      dragRef.current = null
      setLive(null)
      // A drag is followed by a synthetic click; swallow exactly that one. The
      // guard is cleared again by the next pointerdown, so a drag that ends
      // outside the button cannot eat an unrelated click later on.
      suppressClick.current = started.moved
      if (started.moved && started.last) commit({ pos: started.last })
    }
    window.addEventListener(DRAG_MOVE, onMove)
    window.addEventListener(DRAG_UP, finish)
    if (e.preventDefault) e.preventDefault()
  }

  function commit(patch) {
    const next = Object.assign({}, store, patch)
    setStore(next)
    writePanelStore({ open: next.open, target: next.target, history: next.history, pos: next.pos })
  }

  react.useEffect(() => {
    if (!store.open) return undefined
    function onResize() {
      setTick(function (n) { return n + 1 })
    }
    window.addEventListener('resize', onResize)
    return function () { window.removeEventListener('resize', onResize) }
  }, [store.open])

  async function submit() {
    const text = input.trim()
    if (!text || phase === 'loading') return
    const mine = ++seq.current
    setPhase('loading')
    setError(null)
    setResult(null)
    try {
      const payload = { text, clientId: CLIENT_ID, runId: 'panel-' + mine }
      if (store.target !== 'auto') payload.target = store.target
      const value = await callApi('translate', payload)
      if (mine !== seq.current) return
      if (!value || typeof value !== 'object') {
        setPhase('error')
        setError({ text: t('errorFailed'), detail: 'empty response' })
        return
      }
      setResult(value)
      setPhase('done')
      const entry = { text, out: typeof value.text === 'string' ? value.text : '', target: value.target, at: Date.now() }
      commit({
        history: [entry]
          .concat(store.history.filter((item) => item.text !== text || item.target !== value.target))
          .slice(0, PANEL_HISTORY_MAX),
      })
    } catch (err) {
      if (mine !== seq.current) return
      const code = err && typeof err.code === 'string' ? err.code : 'failed'
      const key = Object.prototype.hasOwnProperty.call(ERROR_KEY, code) ? ERROR_KEY[code] : 'errorFailed'
      const detail = err && err.detail !== undefined ? JSON.stringify(err.detail) : ''
      setPhase('error')
      // The localized line is for the reader; the raw code is what makes a
      // report actionable, so it stays visible next to it.
      setError({ text: t(key), detail: [code, err && err.message, detail].filter(Boolean).join(' · ') })
    }
  }

  function copyOut() {
    if (!result || typeof result.text !== 'string' || !result.text) return
    copyToClipboard(result.text).then(function () {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    })
  }

  function targetLabel() {
    const found = PANEL_TARGETS.find((item) => item[0] === store.target)
    if (!found) return t('panelAuto')
    return found[1] ? t(found[1]) : found[2]
  }

  const pos = live || store.pos
  const dragProps = {}
  dragProps[DRAG_DOWN] = startDrag
  const fab = h('button', Object.assign({
    key: 'fab',
    type: 'button',
    'data-dsh-translator-fab': '',
    title: t('panelOpen') + ' — ' + t('panelDragHint'),
    'aria-label': t('panelOpen'),
    onClick: () => {
      if (suppressClick.current) { suppressClick.current = false; return }
      commit({ open: !store.open })
    },
    onContextMenu: (e) => {
      if (e.preventDefault) e.preventDefault()
      if (store.pos) commit({ pos: null })
    },
  }, dragProps), h('span', { 'data-dsh-translator-fab-glyph': '' }, '译'))

  // Placement is computed against the button, not the page: the panel is
  // absolutely positioned inside the wrap, slides left until its right edge
  // sits on the button's right edge, and flips above the button when there is
  // more room up there than down.
  const view = panelViewport()
  const fabLeft = pos ? pos.left : Math.max(8, view.vw - 20 - FAB_SIZE)
  const fabTop = pos ? pos.top : 96
  const width = Math.min(PANEL_WIDTH, Math.max(240, view.vw - 16))
  const left = Math.max(8, Math.min(fabLeft + FAB_SIZE - width, view.vw - width - 8))
  const gap = FAB_SIZE + 10
  const roomBelow = view.vh - fabTop - gap - 8
  const roomAbove = fabTop - gap - 8
  const openUp = roomAbove > roomBelow
  const sideRoom = Math.max(roomAbove, roomBelow)
  const docked = Math.max(200, Math.min(660, view.vh - 16, sideRoom))
  // Squeezing the panel into a sliver beside the button is what reads as
  // "cut off", so when neither side is roomy it takes the whole window and the
  // close button (or Esc) put it away.
  const full = Math.max(200, Math.min(900, view.vh - 16))
  // Less than a readable strip beside the button means "dock to the window".
  const useFull = sideRoom < 240 && full > sideRoom + 40
  const room = useFull ? full : docked
  const panelStyle = {
    left: left - fabLeft + 'px',
    right: 'auto',
    width: width + 'px',
    maxHeight: room + 'px',
    ...(useFull
      ? { top: 8 - fabTop + 'px', bottom: 'auto' }
      : openUp
        ? { bottom: gap + 'px', top: 'auto' }
        : { top: gap + 'px', bottom: 'auto' }),
  }
  const wrapStyle = pos
    ? { left: pos.left + 'px', top: pos.top + 'px', right: 'auto', alignItems: 'flex-start' }
    : undefined
  // Hovering the panel shows the numbers the placement used, which beats
  // guessing them from a screenshot when a corner still looks wrong.
  const panelDebug = 'panel ' + view.vw + 'x' + view.vh + (pos ? ' @' + pos.left + ',' + pos.top : ' default')
    + ' w' + width + ' h' + room + (useFull ? ' full' : openUp ? ' up' : ' down')

  if (!store.open) return h('div', { 'data-dsh-translator-panel-wrap': '', style: wrapStyle }, fab)

  const parts = []
  parts.push(h('div', { key: 'head', 'data-dsh-translator-panel-head': '' },
    h('span', { 'data-dsh-translator-panel-title': '' }, t('panelTitle')),
    h('span', { 'data-dsh-translator-panel-dir': '' }, result && result.target ? langName(result.target) : targetLabel()),
    h('button', {
      key: 'close',
      type: 'button',
      'data-dsh-translator-panel-close': '',
      title: t('close'),
      onClick: () => commit({ open: false }),
    }, '×')))

  parts.push(h('textarea', {
    key: 'input',
    'data-dsh-translator-panel-input': '',
    value: input,
    rows: 4,
    placeholder: t('panelPlaceholder'),
    onChange: (e) => setInput(e.target.value),
    onKeyDown: (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); commit({ open: false }) }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit() }
    },
  }))

  parts.push(h('div', { key: 'tools', 'data-dsh-translator-panel-tools': '' },
    h('select', {
      'data-dsh-translator-panel-target': '',
      value: store.target,
      title: t('panelTarget'),
      onChange: (e) => commit({ target: e.target.value }),
    }, ...PANEL_TARGETS.map(([value, key, label]) => h('option', { key: value, value }, key ? t(key) : label))),
    h('button', {
      'data-dsh-translator-panel-go': '',
      type: 'button',
      disabled: phase === 'loading' || !input.trim(),
      onClick: submit,
    }, phase === 'loading' ? t('translating') : t('panelGo')),
    h('button', {
      'data-dsh-translator-panel-clear': '',
      type: 'button',
      disabled: !input,
      onClick: () => setInput(''),
    }, t('panelClear'))))

  if (phase === 'error' && error) {
    parts.push(h('div', { key: 'err', 'data-dsh-translator-panel-error': '' },
      h('div', {}, error.text),
      error.detail ? h('div', { 'data-dsh-translator-panel-error-detail': '' }, error.detail) : null))
  }

  if (result) {
    const children = []
    children.push(h('div', {
      key: 'out',
      'data-dsh-translator-panel-out': '',
      title: t('copied'),
      onClick: copyOut,
    }, typeof result.text === 'string' ? result.text : ''))
    if (result.dict && typeof result.dict === 'object') children.push(renderDict(result.dict))
    const meta = [langName(result.target)]
    if (result.engine === 'api') { if (result.provider) meta.push(result.provider) } else if (result.model) meta.push(result.model)
    if (copied) meta.push(t('copied'))
    children.push(h('div', { key: 'meta', 'data-dsh-translator-panel-meta': '' }, meta.filter(Boolean).join(' · ')))
    parts.push(h('div', { key: 'result', 'data-dsh-translator-panel-result': '' }, ...children))
  }

  const history = store.history
  parts.push(h('div', { key: 'history', 'data-dsh-translator-panel-history': '' },
    h('div', { 'data-dsh-translator-panel-history-head': '' },
      h('span', {}, t('panelHistory')),
      history.length
        ? h('button', {
            type: 'button',
            'data-dsh-translator-panel-history-clear': '',
            onClick: () => commit({ history: [] }),
          }, t('panelHistoryClear'))
        : null),
    history.length === 0
      ? h('div', { 'data-dsh-translator-panel-history-empty': '' }, t('panelHistoryEmpty'))
      : history.slice(0, 8).map((item, i) => h('button', {
          key: 'h' + i,
          type: 'button',
          'data-dsh-translator-panel-history-item': '',
          title: item.text,
          onClick: () => {
            setInput(item.text)
            setResult({ target: item.target, text: item.out, dict: item.dict, engine: 'api' })
            setPhase('done')
            setError(null)
          },
        },
        h('span', { 'data-dsh-translator-panel-history-src': '' }, shortenText(item.text, 42)),
        h('span', { 'data-dsh-translator-panel-history-dst': '' }, shortenText(item.out, 42))))))

  return h('div', { 'data-dsh-translator-panel-wrap': '', style: wrapStyle }, fab, h('div', {
    'data-dsh-translator-panel': '',
    ref: panelRef,
    style: panelStyle,
    title: panelDebug,
    onKeyDown: (e) => {
      if (e.key !== 'Escape') return
      if (e.stopPropagation) e.stopPropagation()
      commit({ open: false })
    },
  }, ...parts))
}

function TranslatorRoot(props) {
  const t = translate(props)
  const [btn, setBtn] = react.useState(null)
  const [card, setCard] = react.useState(null)
  // Cards the reader pinned. They live outside the active slot so a new
  // translation cannot destroy one, which is the whole promise of the pin.
  const [extra, setExtra] = react.useState([])
  const [copied, setCopied] = react.useState(null)
  // Read once per mount; dismissing writes it back so the notice is a one-time
  // thing per browser rather than per card.
  const [privacyAck, setPrivacyAck] = react.useState(() => privacyAcknowledged())

  /**
   * Everything this instance mutates outside React's state.
   *
   * A ref rather than module scope: the bundle body is evaluated once, so
   * module-level mutables would be shared by every generation a hot reload
   * leaves behind, and one instance's teardown would discard another's
   * in-flight result.
   */
  const ref = react.useRef(null)
  if (ref.current === null) {
    ref.current = {
      cardSeq: 0,
      requestSeq: 0,
      selHideTimer: null,
      btnSuppressed: false,
      btnText: null,
      dragging: false,
      dragKey: null,
      dragStartX: 0,
      dragStartY: 0,
      dragLeft: 0,
      dragTop: 0,
      suppressNextUp: false,
      unmounted: false,
      cards: [],
      rootEl: null,
    }
  }
  const state = ref.current
  // The event handlers created inside the mount effect run long after the
  // render that created them, so they read the current cards from here rather
  // than from a render-scoped closure.
  state.cards = card ? [card, ...extra] : extra.slice()

  function cardOf(key) {
    return state.cards.find(c => c.key === key) || null
  }

  /** Whether this card is still the one waiting for `id`'s answer. */
  function holdsCard(key, id) {
    if (state.unmounted) return false
    const target = cardOf(key)
    return Boolean(target && target.reqId === id)
  }

  /** Apply a patch to whichever list holds this card. */
  function updateCard(key, patch) {
    setCard(prev => (prev && prev.key === key ? { ...prev, ...patch } : prev))
    setExtra(prev => (prev.some(c => c.key === key) ? prev.map(c => (c.key === key ? { ...c, ...patch } : c)) : prev))
  }

  /** The run tokens that must survive the next translation: the pinned cards'. */
  function pinnedRunIds() {
    const out = []
    for (const c of state.cards) {
      if (c.pinned && typeof c.runId === 'string' && c.runId) out.push(c.runId)
    }
    return out
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    } catch (err) { /* ignore */ }
  }

  function copy(target, which) {
    const text = which === 'source' ? target.text : ((target.result && target.result.text) || target.error)
    if (!text) return
    setCopied({ key: target.key, which })
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {}).catch(() => fallbackCopy(text))
      } else {
        fallbackCopy(text)
      }
    } catch (err) {
      fallbackCopy(text)
    }
  }

  react.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(null), 1200)
    return () => clearTimeout(timer)
  }, [copied])

  function beginDrag(e, key) {
    const target = cardOf(key)
    if (!target || target.pinned) return
    state.dragging = true
    state.dragKey = key
    state.dragStartX = e.clientX
    state.dragStartY = e.clientY
    state.dragLeft = target.left
    state.dragTop = target.top
    e.preventDefault()
  }

  function onDragMove(e) {
    if (!state.dragging) return
    const target = cardOf(state.dragKey)
    if (!target) return
    const left = clamp(state.dragLeft + (e.clientX - state.dragStartX), 0, Math.max(0, window.innerWidth - target.width))
    const top = clamp(state.dragTop + (e.clientY - state.dragStartY), 0, Math.max(0, window.innerHeight - 80))
    updateCard(state.dragKey, { left, top, dragged: true })
  }

  function onDragEnd() {
    if (state.dragging) { state.dragging = false; state.suppressNextUp = true }
  }

  // Shared by the mouseup flow and the close button: re-show the floating
  // button when the selection is still present, honor the suppression flag.
  function refreshButton() {
    if (state.btnSuppressed) return
    const info = currentSelection()
    if (!info) {
      setBtn(null)
      state.btnText = null
      return
    }
    const rect = info.rect
    const left = clamp(rect.right - 8 - 32, 4, window.innerWidth - 36)
    let top = rect.top - 32 - 6
    if (top < 4) top = rect.bottom + 6
    setBtn({ left, top, text: info.text, rect })
    state.btnText = info.text
  }

  /**
   * Drop every card the reader did not pin, cancelling what they were loading.
   *
   * Written against `state.cards` and functional updates because the mount
   * effect calls it: a render-scoped closure would still see the first render.
   */
  function dismissCards() {
    cancelLoadingCards(state.cards)
    setCard(prev => (prev && !prev.pinned ? null : prev))
    setExtra(prev => (prev.some(c => !c.pinned) ? prev.filter(c => c.pinned) : prev))
  }

  /** Close one card, whoever owns it. */
  function closeCard(key) {
    const target = cardOf(key)
    if (target && target.status === 'loading') cancelLoadingCard(target)
    setCard(prev => (prev && prev.key === key ? null : prev))
    setExtra(prev => (prev.some(c => c.key === key) ? prev.filter(c => c.key !== key) : prev))
    state.btnSuppressed = false
    refreshButton()
  }

  /**
   * Pin or unpin one card.
   *
   * Pinning the active card moves it out of the active slot instead of marking
   * it in place: that is what lets the reader start another translation without
   * destroying the one they asked to keep, and what keeps its in-flight run
   * alive — {@link pinnedRunIds} rides along on the next request so the Host
   * leaves it alone.
   */
  function togglePin(key) {
    if (card && card.key === key) {
      const moved = { ...card, pinned: true }
      setExtra(prev => {
        const next = [...prev, moved]
        while (next.length > MAX_PINNED_CARDS) {
          const dropped = next.shift()
          if (dropped && dropped.status === 'loading') cancelLoadingCard(dropped)
        }
        return next
      })
      setCard(null)
      return
    }
    setExtra(prev => prev.map(c => (c.key === key ? { ...c, pinned: !c.pinned } : c)))
  }

  react.useEffect(() => {
    state.unmounted = false
    function onMouseUp(e) {
      if (state.suppressNextUp) { state.suppressNextUp = false; return }
      if (state.dragging) return
      if (isInsideRoot(e.target)) return
      state.btnSuppressed = false
      dismissCards()
      const info = currentSelection()
      if (!info) {
        setBtn(null)
        state.btnText = null
        return
      }
      refreshButton()
    }

    /**
     * A selection made by touch or a pen.
     *
     * `selectionchange` deliberately never shows the button — it fires
     * throughout the gesture — and a long-press selection does not reliably
     * synthesise `mouseup`, so the pointer that ends the gesture is the signal.
     * One tick later, because the browser may still be settling the selection
     * when the event arrives.
     */
    function onPointerUp(e) {
      if (e.pointerType === 'mouse') return
      if (isInsideRoot(e.target)) return
      state.btnSuppressed = false
      setTimeout(() => {
        if (state.unmounted) return
        dismissCards()
        refreshButton()
      }, 0)
    }

    /** A touch or pen gesture starting: hide the button it is about to replace. */
    function onPointerDown(e) {
      if (e.pointerType === 'mouse') return
      if (!isInsideRoot(e.target)) { setBtn(null); state.btnText = null }
    }

    function onSelectionChange() {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        if (typeof el.selectionStart === 'number' && el.selectionStart !== el.selectionEnd) return
      }
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        // Debounce: a streaming DOM update can transiently collapse the
        // selection; only hide if it stays empty for a moment.
        if (state.selHideTimer) clearTimeout(state.selHideTimer)
        state.selHideTimer = setTimeout(() => { setBtn(null); state.btnText = null }, 200)
        return
      }
      if (state.selHideTimer) { clearTimeout(state.selHideTimer); state.selHideTimer = null }
      const range = sel.getRangeAt(0)
      if (isInsideRoot(range.startContainer) || isInsideRoot(range.endContainer)) {
        setBtn(null)
        state.btnText = null
        return
      }
      // Do NOT show the button here: selectionchange fires continuously while
      // the user is still dragging a selection. Only a pointer that ends the
      // gesture shows the button.
    }

    function onMouseDown(e) {
      // Starting a new interaction/selection hides any lingering button.
      if (!isInsideRoot(e.target)) { setBtn(null); state.btnText = null }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        state.btnSuppressed = false
        dismissCards()
        setBtn(null)
      }
    }

    function onScroll(e) {
      if (isInsideRoot(e.target)) return
      if (state.btnSuppressed) return
      // Streaming output triggers continuous scroll events. Do not dismiss
      // the UI: reposition the button while the selection stays on screen,
      // hide only when it scrolls out of view. The card is fixed and stays.
      const info = currentSelection()
      if (!info) { setBtn(null); state.btnText = null; return }
      const r = info.rect
      if (r.bottom < -20 || r.top > window.innerHeight + 20 || r.right < -20 || r.left > window.innerWidth + 20) {
        setBtn(null)
        state.btnText = null
        return
      }
      if (state.btnText !== info.text) return
      const left = clamp(r.right - 8 - 32, 4, window.innerWidth - 36)
      let top = r.top - 32 - 6
      if (top < 4) top = r.bottom + 6
      setBtn({ left, top, text: info.text, rect: r })
    }

    function onResize() {
      dismissCards()
      setBtn(null)
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onDragEnd)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      state.unmounted = true
      // A pending debounce would otherwise fire 200 ms after teardown and touch
      // the unmounted tree.
      if (state.selHideTimer) { clearTimeout(state.selHideTimer); state.selHideTimer = null }
      // Unmounting abandons every run, pinned ones included: nothing is left to
      // receive their result.
      for (const c of state.cards) cancelLoadingCard(c)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onDragEnd)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('mousemove', onDragMove)
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // The initial placement uses an estimated height (280 px). Once the card
  // is rendered, measure it and snap the position to the real height —
  // otherwise an above-placed card leaves a gap between its bottom and the
  // selection when the real height is smaller than the estimate.
  react.useEffect(() => {
    if (!card || !card.anchor || card.dragged) return
    // Measured through this instance's own root rather than the document: the
    // slot may have rendered us into a shadow tree, where a document query
    // finds nothing.
    const scope = state.rootEl
    const el = scope && scope.querySelector ? scope.querySelector('[data-dsh-translator-card="' + card.key + '"]') : null
    if (!el) return
    const h = el.offsetHeight
    let top = card.anchor.bottom + 10
    if (top + h > window.innerHeight - 8) top = card.anchor.top - h - 10
    top = clamp(top, 8, Math.max(8, window.innerHeight - h - 8))
    if (Math.abs(top - card.top) > 2) updateCard(card.key, { top })
  }, [card])

  /**
   * The card's primary error line, always from the dictionary.
   *
   * The raw message is deliberately not a fallback: an unmapped code would
   * print the Host's internal English (and, for a provider rejection, whatever
   * that provider chose to echo back). It belongs on the diagnostic line,
   * redacted by {@link redactDiagnostic}.
   */
  function errorText(errCode) {
    const key = errCode && ERROR_KEY[errCode]
    return key ? t(key) : t('errorFailed')
  }

  function translateText(text, opts, key) {
    const retry = opts !== undefined && opts.retry === true
    const id = ++state.requestSeq
    // The run token and the fetch controller belong to this card: the Host
    // cancels by the token, and this page can drop its own request first.
    const runId = runToken()
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    updateCard(key, {
      status: 'loading',
      error: null,
      errorDetail: null,
      reqId: id,
      runId,
      abort: controller ? () => controller.abort() : null,
    })
    const payload = {
      text,
      runId,
      clientId: CLIENT_ID,
      retry,
      // Ask the Host to leave the pinned cards' runs alone: this request
      // supersedes the reader's other runs, not the ones they kept.
      keep: pinnedRunIds(),
    }
    callApi('translate', payload, controller ? backstopSignal(controller.signal) : undefined).then((value) => {
      if (!holdsCard(key, id)) return
      const v = value && typeof value === 'object' ? value : {}
      if (typeof v.text === 'string') {
        updateCard(key, { status: 'done', result: { target: v.target, text: v.text, dict: v.dict, engine: v.engine, provider: v.provider, truncated: v.truncated === true, untranslated: v.untranslated === true, cached: v.cached === true, model: v.model, reasoningEffort: v.reasoningEffort, tokens: v.tokens } })
      } else {
        updateCard(key, { status: 'error', error: errorText() })
      }
    }).catch((err) => {
      if (!holdsCard(key, id)) return
      // The primary line is localized; the secondary line carries the
      // structured per-provider record when there is one, and otherwise the
      // redacted message, so a failure stays diagnosable without leaking.
      updateCard(key, {
        status: 'error',
        error: errorText(err && err.code),
        errorDetail: failureDetail(t, err && err.detail) || redactDiagnostic(err && err.message),
      })
    })
  }

  function openPopup() {
    if (!btn) return
    // The button is a one-shot trigger: hide it once the card takes over.
    state.btnSuppressed = true
    setBtn(null)
    // Whatever occupied the active slot is being replaced. A pinned card has
    // already left it (togglePin moves it out), so its run is not at risk here.
    if (card && card.status === 'loading') cancelLoadingCard(card)
    const rect = btn.rect
    const maxH = Math.min(window.innerHeight * 0.6, 420)
    const estH = Math.min(maxH, 280)
    let top = rect.bottom + 10
    if (top + estH > window.innerHeight - 8) top = rect.top - estH - 10
    top = clamp(top, 8, Math.max(8, window.innerHeight - estH - 8))
    const left = clamp(rect.left, 8, Math.max(8, window.innerWidth - CARD_W - 8))
    const key = ++state.cardSeq
    setCard({ key, left, top, width: CARD_W, text: btn.text, status: 'loading', result: null, error: null, reqId: 0, anchor: rect, pinned: false })
    translateText(btn.text, undefined, key)
  }

  /** One card's markup. Shared by the active slot and every pinned card. */
  /**
   * The dictionary block under an answer, or null when there is nothing to say.
   *
   * Sections appear only when the host supplied them, in reading order: 音标,
   * then 释义 grouped by 词性, then the alternative translations, 词组短语,
   * 同近义词, 变形 and 双语例句. A word with six meanings gets six lines, not
   * one joined line — the whole point of a dictionary card.
   */
  function renderDictionary(dict) {
    if (!dict || typeof dict !== 'object') return null
    const rows = []
    const label = (key, text) => react.createElement('div', { key, 'data-dsh-translator-dict-label': '' }, text)
    const line = (key, text) => react.createElement('div', { key, 'data-dsh-translator-dict-def': '' }, text)

    const phonetic = dict.phonetic && typeof dict.phonetic === 'object' ? dict.phonetic : {}
    const phoneticBits = []
    if (phonetic.uk) phoneticBits.push(t('dictUk') + ' [' + phonetic.uk + ']')
    if (phonetic.us) phoneticBits.push(t('dictUs') + ' [' + phonetic.us + ']')
    if (!phonetic.uk && !phonetic.us) {
      // A Chinese headword has 拼音; anything else may only have the source
      // romanization the provider reported, which is better than nothing.
      if (phonetic.pinyin) phoneticBits.push(t('dictPinyin') + ' ' + phonetic.pinyin)
      else if (phonetic.source) phoneticBits.push('[' + phonetic.source + ']')
    }
    if (phoneticBits.length) {
      rows.push(react.createElement('div', { key: 'ph', 'data-dsh-translator-dict-phonetic': '' }, phoneticBits.join('  ')))
    }

    const senses = Array.isArray(dict.senses)
      ? dict.senses.filter((s) => s && Array.isArray(s.defs) && s.defs.length > 0)
      : []
    if (senses.length) {
      const children = [label('l', t('dictSenses'))]
      senses.slice(0, 8).forEach((sense, i) => {
        children.push(react.createElement('div', { key: 's' + i, 'data-dsh-translator-dict-sense': '' },
          sense.pos ? react.createElement('span', { 'data-dsh-translator-dict-pos': '' }, sense.pos) : null,
          ...sense.defs.slice(0, 8).map((def, j) => line('d' + i + '-' + j, def))))
      })
      rows.push(react.createElement('div', { key: 'senses' }, ...children))
    } else if (Array.isArray(dict.web) && dict.web.length) {
      // A Chinese headword has no 词性 table; its 网络释义 is the sense list.
      rows.push(react.createElement('div', { key: 'web' }, label('l', t('dictWeb')),
        ...dict.web.slice(0, 6).map((value, i) => line('w' + i, value))))
    }

    const groups = Array.isArray(dict.groups) ? dict.groups : []
    const groupRows = []
    groups.slice(0, 6).forEach((group, i) => {
      const terms = group && Array.isArray(group.terms) ? group.terms.filter((x) => typeof x === 'string') : []
      if (terms.length === 0) return
      groupRows.push(react.createElement('div', { key: 'g' + i, 'data-dsh-translator-dict-group': '' },
        group && group.pos ? react.createElement('span', { 'data-dsh-translator-dict-pos': '' }, group.pos) : null,
        ...terms.slice(0, 12).map((term, j) => react.createElement('span', { key: 't' + j, 'data-dsh-translator-dict-term': '' }, term))))
    })
    if (groupRows.length) rows.push(react.createElement('div', { key: 'alt' }, label('l', t('dictAlt')), ...groupRows))

    const phrases = Array.isArray(dict.phrases) ? dict.phrases.filter((p) => p && p.src) : []
    if (phrases.length) {
      rows.push(react.createElement('div', { key: 'phrases' }, label('l', t('dictPhrases')),
        ...phrases.slice(0, 8).map((phrase, i) => react.createElement('div', { key: 'p' + i, 'data-dsh-translator-dict-phrase': '' },
          react.createElement('span', { 'data-dsh-translator-dict-phrase-src': '' }, phrase.src),
          phrase.dst ? react.createElement('span', { 'data-dsh-translator-dict-phrase-dst': '' }, phrase.dst) : null))))
    }

    const synonyms = Array.isArray(dict.synonyms) ? dict.synonyms.filter((s) => s && Array.isArray(s.words) && s.words.length) : []
    if (synonyms.length) {
      rows.push(react.createElement('div', { key: 'synonyms' }, label('l', t('dictSynonyms')),
        ...synonyms.slice(0, 3).map((group, i) => react.createElement('div', { key: 's' + i, 'data-dsh-translator-dict-group': '' },
          group.pos ? react.createElement('span', { 'data-dsh-translator-dict-pos': '' }, group.pos) : null,
          ...group.words.slice(0, 8).map((word, j) => react.createElement('span', { key: 'w' + j, 'data-dsh-translator-dict-term': '' }, word)),
          group.tran ? react.createElement('span', { 'data-dsh-translator-dict-syn-tran': '' }, group.tran) : null))))
    }

    const forms = Array.isArray(dict.forms) ? dict.forms.filter((f) => f && f.name && f.value) : []
    if (forms.length) {
      rows.push(react.createElement('div', { key: 'forms', 'data-dsh-translator-dict-forms': '' },
        forms.slice(0, 6).map((f) => f.name + ' ' + f.value).join(' · ')))
    }

    const examples = Array.isArray(dict.examples) ? dict.examples.filter((e) => e && e.src) : []
    if (examples.length) {
      rows.push(react.createElement('div', { key: 'ex', 'data-dsh-translator-dict-examples': '' }, label('l', t('dictExamples')),
        ...examples.slice(0, 3).map((e, i) => react.createElement('div', { key: 'e' + i },
          react.createElement('span', { 'data-dsh-translator-dict-example-src': '' }, e.src),
          e.dst ? react.createElement('span', { 'data-dsh-translator-dict-example-dst': '' }, ' — ' + e.dst) : null))))
    }

    if (rows.length === 0) return null
    return react.createElement('div', { key: 'dict', 'data-dsh-translator-dict': '' }, ...rows)
  }

  function renderCard(c) {
    const bodyChildren = []
    if (c.status === 'loading') {
      bodyChildren.push(react.createElement('div', { key: 'loading' }, t('translating')))
    } else if (c.status === 'error') {
      bodyChildren.push(react.createElement('div', { key: 'err', 'data-dsh-translator-error': '' }, c.error))
      if (c.errorDetail) bodyChildren.push(react.createElement('div', { key: 'errdetail', 'data-dsh-translator-error-detail': '' }, c.errorDetail))
    } else if (c.result) {
      bodyChildren.push(react.createElement('div', { key: 'ok' }, c.result.text))
      // The dictionary is part of the answer, so it scrolls with the body.
      const dictEl = renderDictionary(c.result.dict)
      if (dictEl) bodyChildren.push(dictEl)
    }
    const footChildren = []
    if (c.result && c.result.engine === 'api') {
      // The free path has no model and no token count; naming the provider it
      // actually used is the only honest metadata it can show.
      const metaParts = []
      if (c.result.target) metaParts.push('→ ' + langName(c.result.target))
      if (c.result.provider) metaParts.push(providerName(t, c.result.provider))
      if (metaParts.length) footChildren.push(react.createElement('span', { key: 'dir', 'data-dsh-translator-meta': '' }, metaParts.join(' · ')))
    } else if (c.result && c.result.engine === 'model') {
      const metaParts = []
      if (c.result.target) metaParts.push('→ ' + langName(c.result.target))
      if (c.result.model) metaParts.push(c.result.model)
      if (c.result.reasoningEffort) metaParts.push(c.result.reasoningEffort)
      if (c.result.tokens) {
        const total = (c.result.tokens.input || 0) + (c.result.tokens.output || 0)
        if (total > 0) metaParts.push(formatTokens(total) + ' tokens')
      }
      if (metaParts.length) footChildren.push(react.createElement('span', { key: 'dir', 'data-dsh-translator-meta': '' }, metaParts.join(' · ')))
    }
    if (c.result && c.result.truncated) {
      footChildren.push(react.createElement('span', { key: 'trunc' }, t('truncated')))
    }
    if (c.result && c.result.cached) {
      footChildren.push(react.createElement('span', { key: 'cached', 'data-dsh-translator-cached': '' }, t('cached')))
    }
    if (c.result && c.result.untranslated) {
      // Every provider echoed the input, so the body holds the source text —
      // saying so is the difference between "nothing to translate" and a lie.
      footChildren.push(react.createElement('span', { key: 'untranslated', 'data-dsh-translator-untranslated': '' }, t('untranslated')))
    }
    if (c.status === 'error') {
      footChildren.push(react.createElement('button', { key: 'retry', 'data-dsh-translator-act': '', onClick: () => translateText(c.text, { retry: true }, c.key) }, t('retry')))
    }
    footChildren.push(react.createElement('div', { key: 'actions', 'data-dsh-translator-actions': '' },
      react.createElement('button', { 'data-dsh-translator-pin': c.pinned ? 'on' : 'off', title: c.pinned ? t('unpin') : t('pin'), onClick: () => togglePin(c.key) }, react.createElement(PinIcon, { filled: c.pinned === true })),
      react.createElement('button', { 'data-dsh-translator-close': '', title: t('close'), onClick: () => closeCard(c.key) }, react.createElement(XIcon)),
    ))
    return react.createElement('div', {
      key: c.key,
      'data-dsh-translator-card': String(c.key),
      'data-dsh-translator-pinned': c.pinned ? '' : undefined,
      style: { left: c.left + 'px', top: c.top + 'px', width: c.width + 'px' },
    },
      react.createElement('div', { 'data-dsh-translator-source': '', onMouseDown: (e) => beginDrag(e, c.key), onClick: () => copy(c, 'source') }, c.text),
      react.createElement('div', { 'data-dsh-translator-body': '', onClick: () => copy(c, 'result') }, ...bodyChildren),
      needsPrivacyNotice(c, privacyAck) ? react.createElement('div', { key: 'privacy', 'data-dsh-translator-notice': '' },
        react.createElement('span', { 'data-dsh-translator-notice-text': '' }, t('privacyNotice')),
        react.createElement('button', {
          'data-dsh-translator-notice-dismiss': '',
          type: 'button',
          onClick: () => { acknowledgePrivacy(); setPrivacyAck(true) },
        }, t('privacyDismiss')),
      ) : null,
      react.createElement('div', { 'data-dsh-translator-foot': '' }, ...footChildren),
      copied && copied.key === c.key
        ? react.createElement('div', { key: 'copied', 'data-dsh-translator-copied': '' }, copied.which === 'source' ? t('copiedSource') : t('copied'))
        : null,
    )
  }

  const children = []
  if (btn) {
    children.push(react.createElement('button', {
      key: 'btn',
      'data-dsh-translator-btn': '',
      style: { left: btn.left + 'px', top: btn.top + 'px' },
      title: t('tooltip'),
      onMouseDown: (e) => e.preventDefault(),
      onClick: openPopup,
    }, react.createElement(TranslateIcon)))
  }
  // Pinned cards first, the active one last: the later sibling paints on top.
  for (const c of (card ? [...extra, card] : extra)) children.push(renderCard(c))
  // A panel bug must not take the selection popup down with it.
  children.push(react.createElement(PanelBoundary, { key: 'panel' },
    react.createElement(TranslationPanel, { t, renderDict: renderDictionary })))
  return react.createElement('div', {
    'data-dsh-translator-root': '',
    // The overlay is the whole viewport, so it must never swallow a click. Set
    // inline as well as in the stylesheet: an equally specific shell rule that
    // happened to load later would otherwise take the entire application's
    // pointer events with it.
    style: { pointerEvents: 'none' },
    ref: (el) => { state.rootEl = el },
  }, ...children)
}

// ---------------------------------------------------------------------------
// Plugins page: this bundle's own configuration.
//
// A bundle's configuration belongs on its own page in the Plugins list, in the
// `plugins.bundle.config` seat keyed by the bundle's package name — the same
// one-click placement an official plugin's page has. The page passes
// `view: 'page'` and no form, so this half owns the entry's form through
// `ctx.configForms.get(<row id>)`, exactly like the shipped settings pages do.
//
// The snapshot resolves `value` through schema defaults → composition base →
// user layer, `base` is the layer a cleared field reverts to, and `user`'s
// field PRESENCE marks a field overridden.
// ---------------------------------------------------------------------------

/** The bundle's package name: the `plugins.bundle.config` cell key. */
const PACKAGE_NAME = '@nicearrack/dsh-translator'

/** Settings namespace: the profile entry id our own patch row declares. */
const SETTINGS_NS = 'dsh-translator'

/** Schema defaults, used only when the Host reports no composition base. */
const FALLBACK_BASE = { engine: 'api', apiProvider: 'auto', primaryLanguage: 'zh-Hans', customModel: { provider: '', model: '' }, reasoningEffort: 'low', timeoutMs: 30000, maxTokens: 1024, temperature: 0.3 }

/**
 * Every editable field path. `customModel` is addressed through its children
 * because the schema marks the leaves volatile, not the container: a write to
 * the parent path is refused as non-volatile.
 */
const MODEL_PROVIDER = ['customModel', 'provider']
const MODEL_NAME = ['customModel', 'model']
const CONFIG_PATHS = [
  ['engine'],
  ['apiProvider'],
  ['primaryLanguage'],
  MODEL_PROVIDER,
  MODEL_NAME,
  ['reasoningEffort'],
  ['timeoutMs'],
  ['maxTokens'],
  ['temperature'],
]

/**
 * The numeric bounds the Host schema declares (`LIMITS` in the Host half).
 *
 * A copy rather than an import: the two halves ship as separate bundles. A
 * test pins this list to the Host's, and the form refuses a draft outside it
 * before writing, so the user gets a field-level reason instead of a generic
 * "save failed" from the schema on the other side.
 */
const CONFIG_BOUNDS = {
  timeoutMs: { min: 1000, max: 600000 },
  maxTokens: { min: 1, max: 32768 },
  temperature: { min: 0, max: 2 },
}

/**
 * The numeric fields whose drafted value the Host would refuse.
 *
 * A field an older Host does not report at all is skipped rather than
 * reported: that Host has no such column to be out of range for. When
 * `touched` is given, only the fields the reader actually edited are checked —
 * a value another editor left behind must not block this save.
 */
function outOfBounds(draft, touched) {
  const invalid = []
  for (const [key, bound] of Object.entries(CONFIG_BOUNDS)) {
    if (touched && !touched.has(key)) continue
    if (!hasPath(draft, [key])) continue
    const value = atPath(draft, [key])
    if (typeof value !== 'number' || !Number.isFinite(value) || value < bound.min || value > bound.max) invalid.push(key)
  }
  return invalid
}

function atPath(root, path) {
  let node = root
  for (const key of path) {
    if (node === null || typeof node !== 'object') return undefined
    node = node[key]
  }
  return node
}

function hasPath(root, path) {
  let node = root
  for (const key of path) {
    if (node === null || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, key)) return false
    node = node[key]
  }
  return true
}

function cloneConfig(value) {
  return value === null || typeof value !== 'object' ? value : JSON.parse(JSON.stringify(value))
}

function sameAtPath(a, b, path) {
  return JSON.stringify(atPath(a, path)) === JSON.stringify(atPath(b, path))
}

/** Whether two already-resolved values are equal for a settings field. */
function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** The layer value one field reverts to, falling back to the schema default. */
function layerValue(base, path) {
  const fromBase = atPath(base, path)
  return (fromBase !== undefined && fromBase !== null) ? fromBase : atPath(FALLBACK_BASE, path)
}

/**
 * Build the write for one draft against the Host's committed section.
 *
 * A changed field is `set`, or `unset` when the draft already equals the layer
 * it would revert to (the Host then re-inherits or drops the entry). A field
 * that is unchanged but still carries a stale user-layer entry equal to the
 * layer is cleaned in the same write; its presence is invisible to the
 * `overridden` badge, which tracks the effective difference.
 * @param draft - the edited section.
 * @param value - the committed resolved section.
 * @param base - the composition layer beneath the user's entries.
 * @param user - the raw user section, whose field presence marks an override.
 * @returns ordered path operations for one atomic mutation.
 */
function settingsOps(draft, value, base, user, touched) {
  const ops = []
  for (const path of CONFIG_PATHS) {
    // `touched` is the set of dotted paths this editor changed. Writing only
    // those is what keeps a second open form from reverting a field it merely
    // rendered: without it, a stale draft for an untouched field is written
    // back as if the reader had chosen it.
    if (touched && !touched.has(path.join('.'))) continue
    const changed = !sameAtPath(draft, value, path)
    const atLayer = sameValue(atPath(draft, path), layerValue(base, path))
    if (changed) {
      ops.push(atLayer ? { op: 'unset', path } : { op: 'set', path, value: atPath(draft, path) })
    } else if (atLayer && hasPath(user, path)) {
      ops.push({ op: 'unset', path })
    }
  }
  return ops
}

function ConfigSelect(props) {
  const { value, onChange, options, placeholder, disabled } = props
  const [open, setOpen] = react.useState(false)
  const ref = react.useRef(null)
  const sel = options && options.find(o => o.value === value)
  react.useEffect(() => {
    if (!open) return
    function onDoc(e) { if (ref.current && ref.current.contains && !ref.current.contains(e.target)) setOpen(false) }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  return react.createElement('div', { 'data-dsh-translator-select': '', ref },
    react.createElement('button', { 'data-dsh-translator-select-trigger': '', type: 'button', disabled: disabled === true, onClick: () => setOpen(!open), 'aria-haspopup': 'listbox', 'aria-expanded': open ? 'true' : 'false' },
      react.createElement('span', { 'data-dsh-translator-select-label': '' }, sel ? sel.label : (placeholder || '')),
      react.createElement('span', { 'data-dsh-translator-select-arrow': '', 'aria-hidden': 'true' }, react.createElement(ChevronDownIcon)),
    ),
    open ? react.createElement('div', { 'data-dsh-translator-select-menu': '', role: 'listbox' },
      options.map(o => react.createElement('button', { key: o.value, 'data-dsh-translator-select-option': '', type: 'button', role: 'option', 'aria-selected': o.value === value ? 'true' : undefined, onMouseDown: (e) => e.preventDefault(), onClick: () => { onChange(o.value); setOpen(false) } }, o.label)),
    ) : null,
  )
}

/** One-liner for the row description fallback (the bundle's own locale meta wins). */
function SettingsSummary(props) {
  const t = translate(props)
  const state = snapshotOf(props)
  const value = state ? state.value : null
  if (value === null || value === undefined) return null
  // Only claim the free API engine when the Host actually reports it: a Host
  // that predates the field still runs the model engine, so the summary must
  // not advertise a default it does not have.
  const apiMode = value.engine === 'api'
  const pick = apiMode
    ? providerName(t, value.apiProvider || 'auto')
    : (value.customModel && value.customModel.provider && value.customModel.model
      ? value.customModel.provider + ' / ' + value.customModel.model
      : t('followSession'))
  const parts = [
    apiMode ? t('engineApi') : t('engineModel'),
    langName(value.primaryLanguage),
    pick,
    apiMode ? null : value.reasoningEffort,
  ]
  return react.createElement('span', { 'data-dsh-translator-summary': '' }, parts.filter(Boolean).join(' · '))
}

/** The current Host snapshot of the entry behind `props.form` (a `ConfigForm`). */
function snapshotOf(props) {
  const form = props.form
  if (!form || typeof form.getSnapshot !== 'function') return null
  return form.getSnapshot()
}

/** The bundle's configuration form. */
function SettingsForm(props) {
  const t = translate(props)
  const form = props.form
  // `plugins.bundle.config` is not a configuration page itself: it passes no
  // snapshot, so this half subscribes to the shared entry form and re-renders
  // on every revision the Host publishes.
  const [state, setState] = react.useState(() => snapshotOf(props))
  react.useEffect(() => {
    if (!form || typeof form.subscribe !== 'function') return
    return form.subscribe(() => setState(form.getSnapshot()))
  }, [form])
  const committed = state && state.status === 'ready' ? state.value : undefined
  // Seed the draft on the first render that has a committed section (and again
  // through the effect when the section arrives later), so the form never
  // flashes an empty pass.
  const [draft, setDraft] = react.useState(() => (committed ? cloneConfig(committed) : null))
  const [models, setModels] = react.useState([])
  const [defaultModel, setDefaultModel] = react.useState(null)
  const [status, setStatus] = react.useState('')
  const [saving, setSaving] = react.useState(false)

  /**
   * The dotted paths this editor has actually changed.
   *
   * A form is not the only writer: another tab, another window, or the
   * configuration file can move the section while this one sits open. Only the
   * fields the reader touched here are written back, so a stale draft cannot
   * revert somebody else's change — and the untouched fields below are re-seeded
   * from every new revision so the reader sees that change rather than a ghost.
   */
  const touchedRef = react.useRef(null)
  if (touchedRef.current === null) touchedRef.current = new Set()
  react.useEffect(() => {
    if (committed === undefined) return
    setDraft((prev) => {
      if (prev === null) return cloneConfig(committed)
      const next = cloneConfig(prev)
      let changed = false
      for (const path of CONFIG_PATHS) {
        if (touchedRef.current.has(path.join('.'))) continue
        if (sameAtPath(next, committed, path)) continue
        let node = next
        for (const key of path.slice(0, -1)) {
          if (node[key] === null || typeof node[key] !== 'object') node[key] = {}
          node = node[key]
        }
        node[path[path.length - 1]] = cloneConfig(atPath(committed, path))
        changed = true
      }
      return changed ? next : prev
    })
  }, [committed])
  react.useEffect(() => {
    callApi('list-models').then((value) => { if (Array.isArray(value)) setModels(value) }).catch(() => {})
    callApi('default-model').then((value) => { if (value && typeof value === 'object') setDefaultModel(value) }).catch(() => {})
  }, [])

  if (state === null || state.status !== 'ready' || !committed || draft === null) return null
  const disabled = state.writable === false
  const value = committed
  const base = state.base && typeof state.base === 'object' ? state.base : FALLBACK_BASE
  const isOverridden = (path) => !sameValue(atPath(draft, path), layerValue(base, path))
  // The model is two leaves shown as one control: the badge and reset follow
  // the pair, while the write still addresses each volatile leaf.
  const modelOverridden = () => !sameValue(
    [atPath(draft, MODEL_PROVIDER), atPath(draft, MODEL_NAME)],
    [layerValue(base, MODEL_PROVIDER), layerValue(base, MODEL_NAME)],
  )
  const resetModel = () => {
    setPath(MODEL_PROVIDER, layerValue(base, MODEL_PROVIDER))
    setPath(MODEL_NAME, layerValue(base, MODEL_NAME))
  }
  const setPath = (path, v) => {
    touchedRef.current.add(path.join('.'))
    setDraft((prev) => {
      if (!prev) return prev
      const next = cloneConfig(prev)
      let node = next
      for (const key of path.slice(0, -1)) {
        if (node[key] === null || typeof node[key] !== 'object') node[key] = {}
        node = node[key]
      }
      node[path[path.length - 1]] = v
      return next
    })
  }
  // Derived from what would actually be written, not from a value comparison:
  // a field the reader set back to its inherited value has nothing to change
  // but still has a stale entry to clean, and that is a write.
  const ops = settingsOps(draft, value, base, state.user, touchedRef.current)
  const dirty = ops.length > 0

  function resetPath(path) {
    setPath(path, layerValue(base, path))
  }

  function save() {
    // Refuse an out-of-range number here rather than letting the Host's schema
    // reject the whole write: the same failure, but named.
    const invalid = outOfBounds(draft, touchedRef.current)
    if (invalid.length > 0) {
      setStatus(t('invalidFields') + ': ' + invalid.join(', '))
      setTimeout(() => setStatus(''), 2500)
      return
    }
    if (ops.length === 0) return
    setSaving(true); setStatus('')
    form.mutate(ops, state.revision).then((accepted) => {
      setSaving(false)
      if (accepted !== false) touchedRef.current.clear()
      setStatus(accepted === false ? t('saveFailed') : t('saved'))
      setTimeout(() => setStatus(''), 1500)
    }).catch((err) => {
      setSaving(false)
      setStatus((err && err.message) || t('saveFailed'))
      setTimeout(() => setStatus(''), 1500)
    })
  }

  function discard() {
    setStatus('')
    touchedRef.current.clear()
    setDraft(cloneConfig(value))
  }

  function fieldHead(labelText, over, onReset) {
    return react.createElement('div', { 'data-dsh-translator-field-head': '' },
      react.createElement('span', { 'data-dsh-translator-field-label': '' }, labelText),
      over ? react.createElement('span', { 'data-dsh-translator-field-badges': '' },
        react.createElement('span', { 'data-dsh-translator-badge': '' }, t('overridden')),
        react.createElement('button', { 'data-dsh-translator-reset': '', type: 'button', disabled, onClick: onReset }, t('resetDefault')),
      ) : null,
    )
  }

  const langCodes = Object.keys(LANG_NAMES).filter(c => c !== 'en')
  const custom = draft.customModel || {}
  const customKey = (custom.provider && custom.model) ? (custom.provider + '/' + custom.model) : ''
  const modelKey = customKey || (defaultModel ? (defaultModel.provider + '/' + defaultModel.model) : '')
  const field = (labelText, path, control, over, onReset) => react.createElement('div', { 'data-dsh-translator-field': '' },
    fieldHead(labelText, over === undefined ? isOverridden(path) : over, onReset || (() => resetPath(path))),
    control,
  )
  const numberInput = (path, extra) => react.createElement('input', {
    type: 'number', value: atPath(draft, path), disabled, ...extra,
    onChange: (e) => {
      // An empty box is `Number('')` → 0 and a partial entry can produce NaN
      // (which a JSON clone turns into null). Neither may replace the value the
      // user had: an emptied field simply keeps its last valid number.
      if (e.target.value === '') return
      const next = Number(e.target.value)
      if (!Number.isFinite(next)) return
      setPath(path, next)
    },
  })
  const row = (key, ...children) => react.createElement('div', { key, 'data-dsh-translator-settings-row': '' }, ...children)

  // The engine selects which half of the schema is live. `api` reads none of
  // the model controls, so they are not rendered at all rather than disabled:
  // a temperature box that changes nothing would be a lie about what the
  // plugin does with it.
  //
  // The Host resolves this section from its OWN schema, so a field it does not
  // report is a field it does not have — the bundle on disk was updated but the
  // instance was not restarted. Rendering the control anyway would offer a
  // choice whose write the Host refuses, and would show a blank select in the
  // meantime. Fall back to the shape such a Host does understand (the model
  // engine) and say why, instead of guessing at a default it cannot store.
  const engineSupported = atPath(value, ['engine']) !== undefined
  const apiMode = engineSupported && draft.engine !== 'model'
  const languageField = field(t('primaryLanguage'), ['primaryLanguage'],
    react.createElement(ConfigSelect, { value: draft.primaryLanguage, disabled, onChange: (v) => setPath(['primaryLanguage'], v), options: langCodes.map(c => ({ value: c, label: langName(c) })) }))

  const engineBody = apiMode
    ? [
      react.createElement('div', { key: 'api-hint', 'data-dsh-translator-field-hint': '' }, t('apiHint')),
      languageField,
      field(t('apiProvider'), ['apiProvider'],
        react.createElement(ConfigSelect, {
          value: draft.apiProvider,
          disabled,
          onChange: (v) => setPath(['apiProvider'], v),
          options: API_PROVIDER_IDS.map(id => ({ value: id, label: providerName(t, id) })),
        })),
      row('api-row',
        field(t('timeout'), ['timeoutMs'], numberInput(['timeoutMs'], { min: CONFIG_BOUNDS.timeoutMs.min, max: CONFIG_BOUNDS.timeoutMs.max }))),
    ]
    : [
      languageField,
      field(t('model'), MODEL_PROVIDER,
        react.createElement(ConfigSelect, {
          value: modelKey,
          disabled,
          onChange: (v) => {
            const i = v.indexOf('/')
            if (i > 0) { setPath(MODEL_PROVIDER, v.slice(0, i)); setPath(MODEL_NAME, v.slice(i + 1)) }
          },
          options: models.map(m => ({ value: m.provider + '/' + m.model, label: m.label })),
          placeholder: modelKey || t('followSession'),
        }), modelOverridden(), resetModel),
      react.createElement('div', { key: 'model-hint', 'data-dsh-translator-field-hint': '' }, t('modelHint')),
      row('model-row',
        field(t('reasoningLevel'), ['reasoningEffort'],
          react.createElement(ConfigSelect, { value: draft.reasoningEffort, disabled, onChange: (v) => setPath(['reasoningEffort'], v), options: [{ value: 'off', label: 'off' }, { value: 'low', label: 'low' }, { value: 'high', label: 'high' }, { value: 'max', label: 'max' }] })),
        field(t('maxTokens'), ['maxTokens'], numberInput(['maxTokens'], { min: CONFIG_BOUNDS.maxTokens.min, max: CONFIG_BOUNDS.maxTokens.max }))),
      row('advanced-row',
        field(t('timeout'), ['timeoutMs'], numberInput(['timeoutMs'], { min: CONFIG_BOUNDS.timeoutMs.min, max: CONFIG_BOUNDS.timeoutMs.max })),
        field(t('temperature'), ['temperature'], numberInput(['temperature'], { step: 0.1, min: CONFIG_BOUNDS.temperature.min, max: CONFIG_BOUNDS.temperature.max }))),
    ]

  // The engine select exists only when the Host has the field to store it in;
  // otherwise the reader gets a one-line explanation instead of two selects
  // that render blank and could never be saved.
  const engineField = engineSupported
    ? field(t('engine'), ['engine'],
      react.createElement(ConfigSelect, {
        value: draft.engine,
        disabled,
        onChange: (v) => setPath(['engine'], v),
        options: [
          { value: 'api', label: t('engineApi') || 'Free API' },
          { value: 'model', label: t('engineModel') || 'Model' },
        ],
      }))
    : react.createElement('div', { key: 'host-stale-hint', 'data-dsh-translator-field-hint': '' }, t('hostStale'))

  return react.createElement('div', { 'data-dsh-translator-settings': '' },
    engineField,
    ...engineBody,
    react.createElement('div', { 'data-dsh-translator-settings-footer': '' },
      // The actions lead, in DOM order as well as on screen, so the tab order
      // follows the eye: discard, save, then the status the save reports.
      react.createElement('button', { 'data-dsh-translator-settings-discard': '', type: 'button', disabled: !dirty || saving, onClick: discard }, t('discard')),
      react.createElement('button', { 'data-dsh-translator-settings-save': '', type: 'button', disabled: !dirty || saving, onClick: save }, saving ? t('saving') : t('save')),
      status
        ? react.createElement('span', { 'data-dsh-translator-settings-status': '' }, status)
        : (disabled ? react.createElement('span', { 'data-dsh-translator-settings-status': '' }, t('readOnly')) : null),
    ),
  )
}

/** The `plugins.bundle.config` occupant: the page asks for a one-liner or the form. */
function TranslatorSettings(props) {
  if (props.view === 'summary') return react.createElement(SettingsSummary, props)
  return react.createElement(SettingsForm, props)
}

const inject = ['slots', 'locale', 'configForms']

function apply(ctx) {
  const styleEl = document.createElement('style')
  styleEl.textContent = TRANSLATOR_CSS
  document.head.appendChild(styleEl)
  ctx.effect(() => () => { styleEl.remove() }, 'dsh-translator: styles')

  const slots = ctx.slots
  if (slots === undefined) return
  ctx.effect(() => ctx.locale.register('dsh-translator', I18N), 'dsh-translator: dictionaries')
  slots.inject('shell.overlay', () => slots.register(
    { name: 'shell.overlay', id: 'dsh-translator-overlay', locale: 'dsh-translator' },
    TranslatorRoot,
  ))
  // The bundle's own configuration, rendered on this bundle's page in the
  // Plugins list: one click from the list, no intermediate row page. The entry
  // form comes from the shared settings transport; the registration appears
  // only while the Host actually serves our namespace.
  const form = ctx.configForms.get(SETTINGS_NS)
  ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NS], () => slots.inject(
    'plugins.bundle.config',
    () => slots.register(
      { name: 'plugins.bundle.config', key: PACKAGE_NAME, locale: 'dsh-translator' },
      (props) => react.createElement(TranslatorSettings, { ...props, form }),
    ),
  )), 'dsh-translator: bundle settings page')
}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
