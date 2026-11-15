// 依頼の掲示板の問題を選ぶ：tools/generate.mjs の出力から、重なりを除き、テーマが偏らないように選んで
// stages/board.json に書く。並びは難しさの順（やさしめ → 難しい）。
//
//   node tools/board.mjs [問題数=100] gen1.jsonl [gen2.jsonl ...]

import { readFileSync, writeFileSync } from 'node:fs';
import { stageToText, parseStage } from '../src/core/stage.js';
import { checkSolution } from '../src/core/solver.js';
import { rng } from '../src/core/generate.js';

const [countArg, ...files] = process.argv.slice(2);
const count = Number(countArg);

const CLIENTS = ['港の船大工', '山あいの鍛冶屋', '王立図書館の司書', '時計塔の番人', '旅の吟遊詩人', '学院の先輩', '錬金ギルドの受付', 'パン屋のおかみさん', '岬の灯台守', '宝石商', '森の薬師', '城の庭師', '鐘つき堂の主人', '見習い騎士', '天文台の学者', '織物屋', '鉱山の親方', '郵便屋', '劇場の座長', '漁師の親方', '雑貨屋の店主', '橋の番人', '温室の番人', '修道院の写本係', '人形師'];
const ITEMS = ['重し', '台座', '鋳型', '留め金', '箱の底板', '錘', '飾り板', '文鎮', '蓋', '型板', '踏み台', '仕切り板'];

const all = files.flatMap(f => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)));
const seen = new Set();
const pool = [];
for (const c of all) {
  const key = [...c.raw.terrain, '|', ...(c.raw.pieces ?? []), '|', ...[...c.raw.hand].sort(), '|', ...(c.raw.open ?? [])].join('/');
  if (seen.has(key)) continue;
  seen.add(key);
  if (c.pathsNoReaction > 0) continue; // 素材の反応を使わないと解けないものだけ
  pool.push(c);
}
// テーマごとに難しい順に並べ、順番に1つずつ取る（偏らないように）
const byTheme = new Map();
for (const c of pool.sort((a, b) => b.bits - a.bits)) {
  if (!byTheme.has(c.theme)) byTheme.set(c.theme, []);
  byTheme.get(c.theme).push(c);
}
const chosen = [];
while (chosen.length < count && [...byTheme.values()].some(l => l.length)) {
  for (const l of byTheme.values()) if (l.length && chosen.length < count) chosen.push(l.shift());
}
chosen.sort((a, b) => a.bits - b.bits);

const rest = [...byTheme.values()].flat();

const entry = prefix => (c, i) => {
  const r = rng(c.seed);
  const client = CLIENTS[Math.floor(r() * CLIENTS.length)];
  const item = ITEMS[Math.floor(r() * ITEMS.length)];
  const id = `${prefix}-${String(i + 1).padStart(3, '0')}`;
  const raw = { ...c.raw, id, title: `${client}の${item}`, request: `${client}が、${item}を作ってほしいと言っている。` };
  const st = parseStage(stageToText(raw));
  const check = checkSolution(st);
  if (!check.ok || !check.cleared) throw new Error(`${id}：狙いの手順でクリアできない`);
  return { id, theme: c.theme, bits: c.bits, text: stageToText(raw) };
};
const board = chosen.map(entry('req'));
writeFileSync('stages/board.json', JSON.stringify(board, null, 1) + '\n');
// 選ばれなかった残りは「新しい依頼を探す」でランダムに出す
const extra = rest.map(entry('new'));
writeFileSync('stages/board-extra.json', JSON.stringify(extra, null, 1) + '\n');
console.log(`「新しい依頼を探す」用に ${extra.length} 問`);
const themes = {};
for (const b of board) themes[b.theme] = (themes[b.theme] ?? 0) + 1;
console.log(`候補 ${all.length}（重なりと反応なしを除いて ${pool.length}）から ${board.length} 問を選んだ`);
console.log(`難しさ：${board[0]?.bits} 〜 ${board.at(-1)?.bits}`);
console.log(themes);
