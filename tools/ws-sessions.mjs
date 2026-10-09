// ws-sessions.mjs — dsh 会话概览（来自运行中的 dsh web host /api，浏览器 GUI 同源）
// 用法：node tools/ws-sessions.mjs          表格：时间/是否运行/轮数/标题/工作区
//       node tools/ws-sessions.mjs --json   完整 JSON（含 sessionId、统计、token 等）
import { call } from '../pet-bridge/web-host.mjs'

const json = process.argv.includes('--json')
const list = await call('session.list', {})
const items = (list?.items ?? []).map((s) => ({
  id: s.sessionId,
  cwd: s.cwd,
  at: new Date(s.updatedAt).toISOString(),
  running: s.running,
  blank: s.blank,
  title: s.projections?.values?.title ?? '(无标题)',
  turns: s.projections?.values?.sessionStats?.turns ?? 0,
  tokenUsage: s.projections?.values?.tokenUsage ?? null,
})).sort((a, b) => b.at.localeCompare(a.at))

if (json) {
  console.log(JSON.stringify({ count: items.length, items }, null, 2))
} else {
  for (const s of items) {
    console.log([s.at.slice(0, 16).replace('T', ' '), s.running ? 'RUN' : '   ', String(s.turns).padStart(3), s.id.slice(0, 8), s.title].join(' | '))
  }
  console.log(`count=${items.length}`)
  const cwds = {}
  for (const s of items) cwds[s.cwd] = (cwds[s.cwd] ?? 0) + 1
  for (const [k, v] of Object.entries(cwds)) console.log(`${v}\t${k}`)
}
