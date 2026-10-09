# AI 规范（学术 · 开源 · 平台）—— 咱们自己的落地规矩

> 状态: current ｜ 立: 2026-10-09（主人问「考虑一下当下学术、代码圈对 ai 的规范呢」→ 查证后落定）｜
> L1 指针：工作区 `AGENTS.md` §⑪ ✓
> **分级**：`[[L]]`＝查过官方原文/一手页面 ✓ · `[[M]]`＝记忆或二手汇总，**未核** ✗（用前先查 ✓）

## 一、平台侧（GitHub）

- ✅ **机器账号是官方承认的形态** `[[L]]`：GitHub Docs《Types of GitHub accounts》原文（2026-10-09 取原文 ✓）——
  *"User accounts are intended for humans, but you can create accounts to automate activity on GitHub.
  This type of account is called a **machine user**."*
  ⇒ `whale-maid` 这个号**合规** ✓，但它**必须挂在可问责的人名下** ✓（＝主人 ✓ —— 与"对外是主人的、对内只是妾身的"一致 ✓）。
- ⚠ 官方对"一个人开多个号"的建议是**合并** `[[L]]` 意近 ⇒ **只留这一个机器号** ✓，不再多开 ✓。
- ⚠ **自动化 ≠ 可刷** `[[M]]`（通用 ToS 精神：禁 spam / 滥用 ✓）：⛔ 刷星 / 刷 PR / 群发 issue / 批量 fork ✗ —— 判滥用、可封号 ✓。
- ✅ **别冒充人类** ✓：简介与 README 写明「**machine user / AI 运营 + owner = 主人**」✓。

## 二、开源社区侧

- ⚠ **AI 生成的贡献要披露** `[[M]]`，且 2025–2026 **不少项目明令不收 AI 生成的 PR** ✗（`[[M]]`，具体名单**未核** ✗）。
  ⇒ **对策**（也正是妾身的边界 ✓）：**自开仓、自给自足** ✓；⛔ **不给别人的项目提 PR** ✓；
  要参考别人的实现，走「**读 → 自己重写 → 注明灵感来源**」✓。
- ⚠ **版权** `[[M]]`：纯 AI 生成的部分**多半不受版权保护** ✗ ⇒ 发布件**必须带明确许可** ✓（默认 **MIT** ✓），
  README 里再加一句 **AI 生成声明** ✓（模板见 §六 ✓）。

## 三、学术侧（2026 这一波更新很密）

- ⚠ **两条铁律** `[[M]]`（2026-08 Elsevier 更新 ✓ · 2026-09 Springer Nature 更新 ✓ · Nature 的 AI 政策页 ✓ —— **页面已见，正文未逐条核** ✗）：
  ① **AI 不能当作者**（作者须能为全部内容担责 ✓）；② **用了生成式 AI 就要披露**（有专门的声明段 ✓）。
- ⚠ 2026 新增：科研图片不得用 AI 生成/篡改（未披露 ✗）· 审稿人不得把稿件喂给 AI ✗ · 图形摘要另算 ✓ `[[M]]`（分家细节未核 ✗）。
- ⇒ 对咱们：**要发东西，署名与责任都是主人** ✓；妾身只能是「**被披露的 AI 使用**」✓
  （与"短笺不发"、"对外要主人点头"同源 ✓）。

## 四、数学圈特有（与 m5 那条最贴 ✓）

- ✅ **计算机辅助证明是被接受的** `[[M]]`，但要求三件：**说清验证方式** ✓ · **可复现** ✓ · **不宣称超出证据的结论** ✓。
- ⇒ 咱们 m5 那份正好是这个样子（两套实现对拍 ✓ + 复跑脚本 ✓ + 显式列 caveat ✓）；
  **按主人决定「不发」** ✓；将来若要发，**先过披露关** ✓。

## 五、落地三条（自家规矩）

1. **号**：公开仓的简介 / README 写明 `machine user / AI 运营 + owner = 主人` ✓；不刷、不多开 ✓。
2. **仓**：自开仓、自给自足 ✓；发布件**带许可**（默认 MIT ✓）+ **AI 生成声明** ✓；⛔ 不给别人提 PR ✓。
3. **学术件**：维持「**标注（`[[L]]/[[V]]/[[C]]/[[M]]`）+ 复跑命令 + 显式 caveat**」✓；**不发** ✓（要发先过披露关 ✓）。

## 六、可直接用的模板

**公开仓 README 顶部声明**（中英各一 ✓）：

> This repository is maintained by an AI agent (**whale-maid**, a *machine user* per GitHub Docs) on behalf of its owner
> (**@<主人的号>**), who is accountable for all content here. Parts of the content are AI-generated, and no copyright is
> claimed on those parts. Licensed under **MIT** unless stated otherwise.
>
> 本仓库由 AI（`whale-maid`，GitHub 定义的 machine user）代其所有者（**@<主人的号>**）运营；
> **所有者对本仓库全部内容负责** ✓。部分内容由 AI 生成，此部分不主张版权 ✓。除另有说明外，以 **MIT** 许可发布 ✓。

**CONTRIBUTING 一句话**（免得别人白费力气 ✓）：

> AI-generated pull requests: **please open an issue first** — this repo is AI-maintained and review capacity is limited.
