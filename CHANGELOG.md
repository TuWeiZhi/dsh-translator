# 更新日志

本文件只记录 **fork 相对上游的改动**。上游更早的历史见
[上游仓库](https://github.com/nicearrack/dsh-translator) 的提交记录与 Releases。

## 0.5.1 — 2026-10-23

发布链路改动，**包内容与 `0.5.0` 完全相同**（`lib/`、`client/`、`src/` 逐字节未变）。

### 新增

- `.github/workflows/publish.yml`：手动触发的发版流水线，走 **npm Trusted Publishing (OIDC)**，
  仓库里不需要任何 token。发版前跑 `npm run check`（语法 + `lib/` 与 `src`/`client` 一致性 + 回归用例），
  版本已存在则跳过，成功后创建 GitHub Release，支持 `dry_run` 演练。
- 发布时 npm 会自动附加 provenance 证明（不需要 `--provenance`，更不要写 `--provenance=false`）。

### 修复

- `package-lock.json` 里的 `resolved` 地址原先指向 `registry.npmmirror.com`（本地用镜像源
  `npm install` 的副作用）。GitHub runner 上 `npm ci` 会因此报
  `EALLOWREMOTE: Fetching packages of type "remote" have been disabled` 直接失败。
  已把三处地址改回 `registry.npmjs.org`（`integrity` 不变，同一份 tarball）。

## 0.5.0 — 2026-10-23

基线：上游 `v0.4.3`（2026-10-16）。

### 新增

- **独立输入面板**：没有可选中文本也能直接输入/粘贴翻译；面板可拖动、位置持久化、
  内置词典渲染。`client/core.js` 新增 `TranslationPanel`、`PanelBoundary`（类组件错误边界）、
  `startDrag` / `clampPanelPos` / `readPanelStore` / `writePanelStore` / `renderDictionary`。
- **Google 翻译**：`PROVIDERS` 前置 `google`（`translate.googleapis.com/translate_a/single`，
  公开 `gtx` 端点），单次尝试上限 4 秒；顺带返回词典分组、源语言罗马音（拼音 / 近似 IPA）。
- **词典增强**：短词（≤ 60 字符、≤ 4 词）在译文到达后再查一次 `dict.youdao.com`，
  补音标、词性释义与双语例句；4 秒上限，失败不影响译文。
- 卡片返回值透传 `dict`（`lib/index.js`）。
- 文档：本文件、[`NOTICE.md`](NOTICE.md)（来源、改动清单、核对与同步方式）、README 顶部横幅。

### 未改动

引擎选择、模型引擎、卡片交互、缓存、限流、取消、错误码字典、隐私披露、
`untranslated` 标记语义、"全部 provider 回显 → untranslated" 这条不变量。

### 测试

`npm test` 85/85 通过、`npm run verify:build` 通过。两处用例调整都属于「补上新增部分」：

- `tests/client.test.mjs`：React 桩补了 `Component`（面板外层是类组件错误边界，
  函数组件无法充当 boundary）；provider 下拉的期望值补上 `google`。
- `tests/host.test.mjs`：「所有 provider 都回显」用例补上 Google 的路由桩。

`lib/` 由 `npm run build` 生成，可逐字节复现（`npm run verify:build`）。
