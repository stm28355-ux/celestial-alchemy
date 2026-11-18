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
// 2026-11-18 人の指示：角笛と鱗・角笛と火種は同じ話になりすぎるので5問ずつ、鱗×星砂はやさしすぎるものを外して10問（計50問。残り50問は新しいテーマで足す）
const QUOTA = { hornMelt: 5, hornFire: 5, sandMelt: 10, tallIce: 10, iceSlime: 10, sand: 10 };
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
// テーマの中で、器の形と特殊な素材（鉛以外）が同じものは1つだけ（6と94がほぼ同じだった）。
// 角笛の2テーマは、まず器の形が違うものから選び、足りなければ素材の違うものから（ほかのテーマは目安の高い順のまま）
const DISTINCT_SHAPE = new Set(['hornMelt', 'hornFire']);
const specials = c => [...c.raw.hand].map(h => h.split(' ')[0]).filter(m => m !== 'lead').sort().join(',');
const shapeKey = c => [...c.raw.terrain, '|', ...(c.raw.pieces ?? []), '|', ...(c.raw.open ?? [])].join('/');
const chosen = [];
for (const [theme, n] of Object.entries(QUOTA)) {
  const l = byTheme.get(theme) ?? [];
  const pick = [];
  const shapes = new Set();
  const looks = new Set();
  for (const pass of [0, 1]) {
    for (const c of l) {
      if (pick.length >= n || pick.includes(c)) continue;
      const look = shapeKey(c) + '|' + specials(c);
      if (looks.has(look) || (pass === 0 && DISTINCT_SHAPE.has(theme) && shapes.has(shapeKey(c)))) continue;
      pick.push(c);
      shapes.add(shapeKey(c));
      looks.add(look);
    }
  }
  chosen.push(...pick);
  byTheme.set(theme, l.filter(c => !pick.includes(c)));
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

// id と名前は、前の掲示板・予備にあった問題ならそのまま使う（解いた記録が別の問題に付かないように）。
// 新しい問題には、まだ使っていない番号を付ける
const keyOf = raw => [...raw.terrain, '|', ...(raw.pieces ?? []), '|', ...[...raw.hand].sort(), '|', ...(raw.open ?? [])].join('/');
const before = new Map();
const used = { job: 0, more: 0 };
for (const f of ['stages/board.json', 'stages/board-extra.json']) {
  let list = [];
  try {
    list = JSON.parse(readFileSync(f, 'utf8'));
  } catch {}
  for (const b of list) {
    const raw = parseStage(b.text).raw;
    before.set(keyOf(raw), { id: b.id, title: raw.title, request: raw.request });
    const [p, n] = b.id.split('-');
    if (p in used) used[p] = Math.max(used[p], Number(n));
  }
}
const entry = prefix => c => {
  const r = rng(c.seed);
  const client = CLIENTS[Math.floor(r() * CLIENTS.length)];
  const item = ITEMS[Math.floor(r() * ITEMS.length)];
  const old = before.get(keyOf(c.raw));
  const id = old?.id ?? `${prefix}-${String(++used[prefix]).padStart(3, '0')}`;
  const raw = old ? { ...c.raw, id, title: old.title, request: old.request } : { ...c.raw, id, title: `${client}の${item}`, request: `${client}が、${item}を作ってほしいと言っている。` };
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
