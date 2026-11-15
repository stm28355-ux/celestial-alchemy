// ルール：落とす・落ちる・反応・処理の順番・クリア。画面なしで動き、ソルバーとテストも同じものを使う。
//
// 処理の順番（企画まとめ「検討で決まったこと」「中身の表で決まったこと」）：
//   1. 浮いているピースを全部落とし切る（形を保ったまま。1マスでも支えがあれば止まる）
//   2. 盤面全体で反応を一度に調べ、まとめて起こす
//        消える（溶ける・燃える・蒸発）→ 増える・変わる（伸びる・くっつく）
//   3. 何か変わったら 1 に戻る。何も変わらなければ終わり
//
// ピースは1つの素材でできている。スライムゼリーでくっついたピースは同じ「組（group）」になり、
// 組ごと1つの形として落ちる。組の中のピースが消えて離れ離れになったら、組は分かれる。
// スライムゼリーは、落ちる途中で横（左右）に壁・器の枠・ピースが触れたら、そこでくっついて止まる。
// 止まったあとも、横に触れている物があるかぎり落ちない（組ごと支えになる）。
//
// 状態はそのつど作り直す（drop は新しい状態を返す）。一手戻すとソルバーのため。

import { rotate, size, canonicalKey, uniqueRotations } from './shape.js';
import { material } from './materials.js';

export function createState(stage) {
  const s = {
    W: stage.W,
    H: stage.H,
    terrain: stage.terrain,
    pieces: stage.pieces.map((p, i) => ({ id: i + 1, group: i + 1, mat: p.mat, cells: p.cells.map(c => [...c]), fixed: p.fixed })),
    hand: stage.hand.map(h => handItem(h.mat, h.cells, h.orig)),
    nextId: stage.pieces.length + 1,
  };
  glue(s); // 最初から置いてあるゼリーは、最初からくっついている
  return s;
}

// 手持ちの1つ。向きごとの形と、まとめるための key を先に計算しておく（状態をまたいで使い回す）。
// 回せない素材（つる）は、どの向きでも同じ形にする。
export function handItem(mat, cells, orig) {
  const still = material(mat).noRotate;
  return {
    mat,
    cells,
    orig,
    key: `${mat}:${still ? cells.map(c => c.join(',')).join(';') : canonicalKey(cells)}`,
    rots: [0, 1, 2, 3].map(r => (still ? cells : rotate(cells, r))),
    uniq: still ? [{ r: 0, cells }] : uniqueRotations(cells),
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
// occ は同じ状態で何度も落とすとき（ソルバー）に渡すと速い。mat がゼリーなら、横に触れた所で止まる。
export function landing(s, cells, x, occ = occupancy(s), mat = null) {
  const { w, h } = size(cells);
  if (x < 0 || x + w > s.W) return { ok: false, reason: 'outside' };
  const free = d => cells.every(([cx, cy]) => {
    const px = cx + x, py = cy + d;
    if (isWall(s, px, py)) return false;
    return py < 0 || occ[py * s.W + px] === 0;
  });
  const sticky = mat === 'slime';
  const stuck = d => sticky && cells.some(([cx, cy]) => {
    const px = cx + x, py = cy + d;
    if (py < 0) return false;
    return [px - 1, px + 1].some(nx => isWall(s, nx, py) || occ[py * s.W + nx] !== 0);
  });
  let d = -h;
  while (!stuck(d) && free(d + 1)) d++;
  const placed = cells.map(([cx, cy]) => [cx + x, cy + d]);
  if (placed.some(([, y]) => y < 0)) return { ok: false, reason: 'above', cells: placed };
  return { ok: true, cells: placed };
}

// 手持ちの handIndex 番目を、向き r・列 x で落とす。新しい状態と、起きたこと（events）を返す。
export function drop(s, handIndex, r, x, occ) {
  const item = s.hand[handIndex];
  if (!item) return { ok: false, reason: 'no-piece' };
  const cells = item.rots[((r % 4) + 4) % 4];
  const land = landing(s, cells, x, occ, item.mat);
  if (!land.ok) return { ok: false, reason: land.reason, cells: land.cells };
  const next = cloneState(s);
  next.hand.splice(handIndex, 1);
  const id = next.nextId++;
  const piece = { id, group: id, mat: item.mat, cells: land.cells, fixed: false };
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

// 支えのないピースの添字。組ごとに考える：床・壁・動かないピース・支えのある別の組の上に、
// 組のどこか1マスでも乗っていれば、組ごと支えがある。
function unsupported(s) {
  const occ = occupancy(s);
  const members = new Map();
  s.pieces.forEach((p, i) => {
    if (!members.has(p.group)) members.set(p.group, []);
    members.get(p.group).push(i);
  });
  const sup = new Map();
  for (const [g, idx] of members) sup.set(g, idx.some(i => s.pieces[i].fixed));
  // ゼリーが横で壁・器の枠に触れている組は、それだけで支えがある
  const sideWall = (x, y) => isWall(s, x, y) && y >= 0;
  for (const [g, idx] of members) {
    if (sup.get(g)) continue;
    if (idx.some(i => s.pieces[i].mat === 'slime' && s.pieces[i].cells.some(([x, y]) => sideWall(x - 1, y) || sideWall(x + 1, y)))) sup.set(g, true);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [g, idx] of members) {
      if (sup.get(g)) continue;
      const other = (x, y) => {
        if (x < 0 || x >= s.W || y < 0 || y >= s.H) return false;
        const o = occ[y * s.W + x];
        return o !== 0 && s.pieces[o - 1].group !== g && sup.get(s.pieces[o - 1].group);
      };
      const held = idx.some(i =>
        s.pieces[i].cells.some(([x, y]) => {
          if (isWall(s, x, y + 1) || other(x, y + 1)) return true;
          // ゼリーは、横に触れている支えのある物にもつかまる
          return s.pieces[i].mat === 'slime' && (other(x - 1, y) || other(x + 1, y));
        }),
      );
      if (held) {
        sup.set(g, true);
        changed = true;
      }
    }
  }
  return s.pieces.flatMap((p, i) => (sup.get(p.group) ? [] : [i]));
}

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// となり合っている、別のピースどうしの組（添字の組、重なりなし）。
function touching(s, occ) {
  const pairs = new Map();
  s.pieces.forEach((p, i) => {
    for (const [x, y] of p.cells) {
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= s.W || ny < 0 || ny >= s.H) continue;
        const o = occ[ny * s.W + nx];
        if (!o || o - 1 === i) continue;
        const j = o - 1;
        pairs.set(i < j ? `${i},${j}` : `${j},${i}`, i < j ? [i, j] : [j, i]);
      }
    }
  });
  return [...pairs.values()];
}

// 盤面全体の反応を一度に調べて、まとめて起こす。何も起きなければ null。
//   消える：火種 × 鱗 → 鱗が消える（溶ける）／火種 × つる → つるが消える（燃える）／火種 × 水玉 → 両方消える（蒸発）
//   増える：つる × 水玉 → 水玉が消え、つるがいちばん上のマスの真上に1マス伸びる（触れた水玉1つにつき1マス。
//           伸びる先がふさがっていたら伸びず、水玉も残る。器の上端より上には伸びない）
//   変わる：スライムゼリーは、触れているピース（動かないピースはのぞく）とくっついて1つの組になる
export function react(s) {
  let occ = occupancy(s);
  const why = new Map(); // 消すピースの添字 → 理由
  for (const [i, j] of touching(s, occ)) {
    const a = s.pieces[i], b = s.pieces[j];
    for (const [p, q, pi, qi] of [[a, b, i, j], [b, a, j, i]]) {
      if (p.mat !== 'fire') continue;
      if (q.mat === 'ice') why.set(qi, 'melt');
      if (q.mat === 'vine') why.set(qi, 'burn');
      if (q.mat === 'water') {
        why.set(qi, 'steam');
        why.set(pi, 'steam');
      }
    }
  }
  const removed = [];
  if (why.size) {
    for (const [i, w] of [...why].sort((x, y) => x[0] - y[0])) removed.push(info(s.pieces[i], w));
    s.pieces = s.pieces.filter((_, i) => !why.has(i));
    splitGroups(s);
    occ = occupancy(s);
  }

  // 伸びる：つるごとに、触れている水玉を順に吸う
  const grown = [];
  const used = new Set();
  s.pieces.forEach(v => {
    if (v.mat !== 'vine') return;
    const waters = new Set();
    for (const [x, y] of v.cells) {
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= s.W || ny < 0 || ny >= s.H) continue;
        const o = occ[ny * s.W + nx];
        if (o && s.pieces[o - 1].mat === 'water' && !used.has(s.pieces[o - 1].id)) waters.add(s.pieces[o - 1].id);
      }
    }
    for (const wid of [...waters].sort((p, q) => p - q)) {
      const topY = Math.min(...v.cells.map(c => c[1]));
      const x = v.cells.find(c => c[1] === topY)[0];
      const y = topY - 1;
      if (y < 0 || isWall(s, x, y) || occ[y * s.W + x]) break; // ふさがっていたら伸びない
      v.cells.push([x, y]);
      occ[y * s.W + x] = s.pieces.indexOf(v) + 1;
      used.add(wid);
      const g = grown.find(e => e.id === v.id);
      if (g) g.cells.push([x, y]);
      else grown.push({ id: v.id, cells: [[x, y]] });
    }
  });
  if (used.size) {
    for (const p of s.pieces) if (used.has(p.id)) removed.push(info(p, 'absorb'));
    s.pieces = s.pieces.filter(p => !used.has(p.id));
    splitGroups(s);
  }

  // くっつく
  const merged = glue(s);

  if (!removed.length && !grown.length && !merged) return null;
  return {
    type: 'react',
    removed,
    grown,
    groups: s.pieces.map(p => [p.id, p.group]),
  };
}

function info(p, why) {
  return { id: p.id, mat: p.mat, fixed: p.fixed, cells: p.cells.map(c => [...c]), why };
}

// ゼリーに触れているピースを同じ組にする。組が変わったら true。
function glue(s) {
  const occ = occupancy(s);
  let changed = false;
  for (const [i, j] of touching(s, occ)) {
    const a = s.pieces[i], b = s.pieces[j];
    if (a.mat !== 'slime' && b.mat !== 'slime') continue;
    if (a.fixed || b.fixed || a.group === b.group) continue;
    const from = Math.max(a.group, b.group), to = Math.min(a.group, b.group);
    for (const p of s.pieces) if (p.group === from) p.group = to;
    changed = true;
  }
  return changed;
}

// 組の中でつながっていないピースは、別の組に分ける（組の番号は、そのかたまりの中でいちばん小さいピースの番号）。
function splitGroups(s) {
  const byGroup = new Map();
  for (const p of s.pieces) {
    if (!byGroup.has(p.group)) byGroup.set(p.group, []);
    byGroup.get(p.group).push(p);
  }
  for (const list of byGroup.values()) {
    if (list.length < 2) {
      list[0].group = list[0].id;
      continue;
    }
    const at = new Map();
    for (const p of list) for (const [x, y] of p.cells) at.set(`${x},${y}`, p);
    const seen = new Set();
    for (const start of list) {
      if (seen.has(start)) continue;
      const comp = [start];
      seen.add(start);
      for (let k = 0; k < comp.length; k++) {
        for (const [x, y] of comp[k].cells) {
          for (const [dx, dy] of NEIGHBORS) {
            const q = at.get(`${x + dx},${y + dy}`);
            if (q && !seen.has(q)) {
              seen.add(q);
              comp.push(q);
            }
          }
        }
      }
      const g = Math.min(...comp.map(p => p.id));
      for (const p of comp) p.group = g;
    }
  }
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
// 盤を左上から読み、マスごとに「素材の文字（動かないなら !）＋何番目に出てきたピースか＋何番目に出てきた組か」を並べる。
// ピースの分かれ方も、くっつき方も区別する。
const MAT_CHAR = { lead: 'l', gold: 'g', fire: 'f', ice: 'i', water: 'w', vine: 'v', slime: 's', sand: 'd', horn: 'h', stone: 'p' };

export function stateKey(s) {
  const occ = occupancy(s);
  const label = new Int32Array(s.pieces.length + 1).fill(-1);
  const glabel = new Map();
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
    if (!glabel.has(p.group)) glabel.set(p.group, glabel.size);
    out += MAT_CHAR[p.mat] + (p.fixed ? '!' : '') + String.fromCharCode(48 + label[o]) + String.fromCharCode(48 + glabel.get(p.group));
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
