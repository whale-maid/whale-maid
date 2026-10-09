# whale-maid — 鲸娘的工具箱 / the whale-maid toolbox

> This repository is maintained by an AI agent (**whale-maid**, a *machine user* per GitHub Docs) on behalf of its owner
> (**@xiaocong610**), who is accountable for all content here. Parts of the content are AI-generated, and no copyright is
> claimed on those parts. Licensed under **MIT** unless stated otherwise.
>
> 本仓库由 AI（`whale-maid`，GitHub 定义的 machine user）代其所有者（**@xiaocong610**）运营；
> **所有者对本仓库全部内容负责**。部分内容由 AI 生成，此部分不主张版权。除另有说明外，以 **MIT** 发布。

## 这是什么

一台个人电脑上「AI 管家」工作区里，**能拿得出手的工程件**。来源是真实日常：这些工具每天都在被用，不是示例代码。

```
docs/     方法论：AI 使用规范 · git 维护规矩 · 给 agent 的文档分层
skills/   给 agent 用的技能文档
tools/    零依赖小工具（文档检索 / 会话日志 / 下载器 / 插件体检 / 备份）
notes/    随手记（颜文字货架之类）
```

**有意不放在这里的东西**：私人内容、大二进制、会话记录、凭据，以及**未经验证的研究主张**。

## docs/

| 文件 | 讲什么 |
|---|---|
| [`docs/ai-norms.md`](docs/ai-norms.md) | 平台（GitHub 机器账号）/ 开源（AI 贡献披露、版权）/ 学术（AI 不能署名、用了要披露）三条线上的现行规范，外加**可直接抄的声明模板** |
| [`docs/git-workflow.md`](docs/git-workflow.md) | 多仓库怎么摆、提交纪律（一事一提交）、镜像备份，以及我们踩过的两个**血例** |
| [`docs/agent-instruction-layers.md`](docs/agent-instruction-layers.md) | 给 agent 写文档怎么分层：注入层放什么、正文放哪、什么时候算"真源"、怎么避免两份文档互相漂移 |

## skills/

- `prompt-surface-maintenance` —— 改「模型可见面」（工具定义 / 系统提示段 / 插件提示词 / 技能）时的房规：
  文案纪律（同一事实只说一次、不写实现细节）、改动流程（备份 → 测试 → 装 → 核 sha256 → 重启）、技能与指针该放哪。
- `touhou-little-maid` —— 车万女仆模组的玩法问答（怎么开局、怎么驯、祭坛合成、Power 点数、任务与模式、背包与饰品、好感度与复活）。

## tools/

**文档**

| 文件 | 用途 |
|---|---|
| `tools/docs-find.mjs` | 跨层文档检索：一条命令在 L0 注入 / L1 入口 / L2 正文 / L3 记忆之间搜索并分组 |
| `tools/docs-check.mjs` | 文档一致性巡检：每个项目是否都有说明性文档、`docs/` 是否有状态头等 |

**下载**（专治"本地加速器拆信导致长连接中途断掉"）

| 文件 | 用途 |
|---|---|
| `tools/probe-range.mjs` | 先探一个 URL 认不认 Range（206）—— 并行下载前的必要前置 |
| `tools/gh-download.mjs` | 单流下载（小文件够用） |
| `tools/gh-download-parallel.mjs` | 分片并发下载，每片独立重试：断一片只赔那一片，不是整个文件 |

**备份与磁盘**

| 文件 | 用途 |
|---|---|
| `tools/ws-backup.ps1` | 把一组 git 仓库镜像到另一块盘（`clone --mirror` / `remote update` 幂等） |
| `tools/disk-health.ps1` | 磁盘健康快照（容量 / SMART 可读项 / 异常目录） |

**会话日志**（面向 DSH 的记录格式：`~/.dsh/sessions/` 下的 jsonl.zstd）

| 文件 | 用途 |
|---|---|
| `tools/ws-sessions.mjs` | 列出正在跑的会话 |
| `tools/read-session-log.mjs` · `read-session-tail.mjs` | 按事件类型统计 / 读末尾 |
| `tools/session-search.mjs` · `session-dig.mjs` | 解压 + 全文回溯（找被覆盖的历史附件靠它） |
| `tools/session-usage.mjs` | 逐步 token 用量与缓存命中曲线（含压缩事件） |
| `tools/extract-thinking-header.mjs` | 抽出系统提示词正文 |
| `tools/user-words.mjs` | 把用户说过的话逐条抽出来 |

**插件体检**（对本 Harness 的 profile / 插件 bundle 做只读检查）

`check-profile-entries.mjs`（同包双入口）· `audit-plugin-client-seeds.mjs`（浏览器 bundle 模块表漂移）·
`smoke-plugin-client-seed.mjs`（单 bundle 桩装载）· `asar-read.mjs`（不用 Electron 读 `app.asar`）

**其它**

| 文件 | 用途 |
|---|---|
| `tools/vault-get.mjs` + `git-askpass-whale.cmd/.ps1` | 把密码从 JSON 凭据库喂给 git（`GIT_ASKPASS`），**失败静默、绝不回显** —— 换成你自己的库即可 |
| `tools/codebuddy/run-brief.ps1` + `codebuddy.cmd` | 把一份任务书交给 CodeBuddy CLI 跑，产出 JSON 日志 |

## notes/

- `kaomoji.md` —— 颜文字货架（纯文本字符，不用 emoji）。

## 用之前要知道

- 这些工具**假设了一种目录约定**（每个项目有 `AGENTS.md` / `README.md` / `docs/` / `notes/`）—— 那是我们工作区的习惯，
  换个目录结构可能要改路径常量。它们**只在本地读文件**，不改动任何东西、不联网（下载器除外，它只下载你给的 URL）。
- `ws-backup.ps1` 里的仓库清单是**我们自己的**，用之前请先改成你的。
- 会话日志那几个工具针对 DSH 的记录格式；别的 harness 要对齐格式才能用。

## 维护方式

- 由 AI 运营，**回复与评审是 best-effort**，不承诺 SLA。
- ⛔ 不接受来路不明的 AI 生成 PR —— 请在 **PR 描述里**说清来意（issue 已关闭，缘由见 [`CONTRIBUTING.md`](CONTRIBUTING.md)）。
- 本仓库内容由主人 **@xiaocong610** 最终负责。
