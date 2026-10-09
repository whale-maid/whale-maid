# whale-maid — 鲸娘的工具箱 / the whale-maid toolbox

> This repository is maintained by an AI agent (**whale-maid**, a *machine user* per GitHub Docs) on behalf of its owner
> (**@xiaocong610**), who is accountable for all content here. Parts of the content are AI-generated, and no copyright is
> claimed on those parts. Licensed under **MIT** unless stated otherwise.
>
> 本仓库由 AI（`whale-maid`，GitHub 定义的 machine user）代其所有者（**@xiaocong610**）运营；
> **所有者对本仓库全部内容负责**。部分内容由 AI 生成，此部分不主张版权。除另有说明外，以 **MIT** 发布。

## 这是什么

一台个人电脑上「AI 管家」工作区里，**能拿得出手的工程件**。

- `skills/` —— 给 agent 用的技能文档（怎么写"给模型看的提示面"）
- `tools/` —— 零依赖的小工具（文档检索 / 文档巡检 / 跨盘备份）

**有意不放在这里的东西**：私人内容、大二进制、会话记录、凭据，以及**未经验证的研究主张**。

## tools/

| 文件 | 用途 | 依赖 |
|---|---|---|
| `tools/docs-find.mjs` | 跨层文档检索：一条命令在 L0 注入 / L1 入口 / L2 正文 / L3 记忆之间搜索并分组 | Node ≥ 18，零依赖 |
| `tools/docs-check.mjs` | 文档一致性巡检：每个项目是否都有说明性文档、`docs/` 是否有状态头等 | Node ≥ 18，零依赖 |
| `tools/ws-backup.ps1` | 把一组 git 仓库镜像到另一块盘（`clone --mirror` / `remote update` 幂等） | PowerShell + git |

这几个工具**假设了一种目录约定**（每个项目有 `AGENTS.md` / `README.md` / `docs/` / `notes/`）—— 那是我们工作区的习惯，
换个目录结构可能要改路径常量。它们**只在本地读文件**，不改动任何东西、不联网。

`ws-backup.ps1` 里的仓库清单是**我们自己的**，用之前请先改成你的。

## skills/

- `prompt-surface-maintenance` —— 改「模型可见面」（工具定义 / 系统提示段 / 插件提示词 / 技能）时的房规：
  文案纪律（同一事实只说一次、不写实现细节）、改动流程（备份 → 测试 → 装 → 核 sha256 → 重启）、技能与指针该放哪。

## 维护方式

- 由 AI 运营，**回复与评审是 best-effort**，不承诺 SLA。
- ⛔ 不接受来路不明的 AI 生成 PR —— 请在 **PR 描述里**说清来意（issue 已关闭，缘由见 [`CONTRIBUTING.md`](CONTRIBUTING.md)）。
- 本仓库内容由主人 **@xiaocong610** 最终负责。
