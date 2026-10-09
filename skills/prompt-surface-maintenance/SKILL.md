---
name: prompt-surface-maintenance
description: Use when editing any model-facing surface of this harness — a tool definition (name, description, parameter schema), a system-prompt section, a plugin's prompt text, or a skill — including tuning the dsh-memory injection or other local plugins. Carries the house rules for wording, cache cost, backup, install path, restart and pointer placement, so the edit is both cheaper every session and revertible.
---

# 模型可见面的维护（本机房规）

上游原则先按 DSH 自带的 `agent-experience`（上下文五条 + 工具定义五条）。下面是**本机实测**补出来的部分。

## 一、怎么写字（省 token 又不出错）

- **缓存代价是硬约束**：系统提示每步整份重渲染，任一 section 文本一变就整份重发（实测未命中 9k–24k token）。
  ⇒ 注入段只放**跨步不变**的内容；每步会变的（时间戳、计数、动态状态）一律不放。
  ⇒ 需要"开局读一次"就配 `injectRefresh: 'session'`（dsh-memory 的做法）。
- **同一事实只说一次**：工具定义 / 参数说明 / 注入段三者不许重复。分工——写入与检索规则归**工具定义与参数说明**；
  注入段只留"这块怎么读 + 它的行为后果"。
- **不写实现**：模型可见面只写行为与约束，不写机制（插件名、缓存策略、内部字段、日志标记）。
- **参数规则放参数上**：默认值、范围、配对、何时设置 → 写进那个参数的 description。
- **能删就删**：模型从调用结果就能学到的（文件不存在会报错、发送失败即未送达）不要写。
- **量一下**：改完报前后差（中文 UTF-8 约 3 字节/字；token 别硬算，只报字数量级）。

## 二、改的顺序（照 dsh-memory 走通过一遍的流程）

1. 读原文（别凭印象改）；2. **备份**——工作区 git 未必干净（可能带着更早的未提交改动），
   所以另落 `<file>.bak-<yyyyMMdd-HHmmss>`；3. 改；4. 跑该项目自测；
5. **装进 profile**：插件目录是**拷贝不是链接**（`~/.dsh/profiles/web/<plugin>/`），改工作区源码不会自动生效；
   按项目 `install.ps1`，或直接逐文件拷 `index.mjs` / `package.json` / `lib/*` 三件并**核 sha256**；
6. **重启 dsh web 才生效**（不要自己重启：会把进行中的会话掐掉；说一声让主人点）；
7. 同步该项目的 `docs/` 与 `AGENTS.md`（模型可见面变更属维护义务）。

## 三、技能与指针放哪（发现规则是硬约束）

- **发现根怎么算**（2026-10-09 读 `@deepseek-ai/dsh-skill-filesystem` 源码）：项目根 = **从会话 cwd 往上找到的第一个含 `.git` 的目录**；
  技能只从 `用户根` 与该目录下的 `.dsh/skills`、`.agents/skills` 收集 ⇒ **项目子目录里的 `.dsh/skills` 不会被自动发现**
  （除非会话本身就开在那个项目上）。
- **按作用域三档**：

  | 作用域 | 东西放哪 | 指针写哪（唯一到处注入的那份） |
  |---|---|---|
  | 跨工作区通用 | `~/.dsh/skills/<name>/SKILL.md` | **用户级 `~/.dsh/AGENTS.md`** |
  | 本工作区跨项目 | `<工作区根>/.dsh/skills/` | 工作区级 `AGENTS.md` |
  | 单项目 | **别做成技能**：写进该项目 `AGENTS.md`（项目内自动注入，触发最可靠）或 `docs/` | 该项目 `AGENTS.md` |

- 判据一句话：**指针要放在"那一刻一定会被注入"的文件里**——技能目录的 `description` 必须等我主动 `skill <name>` 才起作用，
  所以它只管"我叫什么、何时用我"，**触发靠指针**。
- frontmatter 必须 `name`（kebab-case）+ `description`（写"**何时用**"）。⚠ **frontmatter 是 YAML**：`description` 里出现
  **未加引号的 `: `（冒号+空格）会让解析失败、条目被静默丢弃**——实测 `touhou_little_maid` 长期未被收录，改名无效，
  去掉那个冒号才收录（2026-10-09 复核；同类风险：`#`、行首缩进、引号不配对）。
- **不要改应用自带技能**（`…\Programs\DSH Desktop\resources\app\node_modules\@deepseek-ai\…\skills\`）：所有会话共用、升级会被覆盖。

## 四、可参照的样板

- 插件实例（work space 工作区）：`memory-tool/`——注入段按会话冻结、三工具、测试齐备（含文案纪律的代码注释与 `.bak-<时间戳>` 备份）。
- 指令分层与真源判据（work space 工作区）：`tools/docs/agent-instruction-layers.md`。
- 上面两条只是**样板**，路径是那个工作区里的；换工作区要按本技能第三节的规则重新定位。
