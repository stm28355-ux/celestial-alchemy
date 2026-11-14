// ルール：落とす・落ちる・反応・処理の順番・クリア。画面なしで動き、ソルバーとテストも同じものを使う。
//
// 処理の順番（企画まとめ「検討で決まったこと」）：
//   1. 浮いているピースを全部落とし切る（ピースは形を保ったまま。1マスでも支えがあれば止まる）
//   2. 盤面全体で反応を一度に調べ、まとめて起こす（消える反応が先、増える反応が後）
//   3. 何か変わったら 1 に戻る。何も変わらなければ終わり
//
// 状態はそのつど作り直す（drop は新しい状態を返す）。一手戻すとソルバーのため。

import { rotate, size, canonicalKey, uniqueRotations } from './shape.js';

export function createState(stage) {
  return {
    W: stage.W,
    H: stage.H,
    terrain: stage.terrain,
    pieces: stage.pieces.map((p, i) => ({ id: i + 1, mat: p.mat, cells: p.cells.map(c => [...c]), fixed: p.fixed })),
    hand: stage.hand.map(h => handItem(h.mat, h.cells, h.orig)),
    nextId: stage.pieces.length + 1,
  };
}

// 手持ちの1つ。向きごとの形と、まとめるための key を先に計算しておく（状態をまたいで使い回す）。
export function handItem(mat, cells, orig) {
  return {
    mat,
    cells,
    orig,
    key: `${mat}:${canonicalKey(cells)}`,
    rots: [0, 1, 2, 3].map(r => rotate(cells, r)),
    uniq: uniqueRotations(cells),
  };
}

export function cloneState(s) {
  return {
    ...s,
    pieces: s.pieces.map(p => ({ ...p, cells: p.cells.map(c => [...c]) })),
    hand: [...s.hand],
  };
}

// マスごとに、そこにあるピースの番号（pieces の添字＋1）。0 は何もない。
export function occupancy(s) {
  const occ = new Int32Array(s.W * s.H);
  s.pieces.forEach((p, i) => {
    for (const [x, y] of p.cells) if (y >= 0) occ[y * s.W + x] = i + 1;
  });
  return occ;
}

function isWall(s, x, y) {
  if (x < 0 || x >= s.W || y >= s.H) return true; // 左右の外と、床
  if (y < 0) return false; // 盤の上の空
  return s.terrain[y][x] === '#';
}

// 手持ちの形を、列 x の上から落としたときに止まる場所。置けないときは ok: false。
// occ は同じ状態で何度も落とすとき（ソルバー）に渡すと速い。
export function landing(s, cells, x, occ = occupancy(s)) {
  const { w, h } = size(cells);
  if (x < 0 || x + w > s.W) return { ok: false, reason: 'outside' };
  const free = d => cells.every(([cx, cy]) => {
    const px = cx + x, py = cy + d;
    if (isWall(s, px, py)) return false;
    return py < 0 || occ[py * s.W + px] === 0;
  });
  let d = -h;
  while (free(d + 1)) d++;
  const placed = cells.map(([cx, cy]) => [cx + x, cy + d]);
  if (placed.some(([, y]) => y < 0)) return { ok: false, reason: 'above', cells: placed };
  return { ok: true, cells: placed };
}

// 手持ちの handIndex 番目を、向き r・列 x で落とす。新しい状態と、起きたこと（events）を返す。
export function drop(s, handIndex, r, x, occ) {
  const item = s.hand[handIndex];
  if (!item) return { ok: false, reason: 'no-piece' };
  const cells = item.rots[((r % 4) + 4) % 4];
  const land = landing(s, cells, x, occ);
  if (!land.ok) return { ok: false, reason: land.reason, cells: land.cells };
  const next = cloneState(s);
  next.hand.splice(handIndex, 1);
  const piece = { id: next.nextId++, mat: item.mat, cells: land.cells, fixed: false };
  next.pieces.push(piece);
  const events = [{ type: 'place', id: piece.id, mat: piece.mat, cells: land.cells.map(c => [...c]) }];
  // 置いたピースは止まった所にあり、ほかのピースも止まっているので、落とす段は飛ばして反応から始める。
  events.push(...resolve(next, { settled: true }));
  return { ok: true, state: next, events };
}

// 処理の順番どおりに、止まるまで進める（状態を書き換える）。
export function resolve(s, { settled = false } = {}) {
  const events = [];
  for (let guard = 0; guard < 1000; guard++) {
    if (!settled || guard > 0) events.push(...settle(s));
    const reaction = react(s);
    if (!reaction) return events;
    events.push(reaction);
  }
  throw new Error('処理が終わりません（ルールの間違い）');
}

// 浮いているピースを、1マスずつ全部落とし切る。1マス落ちるたびに1つの event。
export function settle(s) {
  const events = [];
  for (let guard = 0; guard < s.H + 1; guard++) {
    const falling = unsupported(s);
    if (falling.length === 0) return events;
    for (const i of falling) for (const c of s.pieces[i].cells) c[1] += 1;
    events.push({ type: 'fall', ids: falling.map(i => s.pieces[i].id) });
  }
  throw new Error('落ち終わりません（ルールの間違い）');
}

// 支えのないピースの添字。床・壁・動かないピース・支えのあるピースの上に1マスでも乗っていれば支えがある。
function unsupported(s) {
  const occ = occupancy(s);
  const sup = s.pieces.map(p => p.fixed);
  let changed = true;
  while (changed) {
    changed = false;
    s.pieces.forEach((p, i) => {
      if (sup[i]) return;
      const held = p.cells.some(([x, y]) => {
        if (isWall(s, x, y + 1)) return true;
        const o = occ[(y + 1) * s.W + x];
        return o !== 0 && o - 1 !== i && sup[o - 1];
      });
      if (held) {
        sup[i] = true;
        changed = true;
      }
    });
  }
  return sup.flatMap((v, i) => (v ? [] : [i]));
}

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// 盤面全体の反応を一度に調べて、まとめて起こす。何も起きなければ null。
//   火種 × 鱗：火種に触れた鱗は、ピースごと消える。火種は残る。
export function react(s) {
  const occ = occupancy(s);
  const remove = new Set();
  s.pieces.forEach(p => {
    if (p.mat !== 'fire') return;
    for (const [x, y] of p.cells) {
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= s.W || ny < 0 || ny >= s.H) continue;
        const o = occ[ny * s.W + nx];
        if (o && s.pieces[o - 1].mat === 'ice') remove.add(o - 1);
      }
    }
  });
  if (remove.size === 0) return null;
  const removed = [...remove].sort((a, b) => a - b).map(i => s.pieces[i]);
  s.pieces = s.pieces.filter((_, i) => !remove.has(i));
  return {
    type: 'react',
    removed: removed.map(p => ({ id: p.id, mat: p.mat, fixed: p.fixed, cells: p.cells.map(c => [...c]), why: 'melt' })),
  };
}

// クリア：手持ちを使い切り、目標マスが全部埋まっている（G は金、L は鉛で）。
export function isCleared(s) {
  return s.hand.length === 0 && targetsFilled(s);
}

export function targetsFilled(s) {
  const occ = occupancy(s);
  for (let y = 0; y < s.H; y++) {
    for (let x = 0; x < s.W; x++) {
      const t = s.terrain[y][x];
      if (t !== '+' && t !== 'G' && t !== 'L') continue;
      const o = occ[y * s.W + x];
      if (!o) return false;
      const mat = s.pieces[o - 1].mat;
      if (t === 'G' && mat !== 'gold') return false;
      if (t === 'L' && mat !== 'lead') return false;
    }
  }
  return true;
}

// 同じ盤面・同じ手持ちなら同じ文字列。ソルバーの記録に使う。
// 盤を左上から読み、マスごとに「素材の文字（動かないなら !）＋何番目に出てきたピースか」を並べる。
// ピースの分かれ方も区別する（2つの鉛が並んでいるのと、1つの長い鉛は別の盤面）。
const MAT_CHAR = { lead: 'l', gold: 'g', fire: 'f', ice: 'i', water: 'w', vine: 'v', slime: 's', sand: 'd', horn: 'h', stone: 'p' };

export function stateKey(s) {
  const occ = occupancy(s);
  const label = new Int32Array(s.pieces.length + 1).fill(-1);
  let next = 0;
  let out = '';
  for (let i = 0; i < occ.length; i++) {
    const o = occ[i];
    if (!o) {
      out += '.';
      continue;
    }
    const p = s.pieces[o - 1];
    if (label[o] < 0) label[o] = next++;
    out += MAT_CHAR[p.mat] + (p.fixed ? '!' : '') + String.fromCharCode(48 + label[o]);
  }
  return `${out}/${s.hand.map(h => h.key).sort().join('|')}`;
}

export function handKey(h) {
  return h.key ?? `${h.mat}:${canonicalKey(h.cells)}`;
}

// ステージの最初の盤面が、止まっていて反応もしないか。作るときの確かめ。
export function initialProblems(stage) {
  const s = createState(stage);
  const problems = [];
  const occ = new Map();
  for (const p of s.pieces) {
    for (const [x, y] of p.cells) {
      const k = `${x},${y}`;
      if (occ.has(k)) problems.push(`ピースが重なっています：(${x}, ${y})`);
      occ.set(k, true);
    }
  }
  if (settle(cloneState(s)).length) problems.push('最初の盤面に、浮いているピースがあります');
  if (react(cloneState(s))) problems.push('最初の盤面で、もう反応が起きます');
  return problems;
}
