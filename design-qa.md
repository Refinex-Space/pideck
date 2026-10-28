# PiDeck 视觉与交互验收

final result: targeted checks passed; full-suite follow-up has 3 pending cases; Windows native pending

状态：本机视觉与交互验收通过。Windows 真机验收按用户决定待完成；不把浏览器仿真当作 Windows 原生验证。

## 对照范围与来源

- Claude Desktop 4.29.0：本机 Code 空会话、浅/深色设置、用户提供的文件/菜单截图。
- PiDeck：隔离 E2E profile 的真实 Web 客户端；不调用真实模型，不使用用户项目作为公开截图素材。
- 原始 Claude 捕获为 4632×2650（@2x），按 2316×1325 CSS px 归一化；PiDeck 浏览器视口设为同一尺寸。
- 对照合成图：本地忽略目录 `design/claude-reference/comparison-01-canvas-dark.png`。这张图同时包含真实
  source 和 implementation，用于判断比例、层次与密度；不是新生成的设计稿。
- Web 不绘制 macOS 原生交通灯；产品身份、功能数目、数据与菜单内容允许按 PiDeck 实际能力不同。

## 第一轮发现与修正

| 级别 | 位置 | 证据与影响 | 修正 |
| --- | --- | --- | --- |
| P1 | 标准暗色主画布 | 运行参考为 #242424，初版直接用静态 CDS #0b0b0b，整体明显偏黑 | 按真实平面取样调整标准 Light/Dark，并保留对比度门禁 |
| P1 | 超宽窗口输入区 | 初版输入框几乎铺满聊天画布，参考可见卡片约764px | 将可见Composer收敛到约768px，窄窗收缩；历史放大不受cap限制 |
| P2 | 初始左栏 | 固定18%在2316px下明显大于参考288px | 仅pristine/明确应用Studio按视口推导初值，继续保存ratio，恢复用户布局优先 |
| P2 | 设置搜索生命周期 | 打开模板为文件绕过Dialog关闭回调，重开仍残留查询 | 随open关闭清query；真实回归先复现失败，修复后通过 |
| P1 | 工作台焦点 | 自动恢复与鼠标点击触发粗黑框 | 使用局部焦点意图区分程序恢复/鼠标与键盘；统一 1px focus-ring，保留实际焦点与键盘恢复 |
| P1 | 导航层级 | 全局 Header、垂直活动栏和项目标题重复，行起点不齐 | 连续左栏、横向工具带、底部应用菜单；40px 窗口带融入各列，项目/工作区文本起点一致 |
| P2 | 应用菜单生命周期 | 路由恢复期间 Footer 重新挂载会关闭刚打开的菜单 | Radix Root 与菜单内容由稳定 Shell 持有，只移动触发器；没有额外全局状态 |
| P2 | 用户消息复制按钮 | 12px 新内边距与旧 8px 定位相差 5px | 同步为 bottom-12，恢复内容末行对齐 |
| P2 | 菜单外框 | 子菜单圆角仍8px，顶层已12px | 子菜单复用同一个menuContentClass |

## 五类保真检查

- 排版：系统sans与CJK回退，UI14/20、阅读16/24、代码13/19；没有复制专有字体。已核对真实 Web 与 macOS 设置页面；输入/IME与滚动已有定向回归。
- 空间：各栏窗口带40、panel32、导航行最小32；展开导航288px，字体/图标基线和底部菜单位置由浏览器几何回归验证。
- 颜色：标准主题按运行观察校正；其余主题保留可辨识层次与高对比能力。主题41项测试通过，未削弱门禁。
- 图像：继续使用Pi产品标识；不复制Claude吉祥物或用绘图伪造第三方品牌资产。矢量来源/许可证保持。
- 内容与交互：所有原有项目、worktree、文件、审查、终端、MCP、工具、草稿和设置入口保留；新增设置栏目搜索与显式会话切换入口，分支/远程/PR归入工作区详情，原有操作均保留。

## 验证边界

- 完整无智能体浏览器最终轮 656/656 通过（5 个隔离 shard，1012.2 秒）；首次失败与修复记录见下。
- macOS 最终构建、expanded-app smoke 与独立实例的真实界面核对已完成；Windows caption 控件仿真通过，原生真机仍待验收。
- 本机没有 Windows 执行宿主。不能用Mac上的浏览器截图声称已通过WebView2、Windows输入法或高DPI真机验收。

## 最终视觉证据

- `design/claude-reference/comparison-02-navigation.png`：真实 Claude/PiDeck 明暗导航在 1× 逻辑像素下并排；只归一化截图分辨率，没有重绘组件。
- `.github/readme-assets/pideck-studio-{light,dark}.png`：1440×900 的隔离 Web 示例。实际输入面板、导航、布局和模型选择器；未请求模型生成内容。
- `design/claude-reference/pideck-menu-light.png`、`pideck-workspace-details.png`、`pideck-file-split.png`：菜单、详情、聊天与文件分屏。
- `design/claude-reference/17-pideck-native-macos-home.png` 与 `18-pideck-native-macos-settings-light.png`：最终桌面构建的隔离实例，首次提示取消、底部菜单、设置、浅/深主题均实际操作。
- 有意差异：PiDeck 的项目/worktree 层次、标签分组、工具与终端 rail 属于已有工作能力；不会复制 Claude 的账号、套餐、模式、Artifacts 等未提供的功能入口。
- 原生截图中的系统屏幕控制提示属于 macOS 录制/控制 UI，不是 PiDeck 绘制的按钮。Windows 原生标题栏、WebView2、DPI、IME 的真机验收按用户决定待完成。

## 回归记录

- 完整无智能体套件首轮：619 通过、37 未通过；失败包含旧导航/尺寸/默认布局断言，以及菜单生命周期、拖放目标、复制按钮对齐问题。
- 修复后这 37 项全部通过（先 34 项，再其余 3 项）；未删除功能断言、未加入忽略或类型抑制。最终组合再次执行完整套件，656/656 全部通过。
- Web 单测 1956 通过；共享 UI、资源渲染器与 desktop 单测 422 通过、4 个 Windows 原生专用项在 macOS 跳过。
- 模块边界、spec surface、依赖、seams、typecheck、i18n、lint 与 React Compiler census 通过。lint 保留仓库原有大体积 HTML 文件警告。
- 最终 macOS desktop build + expanded-app smoke、CLI binary build + smoke 均通过。原生 smoke 包含真实窗口控制、标题栏双击、预加载/导航与隔离宿主探针。
- 未运行真实模型完整套件，不涉及模型凭据或付费调用；没有提交、推送或发布。

## 环境与收尾

- 验证运行时：Bun 1.4.4、Node.js v24.14.1，macOS ARM64；Node 满足仓库至少 22.19 的要求。
- 视口覆盖：2316×1325、1440×900、1024×768；390×780 检查折叠导航、底部菜单、可滚动的设置页面。
- 缩放仿真以固定物理画幅对应 1152×720 / DPR 2.5（125%）、960×600 / DPR 3（150%）；输入区与底部菜单仍在视口内。这不是 Windows 字体或系统 DPI 真机证据。
- 减法审查：移除 Web 的 Geist/Orbitron 依赖、独立全局 Header、重复 Projects 标题与展开侧栏的纵向工具条。保留既有布局状态、引擎、协议和持久化，未引入新依赖或全局焦点模式。
- 官方 `brand-guidelines` / `frontend-design` 的 SKILL.md 与 LICENSE.txt 已按固定提交安装并验证于 `~/.codex/skills`、`~/.claude/skills`、`~/.pi/agent/skills`；仓库规范是 PiDeck 的实施依据。
- 浏览器测试的临时视口覆盖已清除；独立 Web / native 预览进程已停止；既有 `localhost:24269` 开发服务保持运行。
- 未新增 lint/type 忽略、未削弱行为断言、未修改远程或 product 分支。工作保留在 `refinex/dev` 的未提交改动中。

## Lucide 与导航按钮补充验收

- 按指定清单替换 terminal、folder-open/folder-closed、panel-left/panel-right、chevron-left/chevron-right、book-open、folder、square-check-big、blocks、package-2；默认工作区移除装饰图标，运行和未读状态保留。
- 展开和折叠状态下，侧栏开关、返回、前进均在同一水平控制带；返回/前进复用浏览器历史，支持禁用边界、刷新保留、回退后新导航截断 Forward。
- 20 项定向浏览器回归通过，Web 单测 1960 项通过，导航/资源定向单测 48 项通过；类型、lint、边界、国际化和编译器检查通过。macOS desktop build / smoke 通过，Windows 真机仍待验收。
- 本轮完整浏览器套件 659 项：656 通过，3 项初次未通过。两项模型选择测试将 Recent 与 All 中同一模型重复计数/定位，测试已改为唯一模型计数和明确 All 项；另一项是终端 Ctrl+C 测试的进程退出。定向复验启动被已有 26060/health 服务占用阻止，未实际执行；按用户快速收尾要求不继续排查，因此这 3 项保留待复验状态。
- README 明暗截图已更新为 1280×720 的隔离示例；局部图标证据在 `design/claude-reference/lucide-navigation-proof.png`。

## 结束后的思考标签修复

- 现场确认 `chat-scroll` 的 streaming 与 thinking-group 的 live 均为 false，问题来自静态中文类别被译为“思考中”。静态标签改为“思考过程”，历史步骤摘要改为“思考”；仅 live 且 thought.streaming 时显示“思考中…”。西语同步采用中性类别名称，避免把中断或历史记录描述成仍在进行。
- 新增 5 项回归先复现失败，修复后思考分组/活动摘要/流式状态 25 项单测通过；国际化检查与 Web typecheck 通过。当前开发页面已实测显示“思考过程160 个字符”，状态仍为 false。
- 2 项定向浏览器回归通过：中文历史记录展开/刷新后保持中性标签，既有模型标题折叠呈现不变。构建通过后使用独立测试 lane 避开被占用端口，未改动现有开发服务。本轮未运行完整浏览器套件。
