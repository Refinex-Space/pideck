---
id: pideck-design-system
type: architecture-design
status: active
title: PiDeck 界面设计规范
parent: architecture
references: [module-web, module-ui, module-desktop, submodule-web-themes, web-color, web-spacing, web-typography]
tags: [design, accessibility, cross-platform]
---

# PiDeck 界面设计规范

本规范是 PiDeck Web、macOS 与 Windows 界面的共同视觉依据。目标是接近 Claude Desktop 的克制、
清晰与精细程度，同时保留 PiDeck 的项目、worktree、聊天、文件、审查、终端、MCP、工具和布局能力。
产品名称、Pi 标识和工作流仍属于 PiDeck；不使用 Claude 的商标、专有字体文件、吉祥物或账户模型。

## 依据与可信边界

研究日期：2026-10-28。参考对象为用户提供的 Claude Desktop 截图与本机 Claude 4.29.0。

| 来源 | 能够支持的结论 | 不能推出的结论 |
| --- | --- | --- |
| Anthropic 官方 `brand-guidelines` | 品牌色、制品排版建议 | 完整 Desktop 组件规范、应用默认字体 |
| Anthropic 官方 `frontend-design` | 从明确视觉目标出发，使用 token、克制动效、真实截图复核 | Claude 每一个组件的精确实现 |
| 本机分发包中的 CDS CSS | 该版本打包资源中的颜色、密度、尺寸、动效声明 | 远程业务页面每个节点当前都使用这些值 |
| 本机明暗工作台与设置页、用户提供的截图 | 可见层级、位置、密度、布局与颜色关系 | 未操作的交互、隐藏状态、Windows 原生行为 |
| 社区测量资料 | 可复查的特定页面测量和替代方案 | 官方规范或对 Desktop 的普遍结论 |

官方公开资料的本次检索范围内，未发现可直接作为完整 Claude Desktop 设计系统的公开 Skill。
Claude 设置中的“设计系统”是用户品牌资产管理功能，并非其内部组件规范浏览器。
本机包内页面还明确说明主体内容由 claude.ai 加载，因此下面区分“观察值”和“PiDeck 实施决定”。

官方技能固定来源：`anthropics/skills@dbd4588f9e1033efb41dad4bef2f7947c8993d44`。
`brand-guidelines` 中的 Poppins/Lora 是品牌制品建议，不能据此冒称 Desktop 使用这两种字体。
本机常规设置实际显示系统字体与回复跟随界面；用户参考截图显示 Anthropic Sans/Serif，属于另一种配置。

参考链接：

- [官方品牌指南](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/brand-guidelines/SKILL.md)
- [官方前端设计指南](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/frontend-design/SKILL.md)
- [官方技能仓库说明](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/README.md)
- [Claude Design 的用户设计系统说明](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design)
- [官方设计师的探索与生产实践](https://claude.com/resources/articles/how-the-product-designer-who-built-claude-design-uses-it-to-explore-ideas-before-building-them)
- [社区 Anthropic 网站测量，非 Desktop、非官方](https://www.pikspec.com/design-systems/anthropic)

## 设计原则

1. **内容是主角。** 导航与工具保持稳定、安静；正文与当前操作具有最高层级。
2. **信息结构形成布局。** 使用留白、对齐和轻微表面差异分组；减少重复标题、嵌套边框和装饰卡片。
3. **按需披露工具。** 主画布默认宽敞，文件、规格、审查、终端都能通过现有入口展开，不删除功能来换取截图简洁。
4. **颜色承担语义。** 主操作采用中性色反转；品牌强调克制。成功、错误、警告、Git diff 和代码语法保留各自语义。
5. **精确而温和。** 有明确的基线、字号、间距、圆角和状态，不用霓虹色、大面积强调色或科幻展示字体。
6. **行为连续。** 换主题、调整工具面板、切换工作区不得丢失输入、选择区、滚动、终端进程或布局。

## 颜色

Claude 4.29.0 打包 CDS 的观察值：

| 角色 | 浅色 | 深色 |
| --- | --- | --- |
| surface 0 | `#f9f9f7` | `#0b0b0b` |
| surface 1 | `#fcfcfb` | `#151515` |
| surface 2 | `#ffffff` | `#1a1a19` |
| surface 3 | `#ffffff` | `#20201f` |
| 主文字 | `#0b0b0b` | `#f0efec` |
| 次级文字 | `#52514e` | `#c3c2b7` |
| muted 观察值 | `#898781` | `#898781` |

品牌 clay 为 `#d97757`，较深强调为 `#c6613f`。CDS 主按钮使用中性色反转，并非通篇 clay。
真实 Code 页面与打包声明存在差异：浅色主画布 `#ffffff`、侧栏 `#fafafa`。深色以 2026-10-31 用户提供的
Claude Code 深色截图（原始像素平面取样）为准，取代此前 4.29.0 的 `#242424` 取样：主画布/顶栏 `#181818`、
侧栏 `#242424`、输入框与弹出菜单 `#303030`、设置对话框 `#1f1f1f`、悬停/选中 `#444444`、遮罩约 60% 黑，文字为纯中性灰
（`#ececec` 主文字）。分隔线按可见度校正：实测 Claude 的细线更暗，但对画布仅约 1.2:1，PiDeck 取 `#404040` / `#525252`
（对画布约 1.7 / 2.4:1，与旧版暗色可见度相当）。因此 PiDeck 标准 Light/Dark
优先匹配这组运行观察值；CDS 的更深层次保留为其他主题方向的参考，不混称为同一套当前真值。
PiDeck 采用上述表面关系和中性主动作为方向；具体值由 theme manifests 持有，不能在组件中复制 hex。
较淡文字必须根据实际背景通过 PiDeck 对比度门禁，不能机械复制观察值。侧栏、主画布、输入框、浮层
只保持足以识别关系的色差；白天不铺大面积冷灰，夜间不使用荧光绿。

- `accent` 用于可辨识的中性强调与链接；`focus-ring` 从 `info` 派生，独立表达键盘焦点；`accentSolid` / `onAccent` 构成主要按钮。
- 用户消息气泡采用中性表面，不把用户整段内容染成绿色。
- `info/success/danger/warning` 及 ANSI / syntax 保留不同语义，不能把所有绿色当成品牌遗留删掉。
- 保留现有六个 theme id 与用户主题 schema，重制内置 palette；自定义主题继续正常加载、校验和热更新。
- 高对比主题仍是完整可用的选择，不以普通主题改名代替。系统主题与用户明确选择均受尊重。

## 字体与阅读

### 图标

界面图标逐步迁移到 Lucide，按名称静态导入，统一线性描边；Pi 与提供商品牌资源不变。
本轮只迁移指定入口，其他 Remix 图标有意保留。使用 16px 图标与当前行高，不因选中切换实心形状。

| 入口 | Lucide 名称 |
| --- | --- |
| 终端 | `terminal` |
| 项目展开 / 折叠 | `folder-open` / `folder-closed` |
| 侧栏展开 / 折叠状态 | `panel-left` / `panel-right` |
| 返回 / 前进 | `chevron-left` / `chevron-right` |
| Specs / 文件 / TODO | `book-open` / `folder` / `square-check-big` |
| Skill / 资源 | `blocks` / `package-2` |

默认工作区采用无装饰图标的文本行，不删除运行/未读状态；状态与工作区分支语义仍然保留。
返回/前进复用真实浏览器路由历史，边界禁用，不能生成仅有图标但没有行为的按钮。

以 CDS comfortable 的角色为参考：body 14/20、prose 16/24、code 13/19、caption 12/17、
footnote 13/17、heading 15/20、title 22/28（单位为逻辑像素，实际还受 rem-scale 影响）。

PiDeck 使用合法可分发的既有字体及系统字体栈：界面优先平台系统 sans，明确包含 macOS/Windows/CJK
回退；代码继续使用 JetBrains Mono 与系统等宽回退。项目名和欢迎标题移除 Orbitron 科幻字形。
常规正文使用 400，交互标签使用 500，强调/标题使用 600；不要默认以 370 的细字重显示大段中文。
长文采用有限行宽和更舒展行距，保留用户已经设置的行宽。代码、终端、表格不强制 serif。
不从 Claude 安装包复制 Anthropic Sans/Serif 字体，也不把字体名称相同视为拥有分发许可。

字号、行高与字重写入 `apps/web/src/styles/typography.json` 后生成 CSS。聊天正文行高变化必须联动
`chat/rowHeightEstimates.ts` 和滚动测试；输入框、隐藏测量器与模板 backdrop 必须使用相同字体和 padding。

## 间距、曲线与动效

CDS comfortable 观察值：控件高 32、图标 20、常规半径 8、composer 14、panel 12；小/大控件
为 24/28/40，padding 6/8/12/16/24，gap 8/12/16/28/40。PiDeck 沿用现有语义尺寸体系并映射到近似角色，
不把第三方任意数值散落到每个组件中。

规范的圆角层级：xs 4、sm 6、md 8、lg 12、xl 14。小菜单行与标签用 xs/sm，按钮/输入用 md，
对话框与工具面板用 lg，聊天输入外框用 xl。圆角是角色层级，不是把所有容器都做成同一种卡片。
32px 刻度用于设置章节分组和带图标搜索框的文字起点；40/64 暂保留为未消费刻度。
间距仍通过现有数值 token 使用；有明确设计需要时才能增加刻度，并同时更新规格和使用检查。

CDS 时长观察值为 60/120/200/300/450ms，out 曲线为 `cubic-bezier(.165,.84,.44,1)`。
PiDeck 常规 hover/focus/菜单响应以 120–200ms 为主；较大的弹窗不超过 200ms；避免逐卡片揭示或持续漂浮。
状态响应应解释发生了什么。`prefers-reduced-motion` 下停止非必要位移/循环，保留状态信息。

## 工作台与导航

- 不设置横跨全应用的独立 Header。左侧是连续导航，主画布顶端是工作区上下文，右侧是按需工具。
  各栏顶部内容共享 40px 高度，右栏首个面板标题直接与主工具栏对齐，不在标题上方叠加空白控制带。
  右栏与主画布使用相同的 workspace 背景，仅以细分隔线划分；左导航保留 sidebar 背景。
  保留 macOS 原生 inset 与 Windows caption buttons 安全空间；不绘制交通灯。
- 展开的左栏把工具切换放入顶部横向工具带，底部 PiDeck 菜单提供设置、外观、语言、更新与连接状态。
  折叠时保留紧凑工具带和应用菜单；高级布局的工具拖动、右键菜单与快捷键继续可用。
- 项目是轻量分组，工作区行统一 32px 最小高度、16px 图标、8px 图文间隔、8px 行内边距。
  不用层层左缩进表达已有分组；分支作为次级信息，与名称共用文本起点。
- 左导航以约 288px 的参考密度组织项目/工作区，允许既有拖动调整；已有用户保存的尺寸不得重置。
- 主画布顶端只有一行 40px 顶栏（底部带一条 `border-muted` 细分隔线，与 Claude 一致）：左侧是活动会话标签（圆角、无分隔线与底部粗线、无会话图标，hover 才出现关闭），
  右侧依次是新建/历史、位置与环境详情、全局唯一的终端入口、右侧工具（Specs/文件/评审/TODO），不再有竖向右栏和底部终端栏。
- 标题/位置上下文应紧凑，避免同一屏反复出现“项目/项目/项目”。项目、工作区、分支、远端与 PR
  入口仍可访问，次要上下文适当降级，但不能删掉真实操作。
- 新建工作台采用内容优先的初始布局：左侧项目导航可见，右侧工具与底部终端按需展开。保留旧预设与
  显式恢复/切换路径；新默认不覆盖已保存的自定义布局。
- 文件和审查在现有 workbench 里展开，继续支持 preview tab、pin、拆分、拖放、重排、键盘导航、
  窄窗局部压缩、跨工作区 DOM/状态保留。不能用新的简化单页替换真实工作台。
- 启动页采用克制的标题与轻量行动列表，保留打开/最近项目、路径输入、Default workspace、隔离 worktree、
  项目规格与信任状态。不得假造一个无法执行的聊天输入框。

## 聊天、输入与工具

输入区浮在主画布底部，外框采用细边线、轻阴影和明确的焦点状态；模型、思考、附件、历史、模板与
运行控制按主次排列。输入框与消息正文共用 `--chat-transcript-width` 和左右 gutter，居中并同步跟随正文行宽设置与面板缩放；
不另设 768px 上限。正文选择超宽横向滚动时，输入区仍限制在可见面板内，保证操作按钮可达。
历史搜索放大阶段继续使用完整聊天面板的空间。
可视容器调整不改变 IME、Enter/Shift+Enter、steer/follow-up、图像 paste/drop、
文件 mention、命令、模板 slot、草稿与选区、增长上限或发送授权。

输入区与已发送消息对已识别的 `/skill`、`/命令`、`@文件` 使用同一套 token：`feedback-info` 文字色加
`feedback-info-subtle` 底，悬停加深到 `-muted`；未命中目录或不存在的名称保持普通文字，因此着色即表示可解析。
着色由 `PromptField` 的镜像层绘制，textarea 保持原生（输入法、撤销、拼写检查、选区），输入法组合期间镜像让位。
补全菜单按来源分组，行用 16px 图标，选中行的完整说明与来源显示在菜单底部；悬停 token 时出现说明卡片，卡片不夺取焦点。
`/` 与 `@` 在任意 token 开头触发，词中、路径中的符号不触发；`/` 后补空格即回到普通文字。

状态面板（`StatusDock`）不是右侧工具面板，而是聊天的同侧伴随栏：顶栏终端入口左侧的状态图标（原“工作区详情”位置）
展开它，聊天主面板顺势收窄左移，右侧依次排列环境、上下文、后台任务、连接器、更改五个细线边框区块。区块可折叠，
悬停出现抓取柄，指针拖拽或 `Alt+↑/↓` 调整顺序；打开状态、顺序与折叠只保存在本窗口。上下文区块只显示引擎上报的用量，
不估算 system prompt、工具、skills 等分项；连接器区块是 MCP 服务器，管理仍在设置与聊天的 Resources 中。

用户消息采用轻量中性气泡；助手回复有稳定行宽和阅读节奏；工具、推理、后台命令、子智能体与 MCP
沿用现有折叠/展开语义，用文字和状态图标表达进度，不用装饰动效制造忙碌感。代码/图片/表格异步加载
后必须保持读者位置；newest-first、历史跳转、Latest、折叠行都要回归。

## 设置、菜单与弹窗

设置使用稳定的两栏布局：约 208px 导航、清晰分组与中性选中底色，内容区拥有独立滚动。桌面宽度
约 960–1040px、受视口限制；窄窗保留可访问的横向/折叠导航而不裁掉选项。栏目不用全大写装饰标签。
搜索如果加入必须真正筛选导航，不能放一个摆设输入框。

设置行优先使用标签、必要说明、右侧控制的清晰对齐；组间留白大于行内留白。菜单、popover、tooltip、
dialog 统一使用共享 UI primitives；保留 Radix 的焦点管理、Escape、嵌套浮层、portal、disabled 和 loading。
危险操作使用既有确认与危险色，不能因参考应用更简洁就移除确认。

## 跨平台与可访问性

Web、macOS、Windows 共用组件与 token。平台差异只出现在原生窗口控制、修饰键提示、字体回退和
滚动/缩放行为。macOS 左 inset 64px，Windows 右 caption 区 138px/按钮 46×40px 的现有契约保持。

- 键盘导航必须有可见的 1px `focus-ring` 提示与有意义标签。焦点颜色独立于黑白主按钮色。
  鼠标点击与工作台自动恢复焦点不能产生粗框；保留真实 DOM 焦点、方向键与关闭后的恢复行为。
- 保留正文/次级文字在 resting surfaces 上 4.5:1 的现有门禁，hint 至少 3:1；高对比主题使用其原有门槛。
- 现有 hover 与表面 1.15 的区分度是 PiDeck 本地设计门禁，不冒称为 WCAG 的通用要求。
- 视口至少覆盖 390、1024、1440、1920px，检查 100%/125%/150% 缩放、长中文/英文与无空格标识。
- 浏览器中的 Windows 平台模拟只能验证 Web 呈现；不能代替 Windows WebView2、DPI、输入法和原生控件验收。

## 代码所有权与验证

| 内容 | 唯一来源 |
| --- | --- |
| 主题色、代码/终端色 | `apps/web/src/themes/bundled/*.theme.json` |
| 语义颜色映射 | `apps/web/src/styles/colors.json` |
| 字体与排版 | `apps/web/src/styles/typography.json` |
| 数值间距 | `apps/web/src/styles/spacing.json` |
| 结构尺寸/圆角 | `apps/web/src/styles/tokens.css` |
| 共享交互控件 | `packages/ui` |
| 工作台几何与恢复 | `apps/web/src/shell/layout*` 的既有所有者 |
| 平台窗口契约 | `apps/desktop/src/windowChrome.ts` 与 web native controls |

先更新本规范和所属 SPEC，再实现实际组件。新语义角色必须在生成源声明；不新建覆盖所有组件的
“Claude CSS”补丁层，不增加第二个布局状态所有者，不用无意义兼容分支或 lint 抑制。

交付验证包含：主题与排版/间距检查、共享控件与布局单测、语言/主题/输入/滚动/工作台定向浏览器测试、
最终完整无智能体浏览器套件，以及实际执行的平台 build/smoke。视觉 QA 同时检查浅/深、空白/有内容、
设置/菜单/文件/终端、hover/focus/error/loading/reduced-motion，截图与参考保持相同逻辑视口。
研究截图可能含用户内容，只保存在本地忽略目录；对外文档与 README 仅使用隔离示例数据的截图。

## 版本限定的研究证据

分发包为 Claude Desktop 4.29.0，ASAR SHA-256 为
`fea39d0330a1f6dcb143d9a3fe7b45ed21343c5fc2895c1dff2cb942a28eeb7a`。
样式路径为 `.vite/renderer/main_window/assets/MainWindowPage-BIxm3NVN.css`，SHA-256 为
`a53bb9505d1f10c5ff519b32ffdfde1802e119169e02fda7e4034db8a34f0cfe`。
REA parent Evidence 为 `ev_d56d37515f89c306a8f30d97a1be19ebf498720c65f728643ec96a0dca6fec3d`。
所选 CSS/HTML 资源均与 ASAR 声明哈希匹配；native binding 有独立哈希矛盾，未用于推导样式，
语义图为 partial。这里不宣称完整程序复原，也不宣称未经执行的 Windows 原生验收。

本机 UI 观察覆盖 Code 空工作台、设置、浅色与深色，主题已恢复原有“系统”选项。侧栏宽度288px
来自可访问性树，顶部约40px是截图观察；颜色层级与已提取 token 交叉核对。研究原图保留在本地
忽略目录 `design/claude-reference/`，不作为仓库公开图片。

## 文件与目录类型图标

文件浏览器使用 Material Icon Theme 的本地 SVG 与官方文件名、复合扩展名、目录名规则，
覆盖文档、语言、框架、配置及工具类型。常用目录使用对应的闭合/展开图标；未识别目录
使用 Lucide `folder` / `folder-open`，未识别文件使用 `file`。资源为 16px 装饰图标，
明暗变体跟随应用主题，不根据操作系统主题单独切换。Git 颜色与状态继续由文字和标记表达。
文件名、目录路径不发送给第三方服务；品牌配色仅来自所捆绑的 SVG，不扩展界面主题调色板。

## 侧边浏览器

浏览器复用工作台工具入口与面板几何。标签页放入现有 40px 面板标题行，不再增加重复的“浏览器”标题。
下一行是后退、前进、刷新/停止、地址草稿、自由尺寸、选取和更多菜单。空页仅在提交有效地址后打开。
自由视口宽高采用独立草稿和范围校验；预览缩放不得改变 CSS viewport 或截图像素。元素选取显示
轮廓与样式摘要，Esc 取消，底部预览提供显式加入草稿和丢弃；选取不得触发原页面按钮。
跨源网页保持自己的主题；注入选取浮层从 PiDeck 主题读取颜色，不向网页注入全局主题 CSS。
