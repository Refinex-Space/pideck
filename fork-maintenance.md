# PiDeck fork 维护约定

## 基线与职责

- 来源：`JetBrains/thinkrail`。
- 初始化基线：`main`，commit `6cd6f9054dc566f8080db1d338cb21bff0c2b7cc`。
- Pi 基线：`@earendil-works/*` 1.4.0；版本仍以根 catalog 与 `bun.lock` 为准。
- `origin`：`git@github.com:Refinex-Space/pideck.git`。
- `upstream`：`https://github.com/JetBrains/thinkrail.git`。

`main` 保持官方历史；`refinex/dev` 承载日常开发；`refinex/product` 只接收经过验收的改动。
两个定制分支均从上述 commit 建立。定制改动先进入开发分支，验收后再晋级产品分支。
提交与晋级需遵守用户授权，不把工作区中的未提交改动视作产品分支已交付。

## 上游同步

先确保工作区可安全切换，再获取官方历史。以下命令是维护流程示例，不代表已执行推送。

```bash
git fetch upstream --tags
git switch main
git merge --ff-only upstream/main
git switch refinex/dev
```

若 `main` 已出现本地定制或分叉，停止并检查，不用 reset 或强推覆盖。推送 `main` 需要明确授权。

## 选定版本升级

1. 阅读当前基线到目标 tag/commit 的 release notes 和实际 diff，重点核对 Pi、协议、状态、构建与本地定制。
2. 从当前 `refinex/dev` 创建 `refinex/upgrade-<version>`，合并已确认的完整上游 tag/commit。
3. 按模块 SPEC 处理冲突，对照下方清单重新验证各项定制；Pi 升级必须审阅 `pi-compatibility.md`。
4. 完成相关测试、完整无智能体浏览器测试和受影响的产物 smoke。真实 agent 变化执行相应 live spec。
5. 经审查后合回 `refinex/dev`；通过日常使用验收后再晋级 `refinex/product`，更新基线记录与两份 README。

整体 merge 会引入目标版本的全部祖先变更。只选择升级时机，不把它描述成“只引入某些功能”。
Cherry-pick 仅用于依赖清楚的独立修复；记录来源 commit 和依赖，后续整体升级时检查重复实现。

## 产品晋级

保持 `refinex/product` 为 `refinex/dev` 已验收提交的子集，正常情况下可快进：

```bash
git switch refinex/product
git merge --ff-only refinex/dev
git switch refinex/dev
```

仅在开发分支目标提交已获验收后执行；有未验收改动时选择明确的已验收 commit，不直接合入整个 dev。
分支分叉时先解释原因，不自动创建复杂合并。提交、推送、发版是独立授权操作。

## 定制清单

| 定制 | 位置 | 验证与保留理由 |
| --- | --- | --- |
| 产品名、CLI、原生安装身份 | `apps/desktop`、`apps/cli`、`packages/shared`、安装脚本 | 单元测试、build 与 artifact smoke；必须与官方版可区分 |
| 默认宿主目录 `~/.pideck` | `packages/server/src/persistence` | 默认路径与 override 测试；不自动迁移官方状态 |
| PiDeck 界面、Pi 图标和反馈入口 | `apps/web`、`packages/locales`、shared assets | 文案检查、组件测试、完整 e2e；不得留下上游团队的服务承诺 |
| PiDeck 产物与更新边界 | 桌面 config、CLI update、`.github/actions/build-binary` | 产物收集与 updater 测试；默认空 feed，更新代码仅指向 fork |
| Claude Desktop 风格的共享 UI | `design-system.md`、web shell/themes/styles、共享 UI | 单测、无智能体 e2e、截图与原生产物验证；保留 PiDeck 行为与独立品牌，Windows 真机待验收 |
| 仓库文档与分支制度 | README、AGENTS、本文 | 对照代码和实际验证维护，不承诺未发布能力 |

各项属于 fork 身份差异，上游修复不会自动消除。后续功能补丁新增时记录问题、来源、验证方式和可移除条件；
上游已有等价实现时优先删除本地补丁。

## 有意保留的上游标识

- `@thinkrail/*` workspace 包、`thinkrail-extensions/`、可发布 Pi 包名和 spec id：避免无功能收益的依赖迁移。
- `THINKRAIL_*` 环境变量、`__THINKRAIL_*` 原生桥、协议/renderer id 及诊断日志文件名：保留已测试契约。
- 项目内 `.thinkrail/` 路径：属于既有工作流存储，与宿主默认目录 `~/.pideck` 不同。
- `~/.pi/agent`：由 Pi 管理，未自动复制；可通过 `PI_CODING_AGENT_DIR` 独立配置。
- `apps/website`、上游发布说明、历史截图及 portable package 文档：保留来源内容，不作为 PiDeck 官网或发布记录。
  PiDeck README 不展示未经核验的上游产品截图。
- JetBrains AI / Central 的提供商名称与协议：第三方集成功能，不代表 PiDeck 属于 JetBrains。

## 发布与隐私边界

本次不建立 PiDeck 版本号政策、签名证书、更新 CDN、网站部署或遥测服务。
源码版本保持 `0.0.0-dev`；桌面更新地址为空；分析服务 key 为空。
CLI 安装/更新代码使用 fork 的 releases 与 `refinex/dev` 脚本，未发布对应资产时不可用于安装。
`refinex/product` 目前仍是未修改的上游基线，不能把 PiDeck 更新指向其中的 ThinkRail 安装器；
产品晋级和发布流程建立后，再审阅安装脚本的固定版本来源。
从 Git 更新源码并重新构建是当前路径。

上游 `.github` 配置和网站仍含官方发布基础设施引用。它们是继承的代码，不应在 fork 中盲目启用。
未来发布前独立审阅工作流、签名身份、下载校验、自动更新、隐私披露及各平台安装/卸载流程。

## Pi 图标来源

使用 [theSVG 的 Pi 标识](https://thesvg.org/icon/pi)，原始 SVG 与来源许可证分别保存为
`packages/shared/assets/pi.svg` 和 `pi.LICENSE`。原生图标使用白底黑色标识，网页 favicon 随明暗模式
切换黑白，界面标识沿用语义主题色。浏览器与原生资源共享相同图形几何，通过根目录品牌契约测试防止漂移。
不引入远程图标运行时或额外依赖；各平台 PNG/ICO 由现有 `generate-icons` 命令生成。

## Host network customization

The network module and Settings → Network & proxy add OS static-proxy discovery, HTTP/HTTPS manual
configuration, OS-store proxy credentials and credential-free diagnostics. Pi keeps authentication and
model ownership. This is a host customization, validated by policy/parser tests, local Pi transport probes,
browser e2e and native packaging; macOS/Linux native verification remains distinct from Windows fixtures.

## 语音输入定制

消息输入框的听写：宿主下载并保存识别模型（`~/.pideck/models/speech`，固定目录、体积与 SHA-256），在宿主进程内用
sherpa-onnx WebAssembly 做流式识别；浏览器或桌面 webview 只采集麦克风并发送 16 kHz PCM。参考仓库 DeepSeek Harness
（`cd5ef81481`，MIT）经检查不含语音或桌面代码，未借用任何实现。改动集中于 `packages/server/src/speech`、协议 v98
的 `speech.*`、`apps/web/src/speech`、Composer 麦克风与波形、设置页 Voice input。新增依赖 `sherpa-onnx@2.0.1`（Apache-2.0，
纯 WASM，无原生扩展）。模型由用户主机按需下载，PiDeck 不再分发。移除条件：Pi 或上游提供官方听写能力。
验证：服务端对假目录/假下载/假识别器的单测、真实 WASM 运行时加载测试、`e2e/speech-dictation.spec.ts`（Chromium 假麦克风）；
桌面端麦克风权限、编译二进制与桌面包中的 WASM 资源尚未验证，见 desktop SPEC。

## 全局指令定制

设置页「指令」维护 Pi 原生读取的全局文件：智能体目录（`getAgentDir()`，默认 `~/.pi/agent`）里的 `AGENTS.md`（按 Pi 的候选顺序
编辑实际生效的那个）与 `APPEND_SYSTEM.md`；不提供 `SYSTEM.md`，因为它会让 Pi 丢掉自带的工具与规则区段。不新增注入逻辑，
会话本来就用 Pi 的 resource loader；保存带路径与内容哈希的冲突检查，空内容删除文件，写入穿过符号链接。已打开会话通过
`requestSessionReload` 按需重载（会重启扩展与 MCP，故不在保存时自动执行）。改动集中于 `packages/server/src/instructions`、协议 v99 的
`instructions.*`、`apps/web/src/panels/InstructionsSettings.tsx`。无新增依赖。移除条件：Pi 或上游提供等价的官方设置界面。
验证：`files.test.ts`、`injection.test.ts`（PiDeck 会话 loader 注入并在 reload 后更新）、`e2e/instructions-settings.spec.ts`。

## 语言服务（LSP）定制

参考 OpenCode 已移除的 LSP 引擎（提交 `44b6938b2a^`）：按文件首次触达惰性启动、就近项目根、推送诊断带短防抖、
编辑结果只回灌错误。PiDeck 的版本更小、更保守：默认关闭；只使用本机已有的服务器、绝不自动安装；仅在 Pi 已信任的
项目里启动（项目的 `node_modules/.bin` 是仓库选择的代码）；配置归宿主所有（`lsp.json`），项目不能改写；
JSON-RPC 成帧手写，不新增依赖。改动集中于 `packages/server/src/lsp`、`agent/lspTool.ts`、`host/lspHost.ts`、
协议 v97 的 `lsp.*`、状态面板 Language servers 块与设置页。ZCode 没有对应设计。
移除条件：Pi 或上游提供官方 LSP 工具与诊断反馈。验证：服务端对假服务器的单测与集成测试、`e2e/lsp.spec.ts`。

## 侧边浏览器定制

参考 ZCode `3c5b227649371507ddc4eb46ac5133afe6db1cab` 的浏览器界面、guest 生命周期和元素选取。
2026-10-30 用户明确批准为完整页面能力引入 CEF；主界面保留系统 WebView，Pi 仍在既有宿主内运行。
改动集中于 web/browser、desktop/browser、原生能力契约与工作台 Browser 工具。
Electrobun 启动器在业务 Worker 之前初始化 CEF，因此 postBuild 包装产物的 Resources/main.js，
先分配随机 loopback CDP 端口并同步到原生环境，再加载原始启动器；不修改缓存或 SDK projection。
移除条件：上游提供可在初始化前配置端口的正式入口，或直接提供受控 CDP/screenshot/emulation API。
验证：URL/消息/CDP 单测、浏览器面板定向 e2e、完整无智能体 e2e、desktop build 与原生 browser smoke。

macOS 的 Electrobun 2.0.5 windowed CEF 销毁会把关闭事件发给父窗口。`desktop/src/browser` 的原生适配器
在主线程先解除子视图与容器的关系，再调用 SDK 原有销毁逻辑，防止关闭标签时退出整个应用。
该适配器在构建时通过 Xcode Command Line Tools 编译，最低目标与上游 native wrapper 同为 macOS 14.0；
不修改 SDK 或缓存。上游提供独立的子视图关闭实现后移除；升级 Electrobun 时构建门禁要求先复核。
`bun run smoke:browser --close` 覆盖后台页、活动页、最后一页、空白页、重复关闭与关闭后重新打开，
同时验证宿主存活及 CEF targets 归零。

### 智能体浏览器与录屏扩展

ZCode browser-use API v11 的本地 IAB 能力映射为 Pi `browser` 工具。宿主拥有真实会话归属、取消和
工作区文件交付；桌面仅适配已存在的 CEF 页面。固定 Playwright core 1.61.0 并随包携带运行资源，
使用 noDefaults 与 Fit 输入坐标适配；源页面 PNG 帧交由受信任的 CEF 编码页生成 WebM。截图主操作改为
系统 PNG 剪贴板，模型剪贴板及快捷键使用聊天内文本。协议、录屏时长修补和生命周期均见 desktop/browser
SPEC。移除本地输入/截图适配前须重验缩放坐标、CSS 输出尺寸、关闭标签、取消录制及两种渲染器的视频播放。
