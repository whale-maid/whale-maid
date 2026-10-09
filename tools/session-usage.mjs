// session-usage.mjs —— 会话日志的**用量与缓存**体检（只读）
//
// 背景（交接条第五节）：主人问「上下文都压缩了，缓存不该重置吗？」——高命中率与"刚压缩过"看着矛盾。
// 本脚本把 dsh 会话日志（zstd 多帧 JSONL）解开，抽出**每一步的 usage**（camelCase：
// inputTokens / outputTokens / cacheReadTokens / cacheWriteTokens），并把**改写历史的事件**
// （agent/inbox/spliced = 摘要/压缩落地、request/header = 请求头重发）按序插在中间 ——
// 于是"压缩那一步前后 miss 有没有骤增"能一眼看出来（累计命中率会把那一步摊薄 ✗）。
//
// 用法：
//   node tools\session-usage.mjs <session.v4.jsonl.zstd>              时间线（usage + 历史改写事件）
//   node tools\session-usage.mjs <file> --types                       事件类型计数
//   node tools\session-usage.mjs <file> --type <事件类型> [条数]       看某类事件长什么样
//   node tools\session-usage.mjs <file> --around <行号> [半径]         看某一行附近
//   node tools\session-usage.mjs <file> --turn <轮号>                 只看某一轮
import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';

const file = process.argv[2];
if (!file) { console.error('用法: node session-usage.mjs <session.v4.jsonl.zstd> [--types|--type X|--around N|--turn N]'); process.exit(2); }

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const raw = readFileSync(file);
const positions = [];
for (let i = 0; i + 3 < raw.length; i++) {
  if (raw[i] === MAGIC[0] && raw[i + 1] === MAGIC[1] && raw[i + 2] === MAGIC[2] && raw[i + 3] === MAGIC[3]) positions.push(i);
}
const decoder = new TextDecoder();
const lines = [];
for (let i = 0; i < positions.length; i++) {
  const start = positions[i];
  const end = i + 1 < positions.length ? positions[i + 1] : raw.length;
  try {
    for (const l of decoder.decode(zstdDecompressSync(raw.subarray(start, end))).split('\n')) if (l.trim()) lines.push(l);
  } catch { /* torn frame */ }
}
const objs = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } });
const typeOf = (o) => String(o.type || '?') + (o.subtype ? '/' + o.subtype : '');

const args = process.argv.slice(3);
const mi = args.indexOf('--around');
const mt = args.indexOf('--type');
const mtu = args.indexOf('--turn');

if (args.includes('--types')) {
  const types = new Map();
  for (const o of objs) if (o) types.set(typeOf(o), (types.get(typeOf(o)) || 0) + 1);
  console.log('【事件类型】共 ' + objs.length + ' 行');
  for (const [k, v] of [...types.entries()].sort((a, b) => b[1] - a[1])) console.log('  ' + String(v).padStart(6) + '  ' + k);
  process.exit(0);
}
if (mt >= 0) {
  const want = args[mt + 1];
  const n = Number(args[mt + 2] || 2);
  let shown = 0;
  for (let i = 0; i < objs.length && shown < n; i++) {
    const o = objs[i];
    if (!o || (typeOf(o) !== want && String(o.type) !== want)) continue;
    shown++;
    const s = JSON.stringify(o);
    console.log('[' + i + '] ' + typeOf(o) + '  (' + s.length + ' B)');
    console.log(s.length > 2500 ? s.slice(0, 2500) + '…' : s);
    console.log('');
  }
  process.exit(0);
}
if (mi >= 0) {
  const no = Number(args[mi + 1]); const r = Number(args[mi + 2] || 6);
  for (let i = Math.max(0, no - r); i <= Math.min(objs.length - 1, no + r); i++) {
    const o = objs[i];
    if (!o) { console.log('  [' + i + '] <解析失败>'); continue; }
    const s = JSON.stringify(o);
    console.log('  [' + i + '] type=' + typeOf(o) + '  ' + (s.length > 240 ? s.slice(0, 240) + '…' : s));
  }
  process.exit(0);
}

//: ── 时间线：usage（每一步）＋ 历史改写事件 ─────────────────────────────────
const row = [];
for (let i = 0; i < objs.length; i++) {
  const o = objs[i];
  if (!o) continue;
  const t = typeOf(o);
  const u = o.data && o.data.usage;
  if (u && typeof u.inputTokens === 'number') {
    row.push({ i, t, turn: o.data.turn, step: o.data.step, miss: u.inputTokens, hit: u.cacheReadTokens || 0,
      write: u.cacheWriteTokens || 0, out: u.outputTokens || 0, total: u.totalTokens || 0 });
  } else if (/spliced|compact|summar|truncat/i.test(t)) {
    row.push({ i, t, mark: true, size: JSON.stringify(o.data || {}).length, note: brief(o) });
  } else if (t === 'request/header') {
    const h = (o.data && o.data.header) || {};
    const msgs = (h.messages || []).length;
    row.push({ i, t, mark: true, note: 'provider=' + h.config?.provider + '/' + h.config?.model
      + ' · tools=' + ((h.tools || []).length) + ' · messages=' + msgs + ' · 头 ' + JSON.stringify(o).length + 'B' });
  }
}
const onlyTurn = mtu >= 0 ? Number(args[mtu + 1]) : null;

//: --headers：把每次 request/header 的**工具表指纹 / 配置**列出来，并跟上一次比差异 ——
//:   用来定位"整场未命中"到底是**工具表变了**（head 替换）还是别的原因 ✓
if (args.includes('--headers')) {
  const hs = [];
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    if (!o || typeOf(o) !== 'request/header') continue;
    const h = (o.data && o.data.header) || {};
    const tools = (h.tools || []).map((t) => t.name);
    hs.push({ i, time: o.time, tools, cfg: h.config || {}, sysLen: JSON.stringify(h.system || h.systemPrompt || '').length,
      names: (h.messages || []).length, bytes: JSON.stringify(o).length });
  }
  console.log('共 ' + hs.length + ' 次 request/header');
  let prevSet = null;
  for (const x of hs) {
    const set = new Set(x.tools);
    let diff = '（首个）';
    if (prevSet) {
      const add = [...set].filter((t) => !prevSet.has(t));
      const del = [...prevSet].filter((t) => !set.has(t));
      diff = (add.length || del.length) ? ('＋' + add.length + ' [' + add.slice(0, 6).join(',') + '] −' + del.length + ' [' + del.slice(0, 6).join(',') + ']') : '同工具表';
    }
    prevSet = set;
    console.log('  [' + String(x.i).padStart(4) + '] ' + new Date(x.time).toLocaleString('zh-CN')
      + ' · tools=' + x.tools.length + ' · cfg=' + JSON.stringify(x.cfg) + ' · 头 ' + Math.round(x.bytes / 1024) + 'KB · ' + diff);
  }
  process.exit(0);
}

//:   ① 这一步的 prompt（hit+miss）比上一步**缩了还是涨了**（缩 ⇒ 历史被压缩/重写；涨 ⇒ 前缀被换掉或缓存过期）
//:   ② 与上一步的**时间间隔**（隔久了 ⇒ 多半是缓存 TTL 到期）
//:   ③ 两步之间发生了哪些事件（谁改写了前缀）
if (args.includes('--anomalies')) {
  const us = row.filter((r) => !r.mark);
  console.log(' 步        | 未命中  | 命中   | prompt  | 与上一步 prompt | 间隔      | 中间事件');
  for (let k = 0; k < us.length; k++) {
    const r = us[k];
    const prompt = r.hit + r.miss;
    const rate = prompt ? r.hit / prompt : 1;
    if (r.miss < 50000 && rate > 0.5) continue;
    const p = us[k - 1];
    const pPrompt = p ? p.hit + p.miss : null;
    const delta = pPrompt ? prompt - pPrompt : 0;
    const t1 = objs[r.i]?.time, t0 = p ? objs[p.i]?.time : null;
    const gap = (t1 && t0) ? Math.round((t1 - t0) / 1000) + 's' : '—';
    const between = [];
    if (p) for (let i = p.i + 1; i < r.i; i++) { const o = objs[i]; if (o) between.push(typeOf(o)); }
    console.log(' t' + r.turn + 's' + String(r.step).padStart(3) + '   | ' + String(Math.round(r.miss / 1000) + 'k').padStart(7)
      + ' | ' + String(Math.round(r.hit / 1000) + 'k').padStart(6)
      + ' | ' + String(Math.round(prompt / 1000) + 'k').padStart(7)
      + ' | ' + (delta >= 0 ? '涨 ' : '缩 ') + Math.abs(Math.round(delta / 1000)) + 'k'
      + ' | ' + gap.padStart(9) + ' | ' + between.join(' '));
  }
  process.exit(0);
}

//: --turns：按轮汇总（找"面板上那一轮"用）
if (args.includes('--turns')) {
  const agg = new Map();
  for (const r of row) {
    if (r.mark) continue;
    const a = agg.get(r.turn) || { turn: r.turn, steps: 0, hit: 0, miss: 0, out: 0, worst: 100 };
    a.steps++; a.hit += r.hit; a.miss += r.miss; a.out += r.out;
    a.worst = Math.min(a.worst, (r.hit + r.miss) ? r.hit / (r.hit + r.miss) * 100 : 100);
    agg.set(r.turn, a);
  }
  console.log('  轮 | 步 | 命中      | 未命中    | 输出   | 该轮命中率 | 该轮最差一步');
  for (const a of [...agg.values()].sort((x, y) => x.turn - y.turn)) {
    const rate = (a.hit + a.miss) ? (a.hit / (a.hit + a.miss) * 100).toFixed(1) + '%' : '—';
    const mark = (a.hit + a.miss) > 1000000 && a.miss > 100000 ? '  ⬅ 大未命中轮' : '';
    console.log('  ' + String(a.turn).padStart(3) + ' | ' + String(a.steps).padStart(3) + ' | '
      + String(Math.round(a.hit / 1000) + 'k').padStart(9) + ' | ' + String(Math.round(a.miss / 1000) + 'k').padStart(9) + ' | '
      + String(a.out).padStart(6) + ' | ' + rate.padStart(9) + ' | ' + a.worst.toFixed(1) + '%' + mark);
  }
  process.exit(0);
}

console.log('【会话用量体检】' + file);
console.log('  行数 ' + objs.length + ' · 带 usage 的步 ' + row.filter((r) => !r.mark).length);

let cumHit = 0, cumMiss = 0, prevMiss = null, prevTurn = null;
for (const r of row) {
  if (r.mark) { console.log('   ⚑ [' + r.i + '] ' + r.t + '  ' + r.note); continue; }
  if (onlyTurn != null && r.turn !== onlyTurn) { cumHit += r.hit; cumMiss += r.miss; prevMiss = r.miss; prevTurn = r.turn; continue; }
  if (r.turn !== prevTurn) { console.log('   ── 轮 ' + r.turn + ' ──'); prevTurn = r.turn; }
  cumHit += r.hit; cumMiss += r.miss;
  const rate = (r.hit + r.miss) ? (r.hit / (r.hit + r.miss) * 100).toFixed(1) + '%' : '—';
  const jump = prevMiss != null ? r.miss - prevMiss : 0;
  const flag = jump > 8000 ? '  ⬅ 未命中骤增 +' + Math.round(jump / 1000) + 'k' : (jump < -8000 ? '  ⬇ 未命中骤降' : '');
  console.log('   [' + String(r.i).padStart(4) + '] t' + r.turn + 's' + String(r.step).padStart(3)
    + '  未命中 ' + String(Math.round(r.miss / 1000) + 'k').padStart(6)
    + ' · 命中 ' + String(Math.round(r.hit / 1000) + 'k').padStart(6)
    + ' · 写 ' + String(r.write).padStart(6) + ' · 出 ' + String(r.out).padStart(5)
    + ' · 命中率 ' + rate.padStart(6) + flag);
  prevMiss = r.miss;
}
console.log('  ── 合计：命中 ' + Math.round(cumHit / 1000) + 'k · 未命中 ' + Math.round(cumMiss / 1000) + 'k ⇒ 命中率 '
  + (cumHit + cumMiss ? (cumHit / (cumHit + cumMiss) * 100).toFixed(1) : '—') + '%');

function brief(o) {
  const s = JSON.stringify(o.data || {});
  return s.length > 200 ? s.slice(0, 200) + '…' : s;
}

