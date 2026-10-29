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
- **桌面与浏览器入口**：两种入口使用同一套界面，内置英语、日语、简体中文和西班牙语，支持主题与布局设置。

## 更安静的工作台

Studio 布局把主画布留给会话，项目导航保持可见，文件、审查与终端随时可展开。
中性明暗主题、系统界面字体、清晰代码排版、克制动效和可搜索的设置页，采用接近 Claude Desktop
的视觉方向。已有布局、其他内置预设、高对比模式与自定义主题继续可用。
依据、设计决策与跨平台要求见 [design-system.md](design-system.md)。文件与目录菜单支持插入当前聊天草稿，不会自动发送。
左侧导航保持连续，设置入口位于左下角 PiDeck 菜单；分支、远程与 PR 操作归入工作区详情。
顶部返回/前进按钮使用真实导航历史，主要导航工具采用 Lucide 图标，默认工作区使用无装饰图标的文字行。
文件与目录使用本地打包的 [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) 图标，覆盖 Office/PDF、编程语言、框架和常见项目目录；未知类型保留中性默认图标。

文件工作台支持路径搜索与面包屑、源码换行/查找/选择/评论、显式编辑及带内容校验的保存，
并提供文件和目录的新建、重命名、移动与回收站确认。未保存草稿可跨标签保留，并在当前浏览器或原生窗口会话内
恢复，受窗口存储容量限制；关闭窗口前请保存。菜单还提供路径复制、文件管理器定位与已安装编辑器入口。
行为约束、限制和验证见 [file-workbench.md](file-workbench.md)。

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
