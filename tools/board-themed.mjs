// 依頼の掲示板の100問を、テーマから作った問題（tools/themed.mjs の出力）から選ぶ（2026-11-18）。
//
//   node tools/board-themed.mjs themed1.jsonl [themed2.jsonl ...]
//
// テーマごとの数（QUOTA）だけ、目安（迷いの量）の高い順に選ぶ。器と手持ちが同じものは1つにする。
// 並びは「やさしい → 難しい」。目安だけだと遊んだ感じとずれたので、テーマごとに少し足し引きする（BONUS）。
// 選ばれなかった残りは stages/board-extra.json（「新しい依頼を探す」）へ。

import { readFileSync, writeFileSync } from 'node:fs';
import { parseStage, stageToText } from '../src/core/stage.js';
import { checkSolution } from '../src/core/solver.js';
import { rng } from '../src/core/generate.js';

// 人が遊んだ順位（試作19〜34）から：角笛の2テーマがいちばん難しく、鱗×星砂・星砂が中、高い鱗・鱗×ゼリーはやさしめ
const QUOTA = { hornMelt: 25, hornFire: 25, sandMelt: 20, tallIce: 10, iceSlime: 10, sand: 10 };
const BONUS = { hornMelt: 3, hornFire: 3, sandMelt: 2, sand: 1, tallIce: 0, iceSlime: -1 };

const CLIENTS = ['港の船大工', '山あいの鍛冶屋', '王立図書館の司書', '時計塔の番人', '旅の吟遊詩人', '学院の先輩', '錬金ギルドの受付', 'パン屋のおかみさん', '岬の灯台守', '宝石商', '森の薬師', '城の庭師', '鐘つき堂の主人', '見習い騎士', '天文台の学者', '織物屋', '鉱山の親方', '郵便屋', '劇場の座長', '漁師の親方', '雑貨屋の店主', '橋の番人', '温室の番人', '修道院の写本係', '人形師'];
const ITEMS = ['重し', '台座', '鋳型', '留め金', '箱の底板', '錘', '飾り板', '文鎮', '蓋', '型板', '踏み台', '仕切り板'];

const all = process.argv.slice(2).flatMap(f => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)));
const seen = new Set();
const byTheme = new Map();
for (const c of all.sort((a, b) => b.bits - a.bits)) {
  const key = [...c.raw.terrain, '|', ...(c.raw.pieces ?? []), '|', ...[...c.raw.hand].sort(), '|', ...(c.raw.open ?? [])].join('/');
  if (seen.has(key)) continue;
  seen.add(key);
  if (!byTheme.has(c.theme)) byTheme.set(c.theme, []);
  byTheme.get(c.theme).push(c);
}
const chosen = [];
for (const [theme, n] of Object.entries(QUOTA)) chosen.push(...(byTheme.get(theme) ?? []).splice(0, n));
// 足りないときは、角笛の問題から足す
for (const theme of ['hornMelt', 'hornFire', 'sandMelt']) {
  while (chosen.length < 100 && byTheme.get(theme)?.length) chosen.push(byTheme.get(theme).shift());
}
// 並び：テーマの中では目安の低い順に、テーマどうしは混ぜる（同じテーマが続かないように）。
// テーマの中の順位（0〜1）に、テーマの難しさ（BONUS）を少し足した値で並べる
const rankOf = new Map();
for (const theme of Object.keys(QUOTA)) {
  const l = chosen.filter(c => c.theme === theme).sort((a, b) => a.bits - b.bits);
  l.forEach((c, i) => rankOf.set(c, (i + 0.5) / l.length + (BONUS[theme] ?? 0) * 0.04));
}
chosen.sort((a, b) => rankOf.get(a) - rankOf.get(b));
// 予備も、量産するテーマだけにする（「溶けて落ちる」単独などは入れない）
const rest = [...byTheme.entries()].filter(([theme]) => theme in QUOTA).flatMap(([, l]) => l);

const entry = prefix => (c, i) => {
  const r = rng(c.seed);
  const client = CLIENTS[Math.floor(r() * CLIENTS.length)];
  const item = ITEMS[Math.floor(r() * ITEMS.length)];
  const id = `${prefix}-${String(i + 1).padStart(3, '0')}`;
  const raw = { ...c.raw, id, title: `${client}の${item}`, request: `${client}が、${item}を作ってほしいと言っている。` };
  const st = parseStage(stageToText(raw));
  const check = checkSolution(st);
  if (!check.ok || !check.cleared) throw new Error(`${id}：狙いの手順でクリアできない`);
  return { id, theme: c.theme, bits: c.bits, finalStates: c.finalStates, text: stageToText(raw) };
};
// id は前の100問と重ならないように変える（前の作り方の問題を解いた記録と混ざらないように）
const board = chosen.map(entry('job'));
writeFileSync('stages/board.json', JSON.stringify(board, null, 1) + '\n');
const extra = rest.map(entry('more'));
writeFileSync('stages/board-extra.json', JSON.stringify(extra, null, 1) + '\n');
const count = {};
for (const b of board) count[b.theme] = (count[b.theme] ?? 0) + 1;
console.log(`候補 ${all.length}（重なりを除いて ${seen.size}）から ${board.length} 問。予備 ${extra.length} 問`);
console.log(count);
console.log(`目安：${Math.min(...board.map(b => b.bits))} 〜 ${Math.max(...board.map(b => b.bits))}`);
