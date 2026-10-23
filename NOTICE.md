# 这个仓库是什么

[`nicearrack/dsh-translator`](https://github.com/nicearrack/dsh-translator) 的**增强 fork**，
基线是上游 tag `v0.4.3`（2026-10-16，MIT）。不是重写，也不是上游的另一个分支。

上游的源码在 `src/` 与 `client/core.js`，`lib/` 是 `node scripts/build.js` 的产物（上游把构建结果
提交进仓库，好让 `github:` 安装不需要跑构建脚本）。本 fork 保持这套结构不变：**改 `src/` 或
`client/`，然后 `npm run build`**，`lib/` 不要手改。

## 相对上游新增

### 1. 独立输入面板（Standalone input panel）

上游只能「选中文本 → 点翻译」。这里多一个常驻的小面板：没有可选中文本时（读 PDF、看视频、打字前）
也能直接粘贴/输入一段文字翻译，面板可拖动、位置记在本地，「词典」结果直接渲染在面板里。

### 2. Google 翻译作为免费引擎的首选

`PROVIDERS` 从 `['tencent', 'bing', 'volcengine', 'mymemory']` 变成
`['google', 'tencent', 'bing', 'volcengine', 'mymemory']`：`translate.googleapis.com` 的
公开 `gtx` 端点在实测里最快（双向 300–450 ms），而且是唯一顺带返回**词典**（词性分组 + 同义词）
与**源语言罗马音**（中文拼音、英文近似 IPA）的接口。其余四家原样保留，用来兜 Google 不通的方向。

Google 单次尝试的上限是 4 秒（`PROVIDER_TIMEOUT_MS`），其余仍是共用的 15 秒 —— 一个网络抖动
只花 4 秒把它挪开 30 秒，而不是把整张卡挂在 15 秒的等里。

### 3. 词典增强（Youdao）

短词（≤ 60 字符、≤ 4 个词）在**已经拿到译文之后**再问一次 `dict.youdao.com`，补上音标、
词性释义与双语例句；4 秒上限，失败就当没有，不影响已经拿到的译文。

### 4. `lib/index.js` （+20 行）

把 `dict` 透传到卡片返回值，并保持「全部 provider 都回显原文 → `untranslated`」这条上游不变量不变。

## 没改的东西

- 两个引擎的选择逻辑、模型引擎、卡片交互、缓存、限流、取消、错误码字典 —— 没动。
- 公共接口的隐私披露、`untranslated` 标记、`apiProvider` 白名单语义 —— 没动。
- 测试与构建：`npm test`（85 个用例）、`npm run verify:build` 全绿，与上游同一套用例。

**本 fork 唯一改动到上游行为语义的一处**：`tests/host.test.mjs` 里「所有 provider 都回显」
那个用例补上了 Google 的路由桩 —— 上游写这条用例时链上还没有 Google，不补的话它会因为
Google 404 而落到 `api-failed`，测的就不再是「全部回显」这件事了。运行时语义没有放宽：
`src/free-translate.js` 里「每个 attempt 都是 echo 才返回 untranslated」的条件原样保留。

## 怎么核对

```sh
git remote add upstream https://github.com/nicearrack/dsh-translator.git
git fetch upstream --tags
git diff upstream/v0.4.3 --stat --ignore-cr-at-eol
```

`--ignore-cr-at-eol` 是必须的：上游把一部分文本文件（`LICENSE`、`package.json`、`tests/*` 等）
以 **CRLF** 提交，本 fork 用 `.gitattributes` 统一成了 LF，否则 diff 里会混着一堆纯换行差异。

忽略换行之后，改动只有：`client/core.js`、`lib/client.js`、`lib/free-translate.js`、`lib/index.js`、
`src/free-translate.js`、`src/index.js`、`tests/client.test.mjs`、`tests/host.test.mjs`、
`package.json`、`README.md`、`README.zh.md`，加上新增的 `.gitattributes` / `CHANGELOG.md` / 本文件。

`lib/` 里的三个文件可以用脚本回推：`client/core.js` 是 `lib/client.js` 去掉 loader 包装后的正文，
`src/index.js` / `src/free-translate.js` 与 `lib/` 下同名文件逐字节相同。所以

```sh
npm run build && npm run verify:build
```

应当报 `lib/ matches src/ and client/`。

## 怎么和上游同步

```sh
git fetch upstream --tags
git merge upstream/v0.4.4          # 或上游的新 tag
npm install && npm run build && npm test
```

冲突集中在 `src/free-translate.js`（`PROVIDERS`、`CALLS`、`translateFree` 尾部）与
`client/core.js`（面板相关的新增块）；`lib/` 是产物，冲突时直接 `npm run build` 重新生成即可。

## 想发到自己的仓库 / npm？先看这一节

本仓库**故意保留上游的包名 `@nicearrack/dsh-translator`**，方便随时和上游对比、也能直接用
上游的安装命令。要挂到自己的 scope 下，改这几处（`lib/` 不要手改，改完 `npm run build`）：

| 位置 | 改什么 |
|---|---|
| `package.json` | `name`、`repository.url`、`bugs.url`、`homepage` |
| `cordis.patch.yml` | 两处 `@nicearrack/dsh-translator`（bundle 里加载的包名） |
| `client/core.js` | `const PACKAGE_NAME = '@nicearrack/dsh-translator'`（设置表单的 key，必须和包名一致） |
| `tests/client.test.mjs` | 断言 `PACKAGE_NAME` 的地方 |
| `README.md` / `README.zh.md` | 安装命令里的包名与 GitHub 地址 |

改完必须 `npm run build && npm test`：`lib/client.js` 里嵌着 `JSON.stringify(pkg.name)`，
不重新构建的话装上去的插件 id 和 `package.json` 会对不上。

## 许可

MIT，见 [`LICENSE`](LICENSE)（保留上游版权行）。本 fork 的改动同样以 MIT 提供。
