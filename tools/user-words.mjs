// user-words.mjs —— 把某个会话里**主人说过的话**按顺序抽出来（只读）
//
// 为什么要它：交接条要"以主人的原话为准"，而主人的话散在会话日志的 user/message 与
// agent/inbox/spliced（用户输入进收件箱）两类事件里 —— 逐条抽出来才看得全。
//
// 用法： node tools\user-words.mjs <session.v4.jsonl.zstd> [--max 400] [--full]
import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';

const file = process.argv[2];
if (!file) { console.error('用法: node user-words.mjs <session.v4.jsonl.zstd> [--max 400] [--full]'); process.exit(2); }
const max = Number((process.argv.find((a) => a.startsWith('--max')) || '--max=400').split('=')[1]) || 400;
const full = process.argv.includes('--full');

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const raw = readFileSync(file);
const pos = [];
for (let i = 0; i + 3 < raw.length; i++) {
  if (raw[i] === MAGIC[0] && raw[i + 1] === MAGIC[1] && raw[i + 2] === MAGIC[2] && raw[i + 3] === MAGIC[3]) pos.push(i);
}
const dec = new TextDecoder();
const lines = [];
for (let i = 0; i < pos.length; i++) {
  const a = pos[i], b = i + 1 < pos.length ? pos[i + 1] : raw.length;
  try { for (const l of dec.decode(zstdDecompressSync(raw.subarray(a, b))).split('\n')) if (l.trim()) lines.push(l); } catch { /* torn */ }
}
const objs = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } });

/** 把一条消息的 content 拍成纯文本 */
const textOf = (m) => {
  const c = m && m.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c.map((x) => (x && x.type === 'text' ? x.text : (x && x.type === 'image' ? '[图片]' : ''))).join('\n');
};

let n = 0;
const seen = new Set();
for (let i = 0; i < objs.length && n < max; i++) {
  const o = objs[i];
  if (!o) continue;
  let msg = null;
  if (o.type === 'user/message' && o.data && o.data.message) msg = o.data.message;
  else if (o.type === 'agent/inbox/spliced' && o.data && Array.isArray(o.data.inserted)) {
    //: 只认真正来自主人的（source.kind === 'user'），system-reminder / goal_round 之类不算
    const u = o.data.inserted.find((x) => x && x.source && x.source.kind === 'user');
    if (u) msg = u;
  }
  if (!msg || msg.role !== 'user') continue;
  const t = textOf(msg).trim();
  if (!t) continue;
  const key = t.slice(0, 60) + '|' + t.length;
  if (seen.has(key)) continue;
  seen.add(key);
  n++;
  const when = new Date(o.time).toLocaleString('zh-CN');
  const body = full ? t : (t.length > 300 ? t.slice(0, 300) + ' …（+' + (t.length - 300) + ' 字）' : t);
  console.log('【' + n + '】' + when + '  [' + o.type + ']');
  console.log(body.replace(/\n/g, '\n    '));
  console.log('');
}
console.log('—— 共 ' + n + ' 条主人发言（去重后）');
