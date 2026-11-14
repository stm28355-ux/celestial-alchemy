// ソルバー：手持ちを置く順番・向き・列を全部ためして、クリアできる道筋を数える。
//
// 出すもの：
//   paths            クリアできる道筋の数（置く順番が違えば別に数える。同じピースどうしは区別しない）
//   pathsNoReaction  そのうち、反応が一度も起きない道筋の数。0 なら「反応を使わないと解けない」
//   finalStates      クリアしたときの盤面の種類。1 に近いほど答えが1つに決まっている
//   firstMoves       クリアにつながる最初の1手（ヒントに使う）
//
// 同じ盤面・同じ手持ちは一度だけ調べる（記録して使い回す）。

import { createState, drop, isCleared, stateKey, handKey, occupancy } from './rules.js';
import { uniqueRotations, size } from './shape.js';

export function solve(stage, opts) {
  return solveState(createState(stage), opts);
}

// prune: false で行き止まりの見切りを止める（見切りが答えを取りこぼしていないかのテスト用）。
export function solveState(root, { maxNodes = 2_000_000, prune: usePrune = true } = {}) {
  const prune = usePrune && canPrune(root);
  const memo = new Map();
  const cleared = new Set();
  let nodes = 0;
  let truncated = false;

  function count(s) {
    const key = stateKey(s);
    const known = memo.get(key);
    if (known) return known;
    if (++nodes > maxNodes) {
      truncated = true;
      return { total: 0, noReact: 0 };
    }
    let res;
    if (prune && deadEnd(s)) {
      res = { total: 0, noReact: 0 };
    } else if (s.hand.length === 0) {
      const ok = isCleared(s);
      if (ok) cleared.add(key);
      res = { total: ok ? 1 : 0, noReact: ok ? 1 : 0 };
    } else {
      let total = 0, noReact = 0;
      const occ = occupancy(s);
      for (const m of moves(s)) {
        const d = drop(s, m.hand, m.r, m.x, occ);
        if (!d.ok) continue;
        const c = count(d.state);
        total += c.total;
        if (!d.events.some(e => e.type === 'react')) noReact += c.noReact;
      }
      res = { total, noReact };
    }
    memo.set(key, res);
    return res;
  }

  const top = count(root);
  const firstMoves = [];
  if (root.hand.length) {
    for (const m of moves(root)) {
      const d = drop(root, m.hand, m.r, m.x);
      if (!d.ok) continue;
      const c = memo.get(stateKey(d.state)) ?? count(d.state);
      if (c.total > 0) firstMoves.push({ ...m, mat: root.hand[m.hand].mat, orig: root.hand[m.hand].orig, paths: c.total });
    }
  }
  return {
    solvable: top.total > 0,
    paths: top.total,
    pathsNoReaction: top.noReact,
    finalStates: cleared.size,
    firstMoves,
    nodes,
    truncated,
  };
}

// ── 行き止まりの見切り ──
// 「この先どう置いてもクリアできない」盤面を早めに捨てて、調べる数を減らす。
// 答えを取りこぼさないために、次の前提が成り立つ素材だけのときに使う：
//   ピースは真下にしか動かない／マスが増える素材がない／消えるのは鱗だけ
// つる（上に伸びる）・角笛（横に押す）などを足すときは、ここを見直す。
const PRUNE_SAFE = new Set(['lead', 'fire', 'ice']);

function canPrune(s) {
  return s.pieces.every(p => PRUNE_SAFE.has(p.mat)) && s.hand.every(h => PRUNE_SAFE.has(h.mat));
}

export function deadEnd(s) {
  const occ = occupancy(s);
  const isTarget = (x, y) => '+GL'.includes(s.terrain[y][x]);

  // 1. 埋める必要のある空きが、手持ちのマス数より多い
  const handCells = s.hand.reduce((n, h) => n + h.cells.length, 0);
  let empty = 0;
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) if (isTarget(x, y) && !occ[y * s.W + x]) empty++;
  if (empty > handCells) return true;
  if (empty === 0) return false;

  // 2. もう動かないピース：消えることがなく、消えることのない物の上に（つながって）乗っている
  const fire = s.pieces.some(p => p.mat === 'fire') || s.hand.some(h => h.mat === 'fire');
  const vanish = p => fire && p.mat === 'ice';
  const stuck = s.pieces.map(p => p.fixed && !vanish(p));
  let changed = true;
  while (changed) {
    changed = false;
    s.pieces.forEach((p, i) => {
      if (stuck[i] || vanish(p)) return;
      const held = p.cells.some(([x, y]) => {
        if (y + 1 >= s.H || s.terrain[y + 1][x] === '#') return true;
        const o = occ[(y + 1) * s.W + x];
        return o !== 0 && o - 1 !== i && stuck[o - 1];
      });
      if (held) stuck[i] = changed = true;
    });
  }

  // 3. 空いた目標マスの真上に、壁か、もう動かないピースがある → 上から何も入れない
  //    （間に動くかもしれないピースがあれば、それが落ちてくるかもしれないので捨てない）
  for (let y = 0; y < s.H; y++) {
    for (let x = 0; x < s.W; x++) {
      if (!isTarget(x, y) || occ[y * s.W + x]) continue;
      for (let yy = y - 1; yy >= 0; yy--) {
        if (s.terrain[yy][x] === '#') return true;
        const o = occ[yy * s.W + x];
        if (!o) continue;
        if (stuck[o - 1]) return true;
        break;
      }
    }
  }
  return false;
}

// 今の状態でためす手。同じ素材・同じ形の手持ちは1つにまとめ、形が同じになる向きは1つにまとめる。
export function moves(s) {
  const out = [];
  const seen = new Set();
  s.hand.forEach((h, i) => {
    const k = handKey(h);
    if (seen.has(k)) return;
    seen.add(k);
    for (const { r, cells } of h.uniq ?? uniqueRotations(h.cells)) {
      const { w } = size(cells);
      for (let x = 0; x + w <= s.W; x++) out.push({ hand: i, r, x });
    }
  });
  return out;
}

// 狙いの手順（stage.solution）をそのまま打って、どうなるかを返す。
export function checkSolution(stage) {
  let s = createState(stage);
  let reactions = 0;
  for (let step = 0; step < stage.solution.length; step++) {
    const m = stage.solution[step];
    const idx = s.hand.findIndex(h => h.orig === m.hand);
    if (idx < 0) return { ok: false, step, reason: `手持ちの${m.hand + 1}番は、もう使っています` };
    const d = drop(s, idx, m.r, m.x);
    if (!d.ok) return { ok: false, step, reason: d.reason === 'above' ? '上端より上で止まります' : '置けません' };
    reactions += d.events.filter(e => e.type === 'react').length;
    s = d.state;
  }
  return { ok: true, cleared: isCleared(s), reactions, state: s };
}
