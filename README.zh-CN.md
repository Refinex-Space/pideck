<img src="packages/shared/assets/icon.svg" width="80" height="80" alt="PiDeck 图标">

# PiDeck

**基于 Pi 的智能开发工作台。**

[English](README.md) · 简体中文

PiDeck 将编码会话、Git worktree、文件、终端和代码审查整合到一个桌面工作台中。项目基于
[ThinkRail](https://github.com/JetBrains/thinkrail) fork，由 Refinex-Space 独立维护，使用
[Pi](https://github.com/earendil-works/pi) 作为进程内智能体引擎。

初始上游基线为 **ThinkRail `main`**（`6cd6f905`），Pi 版本为 **1.4.0**。
目前面向源码开发和本地构建。固定的上游 commit 表示代码来源，不代表 PiDeck 已发布同名版本；
PiDeck 的应用签名、公证和自动更新服务尚未配置。

## 主要能力

- **项目与工作区管理**：创建独立 worktree 或使用现有 checkout，为工作区组织会话和终端。
- **会话与代码协同**：查看流式回答和工具执行，浏览与编辑文件，审阅 diff，并把审查意见发回会话。
- **复用 Pi 能力**：连接支持的模型提供商，选择模型，使用技能、提示词模板、内置工具、后台命令和子智能体。
- **结构化开发流程**：浏览项目规格，使用继承的计划、任务和审查流程。部分流程会创建 Git 提交，
  用于重要项目之前应核对实际行为；仓库规则本身不构成运行时授权控制。
- **MCP 工具接入**：配置服务器并处理宿主的权限提示，沿用上游引擎和扩展边界。
- **代码智能**：可选且默认关闭。宿主可在你已信任的项目里运行本机已安装的语言服务器（TypeScript、Java、Python、
  Go、Rust 等，也可自定义），让智能体跳转定义、查找引用，并在编辑文件后立即看到该文件的错误。
  PiDeck 不会自动安装服务器；见「设置 → 语言服务器」与状态面板。
- **自带模型服务器**：「设置 → 提供方 → 自定义服务器」可连接公司的大模型网关或本机上的模型，任何兼容 OpenAI 的服务器
  （LiteLLM、vLLM、Ollama、LM Studio、llama.cpp 等）都可以。「查找模型」会列出服务器提供的模型；服务器保存到 Pi 的
  `models.json`，所以其模型既出现在模型选择器里，也能被 Pi 命令行使用。
- **语音输入**：可选。在「设置 → 语音输入」下载语音模型后，用发送按钮旁的麦克风听写。语音在 PiDeck 宿主上用你下载的
  模型识别，不使用云端语音服务。桌面端麦克风权限仍在验证中。
- **全局规则**：「设置 → 指令」直接编辑 Pi 智能体目录里的全局 `AGENTS.md`（以及可选的追加系统提示词），并显示各项目的
  对话实际加载了哪些指令文件，可按需应用到已打开的对话。Pi 命令行读取的是同一份文件。
- **桌面与浏览器入口**：两种入口使用同一套界面，内置英语、日语、简体中文和西班牙语，支持主题设置。

## 更安静的工作台

Studio 布局把主画布留给会话，项目导航保持可见，文件、审查与终端随时可展开。
中性明暗主题、系统界面字体、清晰代码排版、克制动效和可搜索的设置页，采用接近 Claude Desktop
的视觉方向。高对比模式与自定义主题继续可用。
依据、设计决策与跨平台要求见 [design-system.md](design-system.md)。文件与目录菜单支持插入当前聊天草稿，不会自动发送。
左侧导航保持连续，设置入口位于左下角 PiDeck 菜单；分支、远程与 PR 操作归入工作区详情。
顶部返回/前进按钮使用真实导航历史，主要导航工具采用 Lucide 图标，默认工作区使用无装饰图标的文字行。
文件与目录使用本地打包的 [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) 图标，覆盖 Office/PDF、编程语言、框架和常见项目目录；未知类型保留中性默认图标。

文件标签、查看/编辑区与目录树统一放在右侧，聊天保持可见；文件操作按钮与标签栏同排。
文件工作台支持路径搜索与面包屑、源码换行/查找/选择/评论、显式编辑及带内容校验的保存，
并提供文件和目录的新建、重命名、移动与回收站确认。未保存草稿可跨标签保留，并在当前浏览器或原生窗口会话内
恢复，受窗口存储容量限制；关闭窗口前请保存。菜单还提供路径复制、文件管理器定位与已安装编辑器入口。
行为约束、限制和验证见 [file-workbench.md](file-workbench.md)。

智能体工作时，文件树会点亮它正在读取、搜索和编辑的文件（包含子智能体），临时展开所在的文件夹并在离开后收回，
树下还保留一份简短的活动列表。显示哪些内容可在设置 › 会话中选择；从 shell 命令推断的读取默认关闭。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme-assets/pideck-studio-dark.png">
  <img src=".github/readme-assets/pideck-studio-light.png" alt="PiDeck Studio：连续侧栏与居中的输入区">
</picture>

## 从源码运行

需要 **Bun 1.4.4**、**Node.js 22.19 或更新版本**以及 **Git**。真实智能体调用需要模型提供商凭证，
无智能体浏览器测试不需要。无需额外安装 Pi CLI。

```bash
git clone https://github.com/Refinex-Space/pideck.git
cd pideck
git switch refinex/dev
bun install --frozen-lockfile
bun run dev
```

开发命令同时启动宿主和 Web 客户端，并输出本地访问地址；按 `Ctrl+C` 停止两者。

```bash
bun run build:web                    # 构建共享 Web 客户端
bun run --filter @thinkrail/cli dev   # 启动浏览器宿主
bun run build:binary                 # 生成 apps/cli/dist/pideck[.exe]
bun run desktop:build                # 打包原生 PiDeck 开发版
bun run desktop:dev                  # 构建并打开原生应用
```

为减少上游合并成本，内部包名保留 `@thinkrail/*`。产品名为 **PiDeck**，CLI 命令为 **`pideck`**，
桌面应用标识为 **`space.refinex.pideck`**；开发版与 nightly 保留框架的渠道后缀。

桌面包在对应宿主平台构建。继承的目标平台包括 macOS 14+（Apple Silicon / Intel）、Windows x64、
Linux x64 / ARM64。Linux 需要 glibc 2.38+、GTK 3、WebKitGTK 4.1、Ayatana AppIndicator 3 和 librsvg 2。
本地构建成功不等于所有平台已验收，也不等于安装包已签名。
macOS 桌面构建还需要 Xcode Command Line Tools（`xcrun clang`），用于编译 CEF 子视图生命周期适配器。

## 配置与数据

| 位置 | 用途 |
| --- | --- |
| `~/.pideck` | PiDeck 宿主设置、项目与工作区记录、托管 worktree 和日志 |
| `~/.pideck/themes` | 自定义主题 |
| `~/.pideck/locales` | 本地界面翻译 |
| `~/.pi/agent` | Pi 默认配置、凭证、技能和会话存储 |
| `~/.config/pideck` | CLI 安装器元数据，安装后使用 |

PiDeck 不自动迁移或读取 ThinkRail 的 `~/.thinkrail` 应用状态。Pi 配置默认仍然共享；
需要独立的 Pi 配置和会话目录时，可设置 `PI_CODING_AGENT_DIR`，或使用「设置 → 环境」。

现有 `THINKRAIL_*` 环境变量保留原名，其中 `THINKRAIL_DATA_DIR` 可以覆盖 PiDeck 宿主数据目录。
原生桥接名、协议标识和项目内 `.thinkrail/` 工作流文件也保留原有约定。这些是内部兼容契约，
不表示运行 PiDeck 需要安装 ThinkRail。

## 构建、更新与隐私

在 PiDeck 发布自己的已验证产物之前，使用源码或本地构建。上游 ThinkRail 安装包不包含 PiDeck 改动。
继承的安装脚本与 CLI 更新代码已指向 `Refinex-Space/pideck`，但需要实际发布的 PiDeck 产物，
目前不作为安装入口。`pideck update` 不会更新源码 checkout。

桌面更新地址为空；源码和未注入发布身份的本地构建使用 `dev` 渠道，不显示自动更新通知。
更新源码应通过 Git 完成，然后按锁文件安装依赖并重新构建。上游签名证书、公证服务和发布基础设施
不随 fork 提供。

仓库中的分析服务项目 key 为空，因此源码与未注入发布配置的本地构建不发送应用使用数据或错误遥测，
也不会启动上游的浏览器来源关联流程。上游分析实现和隐私设置仍保留在源码中；未来启用遥测需要单独
审查政策和配置。模型提供商、MCP 服务器和工具仍可按配置访问网络，空分析 key 不代表离线运行。

## 分支与上游同步

| 分支 / remote | 职责 |
| --- | --- |
| `upstream` | 官方 `JetBrains/thinkrail` 仓库 |
| `origin` | `Refinex-Space/pideck` fork |
| `main` | 跟踪官方，不承载 PiDeck 定制 |
| `refinex/dev` | 日常开发与集成，当前活跃分支 |
| `refinex/product` | 经过验收、用于日常使用与构建的产品基线 |
| `refinex/feature-*` | 从开发分支开展的单项改动 |
| `refinex/upgrade-*` | 选定上游版本的升级与回归验证 |

两个 PiDeck 分支最初都基于上述固定的上游 `main` commit。开发改动经审查与验证后进入产品分支。
同步 `main` 不自动升级产品；常规升级优先整体合并选定版本，独立修复才考虑 cherry-pick。
完整流程和定制清单见 [fork-maintenance.md](fork-maintenance.md)。

## 开发与验证

仓库协作规则见 [AGENTS.md](AGENTS.md)，详细开发流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。
按实际影响选择验证范围：

```bash
bun run check:deps
bun run check:boundaries
bun run check:seams
bun run lint
bun run typecheck
bun run test
bun run check:i18n
bun run check:spec-surface
bun run check:compiler
bun run e2e                          # 完整无智能体浏览器测试
```

修改构建产物时，还需构建后执行 `bun run smoke:binary` 或 `bun run smoke:desktop`。
真实提供商测试会消耗 Token；完整 `bun run e2e:full` 必须获得明确批准。
测试模式与隔离约定见 [e2e/SPEC.md](e2e/SPEC.md)。

系统分为三层：`packages/server` 与 `packages/shared` 承载 Pi，`packages/contracts` 定义类型化协议，
`apps/web` 渲染界面；`apps/cli` 和 `apps/desktop` 是共享宿主的轻量启动器。
设计入口为 [architecture.md](architecture.md)、[goal-and-requirements.md](goal-and-requirements.md)
及相关模块的 `SPEC.md`。

## 贡献与来源声明

PiDeck 的问题和建议请提交至[本仓库](https://github.com/Refinex-Space/pideck/issues)。
保持改动聚焦，说明实际验证结果。PiDeck 不是 JetBrains 官方产品；上游服务和商标属于各自权利人。

项目保留 ThinkRail 的 [Apache-2.0 许可证](LICENSE)和上游声明。
Fork 来源见 [NOTICE](NOTICE)，定制改动见 [fork-maintenance.md](fork-maintenance.md)。

Pi 图标来自 [theSVG](https://thesvg.org/icon/pi)，来源 MIT 声明保留在
[pi.LICENSE](packages/shared/assets/pi.LICENSE)。

Material Icon Theme 的 [MIT 许可证](apps/web/public/file-icons.LICENSE.txt)随应用分发。

### 网络与代理

在设置 → **网络与代理**中配置宿主的 HTTP/HTTPS 代理。自动模式读取 Windows 当前用户设置、
macOS 当前网络代理，或 Linux 的 GNOME/KDE 设置；已有代理环境变量优先，无桌面的 Linux 使用
环境变量。手动模式支持 HTTP、HTTPS 代理监听地址，认证密码保存在操作系统凭据存储中。
保存后退出并重启宿主，使 Pi OAuth 刷新和模型连接统一使用新配置。

PAC/WPAD、仅 SOCKS 的代理，以及超出域名/IP/主机:端口子集的旁路规则（包括 CIDR、`<local>`
和 IP 前缀通配符）会显示未支持。遇到这些配置时，可手动填写代理软件的 HTTP/mixed 监听地址及
支持的旁路规则。回环地址始终直连。连接诊断访问固定提供商端点，不发送账户凭据、不消耗模型
Token；端点响应不代表登录、模型权限或地区政策通过。外部登录浏览器使用自己的网络设置。

各平台解析器有 fixture 测试；macOS/Linux 原生行为仍须在对应系统验收，不能用 Windows 结果替代。

### 侧边浏览器（桌面端）

浏览器工具在会话旁打开独立 Chromium/CEF 页面，提供多标签、导航、页内查找、开发者工具、
截图复制、自由视口和元素选取。选取结果可预览后加入聊天草稿，不会自动发送。普通 Web/手机端
不提供这项原生能力；CEF 会增加桌面安装包体积。范围与验证边界见
[浏览器规格](apps/web/src/browser/SPEC.md)。

桌面宿主会向现有 Pi 会话注册 `browser` 工具，支持 DOM/可访问性定位、iframe、鼠标键盘、
导航、对话框、上传下载和截图；各聊天独立认领标签页。工具栏相机按钮直接复制 PNG，随后可用
Ctrl+V / Command+V 粘贴；保存文件保留在更多菜单。摄像机按钮支持 WebM 录屏、结束、取消和播放，
智能体还可执行最长 90 秒的录制动作序列。结果保存在工作区 `.thinkrail/browser/`，聊天中的录制文件
可直接打开视频查看器。复用当前 CEF 页面和 Pi 运行时，不启动第二个浏览器实例或智能体运行时。
实现与验收边界见[原生浏览器规格](apps/desktop/src/browser/SPEC.md)。
