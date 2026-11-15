// ステージ探しの道具：器の形と「狙い」を決めて、手持ちの鉛の組み合わせを全部ためし、条件に合うものを選ぶ。
//
//   node tools/find.mjs spec.json [上位いくつ出すか]
//
// spec（JSON）：
//   terrain    ["+++", "+++"]           器（terrains に複数並べてもよい）
//   pieces, legend                       最初から置く素材（任意）
//   must       ["ice ##", "fire #"]      必ず入れる手持ち
//   pool       ["##", "###", ...]        足してよい鉛の形（省略すると1〜4マスの形と、5マスの器の形）
//   k          [2, 4]                    足す鉛の数
//   cells      [a, b]                    手持ちのマス数（鱗はのぞく）の範囲。省略すると「刻印の数ちょうど」
//   require：
//     maxFinal  クリア盤面の種類の上限（1 なら答えが1つ）
//     maxPaths  道筋の数の上限
//     needReact true なら「反応を使わないと解けない」
//     feature   "chain" | "fallAfterReact" | "frameMelt" … その気付きを使わない道筋が0
//     keepIce   true なら、どのクリア盤面にも鱗が残る
//     alsoFeatures ["burn"] など。feature のほかに、これらの気付きもすべての答えで使う
//     keep      ["water"] など。どのクリア盤面にも、その素材が残っている
//     noneLeft  ["water"] など。どのクリア盤面にも、その素材が残っていない
//     overhang  true なら、どのクリア盤面でも刻印のないマスにピースがある（はみ出し）
//     bridge    true なら、どのクリア盤面でも「上にピースがある、空いた空きマス」がある（橋）
//     firstMat  最初の1手の素材（例 "fire"）。答えがすべてそれで始まる
//     notFirstMat その素材から始める答えがない（例 "fire"：火種を最初に置くと解けない）
//     lastShape 最後に置くピースの形（例 "#.#/###"）。答えがすべてそれで終わる
//     lastR     そのときの向き
//     minTrap   落とせる最初の1手のうち、行き止まりの割合の下限（0〜1。大きいほど引っかけが多い）
//     swapUnsolvable [["ice", "lead"]] など。手持ちの素材を入れ替えると解けなくなる
//     caught    true なら、どのクリア盤面にも「下に何もなく、ゼリーで宙に止まっている」ピースがある
//     slimeMatters true なら、ゼリーを鉛に替えると解けなくなること（くっつくことが答えに要る）

import { readFile } from 'node:fs/promises';
import { parseStage } from '../src/core/stage.js';
import { createState, drop, occupancy, initialProblems } from '../src/core/rules.js';
import { solve, boardText, FEATURES } from '../src/core/solver.js';
import { parseShape, canonicalKey, rotate, shapeText } from '../src/core/shape.js';

const DEFAULT_POOL = ['#', '##', '###', '##/#.', '####', '##/##', '#./#./##', '.#/.#/##', '###/.#.', '##./.##', '.##/##.', '#.#/###'];

const [specPath, topArg = '5'] = process.argv.slice(2);
const spec = JSON.parse(await readFile(specPath, 'utf8'));
const req = spec.require ?? {};
const pool = spec.pool ?? DEFAULT_POOL;
const terrains = spec.terrains ?? [spec.terrain];
const feature = req.feature ? FEATURES[req.feature] : null;
const cellsOf = s => parseShape(s).length;

const results = [];
let tried = 0;
for (const terrain of terrains) {
  const head = ['format: 1', 'terrain:', ...terrain.map(r => `  ${r}`)];
  if (spec.pieces) head.push('pieces:', ...spec.pieces.map(r => `  ${r}`), 'legend:', ...Object.entries(spec.legend).map(([k, v]) => `  ${k}: ${v}`));
  const base = parseStage(head.join('\n'));
  const problems = initialProblems(base);
  if (problems.length) {
    console.log(`器 ${terrain.join(' / ')} は最初の盤面に問題があるので飛ばす：${problems.join('、')}`);
    continue;
  }
  const targets = terrain.join('').split('').filter(c => '+GL'.includes(c)).length;
  const preFilled = base.pieces.filter(p => p.mat !== 'ice').flatMap(p => p.cells).filter(([x, y]) => '+GL'.includes(terrain[y][x])).length;
  const mustCells = spec.must.reduce((n, m) => {
    const [mat, sh] = m.split(/\s+/);
    return n + (mat === 'ice' ? 0 : cellsOf(sh));
  }, 0);
  const [lo, hi] = spec.cells ?? [targets - preFilled, targets - preFilled];
  const [k0, k1] = spec.k ?? [1, 4];

  // 鉛の組み合わせ（同じ形を何度使ってもよい）
  const combos = [];
  const rec = (start, sum, acc) => {
    if (acc.length >= k0 && sum + mustCells >= lo && sum + mustCells <= hi) combos.push([...acc]);
    if (acc.length >= k1 || sum + mustCells >= hi) return;
    for (let i = start; i < pool.length; i++) {
      acc.push(pool[i]);
      rec(i, sum + cellsOf(pool[i]), acc);
      acc.pop();
    }
  };
  rec(0, 0, []);

  for (const leads of combos) {
    tried++;
    const hand = [...spec.must, ...leads.map(l => `lead ${l}`)];
    const st = parseStage([...head, 'hand:', ...hand.map(h => `  ${h}`)].join('\n'));
    const r = solve(st, { maxNodes: spec.maxNodes ?? 300000, feature, examples: Math.min(40, req.maxFinal ?? 40) });
    if (r.truncated || !r.solvable) continue;
    if (req.maxFinal && r.finalStates > req.maxFinal) continue;
    if (req.maxPaths && r.paths > req.maxPaths) continue;
    if (req.needReact && r.pathsNoReaction > 0) continue;
    if (feature && r.pathsWithoutFeature > 0) continue;
    if (req.alsoFeatures && req.alsoFeatures.some(name => solve(st, { maxNodes: spec.maxNodes ?? 300000, feature: FEATURES[name] }).pathsWithoutFeature > 0)) continue;
    const finals = r.examples.map(e => e.state);
    if (req.keepIce && !finals.every(s => s.pieces.some(p => p.mat === 'ice'))) continue;
    if (req.keep && !finals.every(s => req.keep.every(m => s.pieces.some(p => p.mat === m)))) continue;
    if (req.noneLeft && !finals.every(s => !s.pieces.some(p => req.noneLeft.includes(p.mat)))) continue;
    if (req.overhang && !finals.every(s => overhangs(s))) continue;
    if (req.bridge && !finals.every(s => bridges(s))) continue;
    // 道筋の最初と最後（例は盤面ごとに1つなので、道筋全部ではないが目安にする）
    if (req.firstMat && !r.firstMoves.every(m => m.mat === req.firstMat)) continue;
    if (req.notFirstMat && r.firstMoves.some(m => m.mat === req.notFirstMat)) continue;
    if (req.lastShape) {
      const want = canonicalKey(parseShape(req.lastShape));
      const ok = r.examples.every(e => {
        const last = e.moves.at(-1);
        const item = st.hand[last.orig];
        return canonicalKey(item.cells) === want && (req.lastR === undefined || shapeText(rotate(item.cells, last.r)) === shapeText(rotate(parseShape(req.lastShape), req.lastR)));
      });
      if (!ok) continue;
    }
    // 素材を入れ替えると解けなくなること（その素材の性質が答えに要る）。例 [["ice", "lead"]]
    if (req.swapUnsolvable && req.swapUnsolvable.some(([from, to]) => {
      const alt = parseStage([...head, 'hand:', ...hand.map(h => `  ${h}`)].join('\n').replace(new RegExp(`\\b${from}\\b`, 'g'), to));
      return solve(alt, { maxNodes: spec.maxNodes ?? 300000 }).solvable;
    })) continue;
    // ゼリーで宙に止まっているピース（下に何もない、ゼリー以外のピース）が、どのクリア盤面にもある
    if (req.caught && !finals.every(s => caughtPiece(s))) continue;
    // ゼリーが要るか：ゼリーを鉛に替えると解けなくなること
    if (req.slimeMatters) {
      const alt = parseStage([...head, 'hand:', ...hand.map(h => `  ${h}`)].join('\n').replace(/\bslime\b/g, 'lead'));
      if (solve(alt, { maxNodes: spec.maxNodes ?? 300000 }).solvable) continue;
    }
    const s0 = createState(st);
    let legal = 0;
    for (let i = 0; i < s0.hand.length; i++) for (let rr = 0; rr < 4; rr++) for (let x = 0; x < st.W; x++) if (drop(s0, i, rr, x).ok) legal++;
    const trap = legal ? 1 - r.firstMoves.length / legal : 0;
    if (req.minTrap && trap < req.minTrap) continue;
    results.push({ terrain, hand, st, r, trap, legal });
  }
}

results.sort((a, b) => a.r.finalStates - b.r.finalStates || b.trap - a.trap || a.r.paths - b.r.paths || a.hand.length - b.hand.length);
console.log(`ためした組み合わせ ${tried}、条件に合う ${results.length}`);
for (const f of results.slice(0, Number(topArg))) {
  console.log(`\n--- 器 ${f.terrain.join(' / ')}`);
  console.log(`手持ち：${f.hand.join(', ')}`);
  console.log(`盤面 ${f.r.finalStates}、道筋 ${f.r.paths}、反応なし ${f.r.pathsNoReaction}、最初の1手 ${f.r.firstMoves.length}/${f.legal}（引っかけ ${Math.round(f.trap * 100)}%）`);
  const ex = f.r.examples[0];
  console.log(`答え：${ex.moves.map(m => `${m.orig + 1} r${m.r} x${m.x}${m.reacted ? `（反応${m.reacted}）` : ''}`).join(' → ')}`);
  console.log(`      ${boardText(ex.state).join(' / ')}`);
  console.log('solution:');
  for (const m of ex.moves) console.log(`  ${m.orig + 1} r${m.r} x${m.x}`);
}

function caughtPiece(s) {
  const occ = occupancy(s);
  return s.pieces.some(p => p.mat !== 'slime' && !p.fixed && p.cells.every(([x, y]) => {
    if (y + 1 >= s.H || s.terrain[y + 1][x] === '#') return false;
    const o = occ[(y + 1) * s.W + x];
    return !o || s.pieces[o - 1] === p;
  }));
}

function overhangs(s) {
  const occ = occupancy(s);
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) if (s.terrain[y][x] === '.' && occ[y * s.W + x]) return true;
  return false;
}

function bridges(s) {
  const occ = occupancy(s);
  for (let x = 0; x < s.W; x++) {
    let covered = false;
    for (let y = 0; y < s.H; y++) {
      if (occ[y * s.W + x]) covered = true;
      else if (covered && s.terrain[y][x] === '.') return true;
    }
  }
  return false;
}
