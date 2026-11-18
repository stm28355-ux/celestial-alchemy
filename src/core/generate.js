// 問題の生成（依頼の掲示板）。node の道具（tools/generate.mjs）と、ブラウザの「新しい依頼を探す」の両方で使う。
//
// 作り方（前に遊ばせて、あとから刻印を彫る）：
//   1. 器の形（壁・外した枠）・最初から置く素材・手持ちを、テーマ（素材の組み合わせ）からランダムに決める
//   2. 手持ちをランダムに全部落としてみる（必ず解ける盤面ができる）
//   3. 最後にピースがあるマスを刻印（金になったマスは金の刻印、鉛のマスは鉛の刻印のこともある）、空いたマスを空きマスにする
//   4. ソルバーで答えが1つか調べる。2つ以上なら空いたマスを×印にして絞り、要らない×印は空きマスに戻す
//   5. 難しさを測る：答えの道筋の1手ごとに「置ける手のうち、クリアにつながる手がどれだけ少ないか」を足す（迷いの量）

import { createState, drop, initialProblems } from './rules.js';
import { solveState, moves, exists } from './solver.js';
import { parseStage, stageToText, FORMAT } from './stage.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEAD = ['#', '##', '###', '##/#.', '#./##', '##/##', '#./#./##', '.#/.#/##', '###/.#.', '##./.##', '.##/##.', '####'];
const SHAPES = {
  fire: ['#', '#', '##'],
  ice: ['#', '##', '###', '##/#.', '#/#'],
  water: ['#', '#', '##'],
  vine: ['#', '#/#', '#/#/#'],
  slime: ['#', '##', '#/#', '##/#.'],
  sand: ['##', '###', '##/#.', '#./##', '####'],
  horn: ['#'],
  stone: ['#'],
};

// テーマ：一緒に使う素材と、器の作り方のくせ
export const THEMES = [
  { name: '溶ける', mats: ['fire', 'ice', 'ice'] },
  { name: '枠の氷', mats: ['fire'], frameIce: true },
  { name: '連鎖', mats: ['fire', 'ice', 'ice', 'ice'] },
  { name: 'つる', mats: ['water', 'vine'], shelf: true },
  { name: 'つると火', mats: ['water', 'vine', 'fire'], shelf: true },
  { name: 'ゼリー', mats: ['slime', 'slime'] },
  { name: 'ゼリーと鱗', mats: ['slime', 'ice', 'fire'] },
  { name: '星砂', mats: ['sand', 'sand'], pits: true },
  { name: '星砂とゼリー', mats: ['sand', 'slime'], pits: true },
  { name: '底の穴', mats: ['sand'], pits: true, holes: true },
  { name: '角笛', mats: ['horn'], shoulder: true },
  { name: '角笛と火', mats: ['horn', 'fire', 'ice'], shoulder: true },
  { name: '二つの角笛', mats: ['horn', 'horn'], shoulder: true, lowFrame: true },
  { name: '金', mats: ['stone', 'ice'], gold: true },
  { name: '金と星砂', mats: ['stone', 'sand'], gold: true },
  { name: '金と角笛', mats: ['stone', 'horn'], gold: true, shoulder: true },
];

const pick = (r, list) => list[Math.floor(r() * list.length)];
const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

// 器と手持ちの下書き（刻印はまだない）
function draft(r, theme) {
  const W = between(r, 4, 6);
  const H = between(r, 3, 5);
  const terrain = Array.from({ length: H }, () => Array(W).fill('.'));
  // 床のでこぼこ・肩・棚
  if (theme.pits || r() < 0.3) for (let x = 0; x < W; x++) if (r() < 0.3) terrain[H - 1][x] = '#';
  if (theme.shoulder) {
    const side = r() < 0.5 ? 0 : W - 1;
    terrain[H - 2][side] = '#';
    if (r() < 0.5) terrain[H - 3][side] = '#';
  }
  if (theme.shelf) {
    const x = between(r, 0, W - 1);
    terrain[between(r, 0, H - 2)][x] = '#';
  }
  // 1列まるごと壁になったら、下だけ残す
  for (let x = 0; x < W; x++) if (terrain.every(row => row[x] === '#')) terrain[0][x] = '.';
  const open = { left: [], right: [], floor: [] };
  if (theme.holes) open.floor.push(between(r, 0, W - 1));
  if (theme.lowFrame) (r() < 0.5 ? open.left : open.right).push(0);

  // 最初から置く素材：枠の氷・つる
  const pieces = Array.from({ length: H }, () => Array(W).fill('.'));
  const legend = {};
  if (theme.frameIce) {
    const x = between(r, 0, W - 1);
    if (terrain[H - 1][x] === '.') {
      pieces[H - 1][x] = 'a';
      legend.a = 'ice fixed';
    }
  }
  if (theme.mats.includes('vine') && r() < 0.6) {
    const x = between(r, 0, W - 1);
    if (terrain[H - 1][x] === '.' && pieces[H - 1][x] === '.') {
      pieces[H - 1][x] = 'b';
      legend.b = 'vine';
    }
  }

  const area = terrain.flat().filter(c => c === '.').length;
  const hand = theme.mats.map(m => `${m} ${pick(r, SHAPES[m])}`);
  let cells = hand.reduce((n, h) => n + h.split(' ')[1].split('').filter(c => c === '#').length, 0);
  const goal = Math.floor(area * (0.6 + r() * 0.3));
  const want = between(r, 6, 8);
  while (hand.length < want && cells < goal) {
    const s = pick(r, LEAD);
    hand.push(`lead ${s}`);
    cells += s.split('').filter(c => c === '#').length;
  }
  return { W, H, terrain: terrain.map(row => row.join('')), open, pieces: pieces.map(row => row.join('')), legend, hand };
}

function rawOf(d, terrain = d.terrain) {
  const open = [...(d.open.left.length ? [`left ${d.open.left.join(' ')}`] : []), ...(d.open.right.length ? [`right ${d.open.right.join(' ')}`] : []), ...(d.open.floor.length ? [`floor ${d.open.floor.join(' ')}`] : [])];
  const raw = { format: FORMAT, terrain, hand: d.hand, solution: [] };
  if (open.length) raw.open = open;
  if (Object.keys(d.legend).length) {
    raw.pieces = d.pieces;
    raw.legend = d.legend;
  }
  return raw;
}

// 手持ちをランダムに落としていく。置けなくなったら、残りの手持ちは使わない（手持ちから外す）。
// 返すもの：最後の状態と、置いた順の [手持ちの元の番号, 向き, 列]
function playRandom(r, stage) {
  let s = createState(stage);
  const solution = [];
  while (s.hand.length) {
    const options = [];
    for (let i = 0; i < s.hand.length; i++) {
      for (const { r: rot } of s.hand[i].uniq) {
        for (let x = 0; x < s.W; x++) options.push([i, rot, x]);
      }
    }
    // ランダムな順に全部ためして、置ける手を1つ選ぶ
    for (let k = options.length - 1; k > 0; k--) {
      const j = Math.floor(r() * (k + 1));
      [options[k], options[j]] = [options[j], options[k]];
    }
    let done = false;
    for (const [i, rot, x] of options) {
      const d = drop(s, i, rot, x);
      if (!d.ok) continue;
      solution.push([s.hand[i].orig, rot, x]);
      s = d.state;
      done = true;
      break;
    }
    if (!done) break;
  }
  return { state: s, solution };
}

// 最後の盤面から刻印を彫る
function carve(r, d, final, theme) {
  const occ = new Map();
  for (const p of final.pieces) for (const [x, y] of p.cells) occ.set(`${x},${y}`, p.mat);
  const terrain = d.terrain.map((row, y) =>
    [...row]
      .map((c, x) => {
        if (c !== '.') return c;
        const mat = occ.get(`${x},${y}`);
        if (!mat) return '.';
        if (theme.gold && mat === 'gold') return 'G';
        if (theme.gold && mat === 'lead' && r() < 0.8) return 'L';
        return '+';
      })
      .join(''),
  );
  return terrain;
}

const solveFor = (stage, maxNodes) => solveState(createState(stage), { maxNodes, examples: 1 });

// 1つ作ってみる。うまくいかなければ null。
export function makeCandidate(r, { maxNodes = 150000, theme = pick(r, THEMES), stats = null } = {}) {
  const why = k => {
    if (stats) stats[k] = (stats[k] ?? 0) + 1;
    return null;
  };
  const d = draft(r, theme);
  let stage;
  try {
    stage = parseStage(stageToText(rawOf(d)));
  } catch {
    return why('形');
  }
  const played = playRandom(r, stage);
  // 置けたものだけを手持ちにする（置いた順に番号を付け直す）
  if (played.solution.length < 5) return why('置けない');
  d.hand = played.solution.map(([o]) => d.hand[o]);
  played.solution = played.solution.map(([, rot, x], k) => `${k + 1} r${rot} x${x}`);
  // 手持ちを並べ替えて、置く順が見えないようにする
  const order = d.hand.map((_, k) => k).sort(() => r() - 0.5);
  const back = new Map(order.map((k, j) => [k, j]));
  d.hand = order.map(k => d.hand[k]);
  played.solution = played.solution.map(line => line.replace(/^(\d+)/, (_, n) => String(back.get(Number(n) - 1) + 1)));
  let terrain = carve(r, d, played.state, theme);
  // 刻印のない器や、ほとんど空の器は捨てる
  const marks = terrain.join('').split('').filter(c => '+GL'.includes(c)).length;
  if (marks < 4) return why('刻印が少ない');
  // いちばん上の行に何もなければ削る（盤が無駄に高くならないように）
  while (terrain.length > 2 && /^[.#]+$/.test(terrain[0]) && !d.pieces[0].replace(/\./g, '')) {
    terrain = terrain.slice(1);
    d.pieces = d.pieces.slice(1);
    d.open.left = d.open.left.map(n => n - 1).filter(n => n >= 0);
    d.open.right = d.open.right.map(n => n - 1).filter(n => n >= 0);
  }
  const build = t => {
    try {
      return parseStage(stageToText({ ...rawOf(d, t), solution: played.solution }));
    } catch {
      return null;
    }
  };
  let st = build(terrain);
  if (!st) return why('形');
  let res = solveFor(st, maxNodes);
  if (res.truncated) return why('調べきれない');
  if (!res.solvable) return why('解けない');
  // 答えが2つ以上：空いたマスを×印にして絞る
  if (res.finalStates > 1) {
    const xs = terrain.map(row => row.replace(/\./g, 'x'));
    const sx = build(xs);
    const rx = sx && solveFor(sx, maxNodes);
    if (!rx || rx.truncated || rx.finalStates !== 1) return why('×印でも絞れない');
    // 要らない×印は空きマスに戻す（ランダムな順に）
    terrain = xs;
    const spots = [];
    terrain.forEach((row, y) => [...row].forEach((c, x) => c === 'x' && spots.push([x, y])));
    spots.sort(() => r() - 0.5);
    for (const [x, y] of spots) {
      const trial = terrain.map((row, yy) => (yy === y ? row.slice(0, x) + '.' + row.slice(x + 1) : row));
      const s2 = build(trial);
      const r2 = s2 && solveFor(s2, maxNodes);
      if (r2 && !r2.truncated && r2.finalStates === 1) terrain = trial;
    }
    st = build(terrain);
    res = solveFor(st, maxNodes);
  }
  if (res.finalStates !== 1) return why('×印でも絞れない');
  const score = difficulty(st, maxNodes);
  if (!score) return why('難しさを測れない');
  if (stats) stats.bits = [...(stats.bits ?? []), score.bits];
  return { theme: theme.name, raw: { ...st.raw, solution: res.examples[0].moves.map(m => `${m.orig + 1} r${m.r} x${m.x}`) }, ...score, paths: res.paths, pathsNoReaction: res.pathsNoReaction };
}

// 難しさ：答えの道筋の1手ごとに、log2（置ける手の数 ÷ クリアにつながる手の数）を足す。
// 大きいほど、正しい手が見つけにくい場面が多い。trap は最初の1手の引っかけの割合。
export function difficulty(stage, maxNodes = 150000) {
  let s = createState(stage);
  const first = solveState(s, { maxNodes, examples: 1 });
  if (!first.solvable || first.truncated) return null;
  const path = first.examples[0].moves;
  let bits = 0;
  let hardest = 0;
  let trap = 0;
  for (let k = 0; k < path.length; k++) {
    const r = k === 0 ? first : solveState(s, { maxNodes });
    let legal = 0;
    for (const m of moves(s)) if (drop(s, m.hand, m.r, m.x).ok) legal++;
    const win = r.firstMoves.length;
    if (!win || !legal) return null;
    const b = Math.log2(legal / win);
    bits += b;
    hardest = Math.max(hardest, b);
    if (k === 0) trap = 1 - win / legal;
    const m = path[k];
    const i = s.hand.findIndex(h => h.orig === m.orig);
    s = drop(s, i, m.r, m.x).state;
  }
  return { bits: Math.round(bits * 10) / 10, hardest: Math.round(hardest * 10) / 10, trap: Math.round(trap * 100) / 100, steps: path.length };
}

// ── テーマから作る（2026-11-15 作り直し） ──
// 1問に1つ、メインの気付きを決める。器はすっきりした形（長方形に壁を少し、刻印はほぼ全面）にして、
// 形合わせではなく、順番と素材の性質で考える問題にする。確かめ：
//   ・答え（クリア盤面）が1つ
//   ・どの答えでも、メインの気付きを使う（feature）
//   ・メインの素材を同じ形の鉛に替えると解けない（素材の性質が要る）
import { FEATURES } from './solver.js';

export const THEMED = {
  melt: {
    name: '溶けて落ちる',
    idea: '鱗が溶けると、上に乗っていた物が形を保ったまま落ちる',
    feature: 'meltFall',
    main: 'ice',
    hand: r => ['fire #', ...(r() < 0.3 ? [`ice ${pick(r, ['#', '##', '###'])}`] : [])],
    size: (r, big) => (big ? [between(r, 4, 6), between(r, 4, 5)] : [4, between(r, 3, 4)]),
    terrain(r, W, H) {
      return Array.from({ length: H }, () => Array(W).fill('+'));
    },
    // 最初から置く：底の鱗とその上の鉛（2-5 上から落ちる・2-6 連鎖）か、枠の鱗の段（2-8 器の底）
    presets(r, W, H) {
      const p = Array.from({ length: H }, () => Array(W).fill('.'));
      const legend = {};
      if (r() < 0.35) {
        const y = H - 2;
        const from = between(r, 0, 1), to = between(r, W - 2, W - 1);
        for (let x = from; x <= to; x++) p[y][x] = 'a';
        legend.a = 'ice fixed';
        return { p, legend };
      }
      const w = between(r, 1, 3);
      const x0 = between(r, 0, W - w);
      for (let x = x0; x < x0 + w; x++) p[H - 1][x] = 'a';
      legend.a = 'ice';
      // 鱗の上に鉛を乗せる（はみ出してもよいが、鱗だけに支えられる）
      const lw = between(r, 1, 2);
      const lx = between(r, Math.max(0, x0 - lw + 1), Math.min(W - lw, x0 + w - 1));
      for (let x = lx; x < lx + lw; x++) p[H - 2][x] = 'b';
      legend.b = 'lead';
      if (r() < 0.4) {
        // 2つ目の鱗（連鎖）：最初の鱗の隣
        const nx = x0 + w < W ? x0 + w : x0 - 1;
        if (nx >= 0 && nx < W && p[H - 1][nx] === '.') {
          p[H - 1][nx] = 'c';
          legend.c = 'ice';
        }
      }
      return { p, legend };
    },
  },
  // 高い鱗：鱗（器の一部）が高い所にあり、上は壁でふさがっている。真上から火種は届かないので、
  // どう積めば火種が鱗の横に届くかを考える。鱗の下のマスは、溶かさないと埋められない（2026-11-16 人の案）
  tallIce: {
    name: '高い鱗',
    idea: '上がふさがった高い鱗に、横から火種を届かせる',
    feature: 'frameMelt',
    main: null,
    maxLeads: 3,
    hand: r => ['fire #', ...Array.from({ length: between(r, 0, 2) }, () => pick(r, ['ice ##', 'sand ##', 'ice #', 'sand ###']))],
    size: r => [between(r, 4, 5), between(r, 4, 5)],
    terrain(r, W, H) {
      const t = Array.from({ length: H }, () => Array(W).fill('+'));
      const c = between(r, 0, W - 1);
      const len = between(r, 1, 2);
      const y2 = between(r, len, H - 2); // 鱗のいちばん下（その下に1マス以上あける）
      const y1 = y2 - len + 1;
      // ふたの下は、溶けたあとも上から入れないので、鱗は×印（最後に空いている）、その下は空きマス
      for (let y = 0; y < y1 - 1; y++) t[y][c] = '+';
      t[y1 - 1][c] = '#';
      for (let y = y1; y <= y2; y++) t[y][c] = 'x';
      for (let y = y2 + 1; y < H; y++) t[y][c] = '.';
      this._ice = { c, y1, y2 };
      return t;
    },
    presets(r, W, H) {
      const p = Array.from({ length: H }, () => Array(W).fill('.'));
      const { c, y1, y2 } = this._ice;
      for (let y = y1; y <= y2; y++) p[y][c] = 'a';
      return { p, legend: { a: 'ice fixed' } };
    },
  },
  // 角笛×鱗：鱗の上の角笛は、鱗が溶けて落ちると、落ちた先でもう一度押す（6-7）
  hornMelt: {
    name: '角笛と鱗',
    idea: '鱗が溶けて角笛が落ちると、落ちた先でもう一度押す',
    feature: 'meltPush',
    main: 'horn',
    maxLeads: 3,
    hand: r => ['horn #', 'fire #', `ice ${pick(r, ['#', '##', '#/#'])}`, ...(r() < 0.4 ? ['horn #'] : [])],
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain: hornTerrain,
  },
  // 角笛×火種：肩の下の鱗（器の一部）に、角笛で火種を押し当てて溶かす（6-6）
  hornFire: {
    name: '角笛と火種',
    idea: '上から届かない肩の下の鱗に、角笛で火種を押し当てる',
    feature: 'pushMelt',
    main: 'horn',
    maxLeads: 3,
    hand: r => ['horn #', 'fire #', ...(r() < 0.4 ? ['horn #'] : []), ...(r() < 0.3 ? [`ice ${pick(r, ['#', '##'])}`] : [])],
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain(r, W, H) {
      const t = shoulderTerrain(r, W, H);
      // 肩の下のいちばん奥に、器の一部の鱗。×印の上に置いて、溶かさないといけなくする
      const side = t[0][0] === '#' ? 0 : W - 1;
      let y = 0;
      while (t[y][side] === '#') y++;
      t[H - 1][side] = 'x';
      this._ice = { c: side, y: H - 1 };
      return t;
    },
    presets(r, W, H) {
      const p = Array.from({ length: H }, () => Array(W).fill('.'));
      p[this._ice.y][this._ice.c] = 'a';
      return { p, legend: { a: 'ice fixed' } };
    },
  },
  // 鱗×ゼリー：ゼリーでくっついた組は、下の鱗が溶けても落ちない（2026-11-17）
  iceSlime: {
    name: '鱗とゼリー',
    idea: 'ゼリーでくっついた組は、下の鱗が溶けても落ちない',
    feature: 'melt',
    main: 'slime',
    maxLeads: 3,
    hand: r => ['fire #', `slime ${pick(r, ['#', '##', '#/#'])}`, ...(r() < 0.3 ? [`ice ${pick(r, ['#', '##'])}`] : [])],
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain(r, W, H) {
      return Array.from({ length: H }, () => Array(W).fill('+'));
    },
    presets(r, W, H) {
      // 底の鱗（動く）。鉛は乗せない（上はゼリーで支える物を、自分で積む）
      const p = Array.from({ length: H }, () => Array(W).fill('.'));
      const w = between(r, 1, 2);
      const x0 = between(r, 0, W - w);
      for (let x = x0; x < x0 + w; x++) p[H - 1][x] = 'a';
      return { p, legend: { a: 'ice' } };
    },
    // 鱗のマスは×印：溶かさないといけないが、その上に積んだ物は落とせない（ゼリーで支える）
    finish(grid, pre) {
      pre.p.forEach((row, y) => row.forEach((c, x) => {
        if (c !== '.') grid[y][x] = 'x';
      }));
    },
  },
  // 鱗×星砂：下の鱗が溶けると、上の粒が1つずつ落ちる（5-5）（2026-11-17）
  sandMelt: {
    name: '鱗と星砂',
    idea: '下の鱗が溶けると、その上の星砂の粒が1つずつ落ちる',
    feature: 'meltSandFall',
    main: 'sand',
    maxLeads: 3,
    hand: r => ['fire #', `sand ${pick(r, ['##', '###', '#./##'])}`, ...(r() < 0.3 ? [`ice ${pick(r, ['#', '##'])}`] : [])],
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain(r, W, H) {
      const t = Array.from({ length: H }, () => Array(W).fill('+'));
      if (r() < 0.4) t[H - 1][between(r, 0, W - 1)] = '#';
      return t;
    },
    presets(r, W, H) {
      return THEMED.melt.presets(r, W, H);
    },
  },
  // つると水玉（棚の下）：上がふさがった列の底につるがあり、水玉で伸ばして棚の下を埋める（3-1）（2026-11-18）
  vineShelf: {
    name: 'つると水玉',
    idea: '上から入れない棚の下を、つるを伸ばして埋める',
    feature: 'grow',
    main: ['water'],
    maxLeads: 4,
    size: r => [between(r, 5, 6), between(r, 3, 4)],
    terrain(r, W, H) {
      const t = Array.from({ length: H }, () => Array(W).fill('+'));
      // 棚は1つか2つ（違う列）。上から roof 段がふさがっていて、いちばん下につる
      const cols = [between(r, 0, W - 1)];
      if (r() < 0.4) {
        const c2 = between(r, 0, W - 1);
        if (Math.abs(c2 - cols[0]) >= 2) cols.push(c2);
      }
      let gap = 0;
      for (const c of cols) {
        const roof = between(r, 1, H - 2);
        for (let y = 0; y < roof; y++) t[y][c] = '#';
        gap += H - 1 - roof;
      }
      this._vine = { cols, gap };
      return t;
    },
    presets(r, W, H) {
      const p = Array.from({ length: H }, () => Array(W).fill('.'));
      const legend = {};
      this._vine.cols.forEach((c, i) => {
        const k = 'ab'[i];
        p[H - 1][c] = k;
        legend[k] = 'vine';
      });
      return { p, legend };
    },
    // 伸ばす数だけ水玉
    hand(r) {
      const n = this._vine.gap;
      return Array.from({ length: n }, () => `water ${pick(r, ['#', '#', '##'])}`);
    },
  },
  // 賢者の石（区切り）：金の刻印と鉛の刻印の間を、鉛でない素材で区切る（7-3・7-8）（2026-11-18）
  goldSep: {
    name: '賢者の石',
    idea: '金の刻印と鉛の刻印の間を、鉛でない素材で区切る',
    feature: 'gild',
    main: hand => hand.map(h => h.split(' ')[0]).filter(m => m !== 'lead' && m !== 'stone').slice(0, 1),
    maxLeads: 3,
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain(r, W, H) {
      // いちばん上は空きマス（石を置く所）。区切りの列の左が金、右が鉛（左右は入れ替えることもある）
      const s = between(r, 1, W - 2);
      const flip = r() < 0.5;
      const t = Array.from({ length: H }, (_, y) =>
        Array.from({ length: W }, (_, x) => (y === 0 ? '.' : x === s ? '+' : (x < s) !== flip ? 'G' : 'L')),
      );
      this._sep = { s, h: H - 1 };
      return t;
    },
    hand(r) {
      const h = this._sep.h;
      // 区切りの列の高さちょうどの縦棒（星砂は縦に落ちて、粒もその列に積もる）
      const sep = pick(r, ['ice', 'sand', 'slime']);
      return ['stone #', `${sep} ${Array(h).fill('#').join('/')}`];
    },
  },
  // 角笛とつる（組み合わせ）：水玉でつるを伸ばして、角笛で押したピースを止める「止め木」にする（2026-11-18 人の案）
  hornVine: {
    name: '角笛とつる',
    idea: 'つるを伸ばして、角笛で押したピースを途中で止める',
    feature: 'push',
    main: ['horn', 'water'],
    maxLeads: 3,
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain(r, W, H) {
      const t = hornTerrain(r, W, H);
      // つるを置く列（いちばん下が壁でない列）
      const cols = [];
      for (let x = 0; x < W; x++) if (t[H - 1][x] !== '#') cols.push(x);
      this._vine = { c: pick(r, cols) };
      return t;
    },
    presets(r, W, H) {
      const p = Array.from({ length: H }, () => Array(W).fill('.'));
      p[H - 1][this._vine.c] = 'a';
      return { p, legend: { a: 'vine' } };
    },
    hand: r => ['horn #', 'water #', ...(r() < 0.5 ? ['water #'] : []), ...(r() < 0.3 ? ['horn #'] : [])],
  },
  // ── 2026-11-18 人の指示で足したテーマ（掲示板の残り50問のための試作） ──
  // 火種の使い道：鱗・つる・水玉のどれを火種で減らすか（減らさない・一部だけ・まとめて全部）。どの答えでも減らす物は同じ
  fireChoice: {
    name: '火種の使い道',
    idea: '鱗・つる・水玉のうち、どれを火種で減らすか（減らさないことも）',
    feature: null,
    main: [],
    maxLeads: 3,
    keepIce: true,
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain(r, W, H) {
      const t = Array.from({ length: H }, () => Array(W).fill('+'));
      // ときどき、上がふさがった列（つるを伸ばすと埋まる）
      if (r() < 0.4) {
        const c = between(r, 0, W - 1);
        const roof = between(r, 1, H - 2);
        for (let y = 0; y < roof; y++) t[y][c] = '#';
      }
      return t;
    },
    presets(r, W, H) {
      const p = Array.from({ length: H }, () => Array(W).fill('.'));
      const legend = {};
      const free = [];
      for (let x = 0; x < W; x++) free.push(x);
      free.sort(() => r() - 0.5);
      if (r() < 0.6) {
        p[H - 1][free.pop()] = 'a';
        legend.a = 'vine';
      }
      if (r() < 0.5) {
        p[H - 1][free.pop()] = 'b';
        legend.b = 'ice';
      }
      return { p, legend };
    },
    hand: r => [
      'fire #',
      ...(r() < 0.3 ? ['fire #'] : []),
      ...Array.from({ length: between(r, 1, 2) }, () => pick(r, ['ice #', 'ice ##', 'water #', 'water #', 'vine #', 'vine #/#'])),
    ],
    // 全部残るとして数え、消える分だけ鉛を増やすこともある
    fill: (m, sh) => (m === 'stone' ? 0 : cellsOf(sh)),
    spread(must, pre) {
      const burn = must.filter(h => /^(ice|vine|water|fire) /.test(h)).reduce((n, h) => n + cellsOf(h.split(' ')[1]), 0);
      const preCells = pre.p.flat().filter(c => c !== '.').length;
      return [0, burn + preCells];
    },
    check({ root, raw, hand, maxNodes }) {
      const kinds = new Set([...root.pieces, ...root.hand].map(p => p.mat).filter(m => ['ice', 'vine', 'water'].includes(m)));
      if (kinds.size < 2) return null;
      const gone = [];
      for (const [feat, mat] of [['melt', 'ice'], ['burn', 'vine'], ['steam', 'water']]) {
        if (!kinds.has(mat)) continue;
        const r2 = solveState(root, { maxNodes, feature: FEATURES[feat] });
        if (r2.truncated) return null;
        const without = r2.pathsWithoutFeature;
        const withF = r2.paths - without;
        if (withF && without) return null; // 減らすかどうかが、答えによって違う
        if (withF) gone.push(mat);
      }
      if (gone.length) {
        const swapped = { ...raw, hand: hand.map(h => (h.startsWith('fire ') ? `lead ${h.split(' ')[1]}` : h)) };
        const rs = exists(createState(parseStage(stageToText(swapped))), { maxNodes });
        if (rs.found || rs.truncated) return null;
      }
      const JA = { ice: '鱗', vine: 'つる', water: '水玉' };
      const kind = !gone.length ? 'なし' : gone.length === kinds.size ? '全部' : '一部';
      return { note: `${kind}（${[...kinds].map(m => JA[m] + (gone.includes(m) ? '×' : '○')).join('・')}）` };
    },
  },
  // 角笛と水玉：角笛の下の水玉を火種で消すと、角笛が落ちてもう一度押す。火種も一緒に消えるので、2回目はほかの物を押せる
  hornWater: {
    name: '角笛と水玉',
    idea: '水玉が火種と一緒に消えて、落ちた角笛がもう一度押す',
    feature: 'steamPush',
    main: ['horn', 'water'],
    maxLeads: 3,
    hand: r => ['horn #', 'fire #', `water ${pick(r, ['#', '#', '##', '#/#'])}`, ...(r() < 0.4 ? ['horn #'] : [])],
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain: hornTerrain,
    // 火種と水玉は消える
    fill: m => (m === 'fire' || m === 'water' ? 0 : null),
    spread: () => [-1, 0],
  },
  // 少しの鉛：鉛の刻印は少しだけ、ほかは何でもよいマス。賢者の石をどこに置き、どこを区切るかが見えにくい。
  // 半分はつる（最初から置く）と水玉：つるの上を押さえると、横の水玉が吸われずに区切りになる
  goldFew: {
    name: '少しの鉛',
    idea: '少しの鉛の刻印を金から守る（区切りの場所は自分で決める）',
    feature: 'gild',
    main: hand => [...new Set(hand.map(h => h.split(' ')[0]).filter(m => m !== 'lead' && m !== 'stone'))],
    maxLeads: 3,
    quickNodes: 100000,
    size: r => [between(r, 4, 5), 4],
    terrain(r, W, H) {
      const t = Array.from({ length: H }, (_, y) => Array(W).fill(y === 0 ? '.' : '+'));
      const cells = [];
      for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) cells.push([x, y]);
      cells.sort(() => r() - 0.5);
      const near = (x, y, c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => t[y + dy]?.[x + dx] === c);
      let nL = between(r, 1, 2), nG = between(r, 1, 2);
      for (const [x, y] of cells) {
        if (nL && !near(x, y, 'G')) {
          t[y][x] = 'L';
          nL--;
        } else if (nG && !near(x, y, 'L') && t[y][x] === '+') {
          t[y][x] = 'G';
          nG--;
        }
      }
      this._vine = r() < 0.5 ? cells.map(([x]) => x).find(x => t[H - 1][x] === '+') ?? null : null;
      return t;
    },
    presets(r, W, H) {
      if (this._vine == null) return null;
      const p = Array.from({ length: H }, () => Array(W).fill('.'));
      p[H - 1][this._vine] = 'a';
      return { p, legend: { a: 'vine' } };
    },
    hand(r) {
      if (this._vine != null) return ['stone #', ...Array.from({ length: between(r, 1, 2) }, () => 'water #')];
      return ['stone #', ...Array.from({ length: between(r, 1, 2) }, () => pick(r, ['ice ##', 'ice #', 'sand ##', 'slime #', 'slime ##', 'ice #/#']))];
    },
    // 賢者の石は刻印のない一番上か、何でもよいマスに置く。鱗は火種がないので残る
    fill: (m, sh) => (m === 'stone' ? 0 : cellsOf(sh)),
    spread: () => [-1, 0],
    // つるのある問題は、どの答えでも水玉が吸われずに残る（区切りに使う）
    check({ res, root }) {
      if (!root.pieces.some(p => p.mat === 'vine')) return { note: '区切り' };
      if (res.examples.length < res.finalStates) return null;
      return res.examples.every(e => e.state.pieces.some(p => p.mat === 'water')) ? { note: 'つると水玉' } : null;
    },
  },
  // ゼリーと星砂：ばらけた粒もゼリーにくっつく（落ちない粒ができる）
  slimeSand: {
    name: 'ゼリーと星砂',
    idea: 'ばらけた星砂の粒も、ゼリーに触れるとくっついて落ちない',
    feature: ['crumble', 'glue'],
    // 星砂は、鉛に替えると横に渡せることが多いので、確かめるのはゼリーだけ
    main: ['slime'],
    maxLeads: 6,
    hand: r => [`slime #`, ...(r() < 0.3 ? ['slime #'] : []), `sand ${pick(r, ['###', '#./##', '##/#.', '####', '###/#..'])}`, ...(r() < 0.5 ? [`sand ${pick(r, ['##', '###'])}`] : [])],
    // 鉛は1マスだけ（回して横に渡し、×印の上をふさげないように。ふさげるのは、ゼリーでくっついた組だけ）
    leads: ['#'],
    size: r => [between(r, 4, 5), 3],
    // 底に×印のくぼみ（最後に空いている）。その上のマスは、ゼリーで横から支えないと粒が落ちて埋まってしまう
    terrain(r, W, H) {
      const t = Array.from({ length: H }, () => Array(W).fill('+'));
      const n = between(r, 1, 2);
      for (let k = 0; k < n; k++) t[H - 1][between(r, 0, W - 1)] = 'x';
      if (r() < 0.3) t[H - 1][between(r, 0, W - 1)] = '#';
      return t;
    },
    fill: (m, sh) => cellsOf(sh),
  },
  // ゼリーと角笛：ゼリーでくっついた組は、角笛にまとめて押される。横で触れたゼリーは止まる
  slimeHorn: {
    name: 'ゼリーと角笛',
    idea: 'ゼリーでくっついた組は、角笛にまとめて押される',
    feature: ['push', 'glue'],
    main: ['horn', 'slime'],
    maxLeads: 3,
    hand: r => ['horn #', `slime ${pick(r, ['#', '##', '#/#'])}`, ...(r() < 0.3 ? ['slime #'] : []), ...(r() < 0.3 ? ['horn #'] : [])],
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain: hornTerrain,
    fill: (m, sh) => cellsOf(sh),
  },
  // 38の仲間：角笛2つと水玉2つ、つるを最初から置く（試作38が良かった：つるを伸ばす・押す・止めるが絡む）
  hornVine2: {
    name: '角笛とつる（2つずつ）',
    idea: '角笛2つと水玉2つで、つるを伸ばしながら押す・止める',
    feature: ['push', 'grow'],
    main: ['horn', 'water'],
    maxLeads: 3,
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain(r, W, H) {
      return THEMED.hornVine.terrain.call(this, r, W, H);
    },
    presets(r, W, H) {
      return THEMED.hornVine.presets.call(this, r, W, H);
    },
    hand: () => ['horn #', 'horn #', 'water #', 'water #'],
  },
  // 角笛と低い枠（提案）：枠が外れている所へ押すと、ピースが器の外へ出てしまう（失敗）。押す向きと止め方を考える
  hornOpen: {
    name: '角笛と低い枠',
    idea: '枠のない所へ押し出さないように、角笛の向きと止め方を考える',
    feature: 'push',
    main: 'horn',
    maxLeads: 3,
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    // 肩のある器（押さないと入れない所がある）。肩と反対側の枠を、上から何段か外す
    terrain(r, W, H) {
      const t = shoulderTerrain(r, W, H);
      this._side = t[0][0] === '#' ? 'right' : 'left';
      return t;
    },
    open(r, W, H) {
      const rows = k => Array.from({ length: k }, (_, y) => y).join(' ');
      return [`${this._side} ${rows(between(r, 1, H - 1))}`];
    },
    hand: r => ['horn #', ...(r() < 0.5 ? ['horn #'] : [])],
  },
  // 角笛と星砂（提案）：ばらけた粒は1つずつ押される（形のままなら押せない所にも粒なら入る）
  hornSand: {
    name: '角笛と星砂',
    idea: 'ばらけた星砂の粒を、角笛で1つずつ押す',
    feature: 'pushSand',
    main: ['horn', 'sand'],
    maxLeads: 3,
    hand: r => ['horn #', `sand ${pick(r, ['##', '###', '#./##', '##/#.'])}`, ...(r() < 0.3 ? ['horn #'] : [])],
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain: shoulderTerrain,
    fill: (m, sh) => cellsOf(sh),
  },
  // ── 2026-11-18 試作44〜59のあとに足したテーマ（掲示板の残りの枠のための試作） ──
  // ゼリーと火種：ゼリーでくっついた組から、燃える物（つる・水玉）を火種で抜く。抜けた所の上は、組なら落ちない
  slimeFire: {
    name: 'ゼリーと火種',
    idea: 'ゼリーでくっついた組から、つるや水玉を火種で抜く',
    feature: ['glue', 'burnOrSteam'],
    main: ['slime', 'fire'],
    maxLeads: 3,
    keepIce: true,
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain(r, W, H) {
      return Array.from({ length: H }, () => Array(W).fill('+'));
    },
    presets(r, W, H) {
      const p = Array.from({ length: H }, () => Array(W).fill('.'));
      const legend = {};
      if (r() < 0.6) {
        p[H - 1][between(r, 0, W - 1)] = 'a';
        legend.a = 'vine';
      }
      return { p, legend };
    },
    hand: r => ['fire #', `slime ${pick(r, ['#', '##', '#/#'])}`, ...(r() < 0.6 ? [`water ${pick(r, ['#', '##'])}`] : []), ...(r() < 0.3 ? ['vine #'] : [])],
    fill: (m, sh) => cellsOf(sh),
    spread(must, pre) {
      const burn = must.filter(h => /^(vine|water|fire) /.test(h)).reduce((n, h) => n + cellsOf(h.split(' ')[1]), 0);
      return [0, burn + pre.p.flat().filter(c => c !== '.').length];
    },
  },
  // 角笛と水玉とつる：角笛の下の水玉がつるに吸われると、角笛が落ちてもう一度押す（火種の代わりに、つるで水玉を消す）
  hornGrow: {
    name: '角笛と水玉とつる',
    idea: '角笛の下の水玉がつるに吸われて、落ちた角笛がもう一度押す',
    feature: 'growPush',
    main: ['horn', 'water'],
    maxLeads: 3,
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain(r, W, H) {
      return THEMED.hornVine.terrain.call(this, r, W, H);
    },
    presets(r, W, H) {
      return THEMED.hornVine.presets.call(this, r, W, H);
    },
    hand: r => ['horn #', 'water #', ...(r() < 0.5 ? ['water #'] : []), ...(r() < 0.4 ? ['horn #'] : [])],
  },
  // 賢者の石と角笛：肩の下に金の刻印。真上からは入れないので、角笛で鉛や石を押し込み、金にする
  stoneHorn: {
    name: '賢者の石と角笛',
    idea: '肩の下の金の刻印へ、角笛で鉛や賢者の石を押し込む',
    feature: ['push', 'gild'],
    main: ['horn'],
    maxLeads: 3,
    size: r => [between(r, 4, 5), between(r, 4, 5)],
    terrain(r, W, H) {
      // いちばん上は空きマス（石を置く所）。肩の下の列は金の刻印、ほかは何でもよいマス
      const t = shoulderTerrain(r, W, H - 1).map(row => row.slice());
      const side = t[0][0] === '#' ? 0 : W - 1;
      let y = 0;
      while (t[y][side] === '#') y++;
      for (let yy = y; yy < H - 1; yy++) t[yy][side] = 'G';
      return [Array(W).fill('.'), ...t];
    },
    hand: r => ['stone #', 'horn #', ...(r() < 0.3 ? ['horn #'] : [])],
    fill: (m, sh) => (m === 'stone' ? 0 : cellsOf(sh)),
    spread: () => [-1, 0],
  },
  // 向かい合う角笛：最初から置いた角笛と、手持ちの角笛。向かい合って両側から押すと、押し合って動かない
  hornFace: {
    name: '向かい合う角笛',
    idea: '両側から押すと押し合って動かない。どちら向きに、いつ置くか',
    feature: 'push',
    main: ['horn'],
    maxLeads: 3,
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain: hornTerrain,
    presets(r, W, H) {
      // 底の端に、内側を向いた角笛を1つ
      const p = Array.from({ length: H }, () => Array(W).fill('.'));
      const left = r() < 0.5;
      p[H - 1][left ? 0 : W - 1] = 'a';
      return { p, legend: { a: left ? 'horn' : 'horn left' } };
    },
    hand: r => ['horn #', ...(r() < 0.4 ? ['horn #'] : [])],
  },
  // ── 2026-11-19 新しい器の形と、別のパターンの試作 ──
  // 角笛と水玉・ゼリーと角笛を、新しい形の器で（今の器の形では、解ける形が3〜5種類しかなかった）
  hornWaterX: {
    name: '角笛と水玉（新しい器）',
    idea: '水玉が火種と一緒に消えて、落ちた角笛がもう一度押す',
    feature: 'steamPush',
    main: ['horn', 'water'],
    maxLeads: 3,
    hand: r => ['horn #', 'fire #', `water ${pick(r, ['#', '#', '##', '#/#'])}`, ...(r() < 0.4 ? ['horn #'] : [])],
    size: r => [between(r, 5, 6), between(r, 3, 4)],
    // 新しい器のうち角笛で解けたのは段の肩だけだったので、段の肩と、幅の広い器の肩
    terrain: (r, W, H) => (r() < 0.5 ? newHornTerrain(r, W, H, 'stair') : shoulderTerrain(r, W, H)),
    fill: m => (m === 'fire' || m === 'water' ? 0 : null),
    spread: () => [-1, 0],
  },
  slimeHornX: {
    name: 'ゼリーと角笛（新しい器）',
    idea: 'ゼリーでくっついた組は、角笛にまとめて押される',
    feature: ['push', 'glue'],
    main: ['horn', 'slime'],
    maxLeads: 3,
    hand: r => ['horn #', `slime ${pick(r, ['#', '##', '#/#'])}`, ...(r() < 0.3 ? ['slime #'] : []), ...(r() < 0.3 ? ['horn #'] : [])],
    size: r => [between(r, 4, 6), between(r, 3, 4)],
    terrain: newHornTerrain,
    fill: (m, sh) => cellsOf(sh),
  },
  // 水玉の仮の床：水玉の上に積んでから、火種で水玉を消す。鱗と違って火種も一緒に消えるので、火種のいた所も空く
  steamFall: {
    name: '水玉の仮の床',
    idea: '水玉の上に積んでから火種で消すと、上の物が落ちる（火種も消える）',
    feature: 'steamFall',
    main: ['water', 'fire'],
    maxLeads: 3,
    hand: r => ['fire #', `water ${pick(r, ['##', '#/#', '#', '###'])}`],
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain(r, W, H) {
      const t = Array.from({ length: H }, () => Array(W).fill('+'));
      if (r() < 0.5) t[H - 1][between(r, 0, W - 1)] = '#';
      return t;
    },
    // 火種と水玉は消える
    fill: m => (m === 'fire' || m === 'water' ? 0 : null),
  },
  // 伸ばして燃やす：つるを水玉で伸ばして足場にし、上に積んでから火種で燃やして落とす
  vineScaffold: {
    name: '伸ばして燃やす',
    idea: 'つるを伸ばして足場にし、あとで燃やして上の物を落とす',
    feature: 'burnFall',
    main: ['fire'],
    maxLeads: 3,
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    // つるのマスは×印（最後には燃やして空ける）。伸びた分のマスは、上から落ちてきた物で埋める
    terrain(r, W, H) {
      const t = Array.from({ length: H }, () => Array(W).fill('+'));
      this._vine = between(r, 0, W - 1);
      t[H - 1][this._vine] = 'x';
      return t;
    },
    presets(r, W, H) {
      const p = Array.from({ length: H }, () => Array(W).fill('.'));
      p[H - 1][this._vine] = 'a';
      return { p, legend: { a: 'vine' } };
    },
    hand: r => ['fire #', ...Array.from({ length: between(r, 1, 2) }, () => 'water #')],
    // つるは燃えて消え、水玉は吸われる。火種は残る
    fill: (m, sh) => (m === 'water' ? 0 : cellsOf(sh)),
    spread: () => [0, 1],
    keepIce: true,
  },
  // 賢者の石と鱗：鱗が溶けると、上の鉛が落ちて石（金）に触れ、金になる
  goldMelt: {
    name: '賢者の石と鱗',
    idea: '鱗が溶けて落ちた鉛が、石や金に触れて金になる',
    feature: 'meltGild',
    main: ['ice'],
    maxLeads: 3,
    quickNodes: 100000,
    size: r => [between(r, 4, 5), 4],
    terrain(r, W, H) {
      const t = THEMED.goldFew.terrain.call(this, r, W, H);
      this._vine = null;
      return t;
    },
    hand: r => ['stone #', 'fire #', `ice ${pick(r, ['#', '##', '#/#'])}`],
    fill: (m, sh) => (m === 'stone' || m === 'ice' ? 0 : cellsOf(sh)),
    spread: () => [-1, 0],
  },
  // 角笛と火種の使い道：肩の器で、角笛で火種を運ぶ。鱗・つる・水玉のどれを減らすかは、どの答えでも同じ
  hornChoice: {
    name: '角笛と火種の使い道',
    idea: '角笛で火種を運び、鱗・つる・水玉のどれを減らすかを選ぶ',
    feature: 'push',
    main: ['horn'],
    maxLeads: 3,
    keepIce: true,
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain: shoulderTerrain,
    presets(r, W, H) {
      return THEMED.fireChoice.presets(r, W, H);
    },
    hand: r => ['horn #', 'fire #', ...Array.from({ length: between(r, 1, 2) }, () => pick(r, ['ice #', 'water #', 'vine #', 'ice ##']))],
    fill: (m, sh) => cellsOf(sh),
    spread(must, pre) {
      return THEMED.fireChoice.spread(must, pre);
    },
    check(ctx) {
      return THEMED.fireChoice.check(ctx);
    },
  },
  // 角笛とゼリーと鱗：ゼリーでくっついた組を押す・鱗が溶けても組は落ちない、を肩の器で
  hornSlimeIce: {
    name: '角笛とゼリーと鱗',
    idea: 'ゼリーでくっついた組を角笛で押し、鱗を溶かしても組は落ちない',
    feature: ['push', 'glue', 'melt'],
    main: ['horn', 'slime'],
    maxLeads: 3,
    size: r => [between(r, 4, 5), between(r, 3, 4)],
    terrain: shoulderTerrain,
    hand: r => ['horn #', 'fire #', `slime ${pick(r, ['#', '#/#'])}`, `ice ${pick(r, ['#', '##'])}`],
    fill: (m, sh) => (m === 'ice' ? 0 : cellsOf(sh)),
  },
  sand: {
    name: '星砂は真下に',
    idea: '星砂は止まるとばらけて、粒が真下に流れ込む（形のままでは入らない所にも入る）',
    feature: 'sandFall',
    main: 'sand',
    hand: r => Array.from({ length: between(r, 1, 2) }, () => `sand ${pick(r, ['##', '###', '#./##', '##/#.', '####', '###/#..'])}`),
    size: (r, big) => (big ? [between(r, 5, 6), between(r, 3, 4)] : [between(r, 4, 5), 3]),
    terrain(r, W, H) {
      const t = Array.from({ length: H }, () => Array(W).fill('+'));
      // 床のでこぼこ：底の行に1〜2個の出っぱり（くぼみができる）
      const n = between(r, 1, 2);
      for (let k = 0; k < n; k++) {
        const x = between(r, 0, W - 1);
        t[H - 1][x] = '#';
        if (r() < 0.4 && H > 3) t[H - 2][x] = '#';
      }
      if (r() < 0.3) t[0] = t[0].map(() => '.');
      return t;
    },
  },
};

const cellsOf = sh => sh.split('').filter(c => c === '#').length;

// 角笛の器：形の種類を増やして、同じ形ばかりにならないようにする（2026-11-17）
//   肩（片方）・広い肩（2列）・両側の肩・真ん中の柱・角の段
function hornTerrain(r, W, H) {
  const kind = pick(r, ['shoulder', 'wide', 'both', 'pillar', 'step']);
  if (kind === 'shoulder') return shoulderTerrain(r, W, H);
  const t = Array.from({ length: H }, () => Array(W).fill('+'));
  if (kind === 'wide') {
    const side = r() < 0.5 ? 0 : W - 2;
    const depth = between(r, 1, H - 2);
    for (let y = 0; y < depth; y++) t[y][side] = t[y][side + 1] = '#';
  } else if (kind === 'both') {
    const d1 = between(r, 1, H - 2), d2 = between(r, 1, H - 2);
    for (let y = 0; y < d1; y++) t[y][0] = '#';
    for (let y = 0; y < d2; y++) t[y][W - 1] = '#';
  } else if (kind === 'pillar') {
    const x = between(r, 1, W - 2);
    const h = between(r, 1, H - 1);
    for (let y = H - h; y < H; y++) t[y][x] = '#';
  } else {
    const side = r() < 0.5 ? 0 : W - 2;
    t[H - 1][side] = t[H - 1][side + 1] = '#';
    if (r() < 0.5) t[H - 2][side === 0 ? 0 : W - 1] = '#';
  }
  return t;
}

// 肩のある器：左か右の上の方が壁（真上からは入れない肩の下ができる）
function shoulderTerrain(r, W, H) {
  const t = Array.from({ length: H }, () => Array(W).fill('+'));
  const side = r() < 0.5 ? 0 : W - 1;
  const depth = between(r, 1, H - 2);
  for (let y = 0; y < depth; y++) t[y][side] = '#';
  if (r() < 0.3) {
    const other = side === 0 ? W - 1 : 0;
    t[0][other] = '#';
  }
  return t;
}

// テーマから1問作ってみる。だめなら null（why に理由を数える）
// big：答えは何個でもよい（テーマを使うことと、鉛に替えると解けないことだけを確かめる）。器を大きく、手持ちを多くする
// quickNodes：最初の「解けるか」は、この数だけ調べて見つからなければあきらめる（取りこぼしてもよい。次の候補へ早く移るため）
export function makeThemed(r, key, { maxNodes = 200000, stats = null, big = false, measureEarly = false, quickNodes = 20000, maxCombos = 20 } = {}) {
  if (big) maxNodes = Math.max(maxNodes, 500000);
  const th = THEMED[key];
  if (th.quickNodes) quickNodes = th.quickNodes;
  const why = k => {
    if (stats) stats[k] = (stats[k] ?? 0) + 1;
    return null;
  };
  const [W, H] = th.size(r, big);
  const grid = th.terrain(r, W, H);
  // 1列まるごと壁は作らない
  for (let x = 0; x < W; x++) if (grid.every(row => row[x] === '#')) grid[0][x] = '+';
  const pre = th.presets ? th.presets(r, W, H) : null;
  const open = th.open ? th.open(r, W, H) : null;
  // 最初から置く物に合わせて、器を直す（例：溶かす鱗のマスを×印に）
  if (th.finish && pre) th.finish(grid, pre);
  const terrain = grid.map(row => row.join(''));
  const targets = terrain.join('').split('').filter(c => '+GL'.includes(c)).length;
  const must = th.hand(r);
  // 刻印を埋めるマスの数え方：鱗は溶けて消えるので0、水玉は吸われてつるが1マス伸びるので1つで1、
  // 賢者の石は刻印のない所に置くので0。最初から置く物（鱗のほか）が刻印のマスにあれば、その分は埋まっている
  // テーマが数え方を決めているときは、それを使う（fill）
  const fillOf = h => {
    const [m, sh] = h.split(' ');
    const own = th.fill?.(m, sh);
    if (own != null) return own;
    return m === 'ice' || m === 'stone' ? 0 : m === 'water' ? 1 : cellsOf(sh);
  };
  const mustCells = must.reduce((n, h) => n + fillOf(h), 0);
  const preCells = pre
    ? pre.p.reduce((n, row, y) => n + row.filter((c, x) => c !== '.' && (th.keepIce || !pre.legend[c].startsWith('ice')) && '+GL'.includes(grid[y][x])).length, 0)
    : 0;
  // spread：消える物・置き場所しだいで埋まるマスが変わるテーマは、鉛の数を幅の中から選ぶ
  const [lo, hi] = th.spread ? th.spread(must, pre) : [0, 0];
  const need = targets - mustCells - preCells + between(r, lo, hi);
  if (need < 1) return why('鉛が入らない');
  // 鉛を1〜3個、合計がちょうど need マスになる組み合わせを全部挙げて、ランダムな順にためす
  const combos = [];
  const LEADS = th.leads ?? LEAD; // テーマによっては、鉛の形をしぼる
  const rec = (start, sum, acc) => {
    if (sum === need && acc.length) combos.push([...acc]);
    if (acc.length >= (th.maxLeads ?? (big ? 5 : 4)) || sum >= need) return;
    for (let i = start; i < LEADS.length; i++) {
      acc.push(LEADS[i]);
      rec(i, sum + cellsOf(LEADS[i]), acc);
      acc.pop();
    }
  };
  rec(0, 0, []);
  if (!combos.length) return why('鉛の数が合わない');
  combos.sort(() => r() - 0.5);
  for (const leads of combos.slice(0, maxCombos)) {
    const hand = [...must, ...leads.map(s => `lead ${s}`)].sort(() => r() - 0.5);
    const raw = { format: FORMAT, terrain, hand, solution: [] };
    if (open?.length) raw.open = open;
    if (pre) {
      raw.pieces = pre.p.map(row => row.join(''));
      raw.legend = pre.legend;
    }
    let st;
    try {
      st = parseStage(stageToText(raw));
    } catch {
      return why('形');
    }
    if (initialProblems(st).length) return why('最初の盤面がおかしい');
    // ふるい分けは「見つかったら止める」探し方で（速い）。全部数えるのは、残ったものだけ
    const root = createState(st);
    const clock = (k, t0) => stats && (stats['時間:' + k] = (stats['時間:' + k] ?? 0) + Date.now() - t0);
    let t0 = Date.now();
    const any = exists(root, { maxNodes: quickNodes });
    clock('解けるか', t0);
    if (!any.found) {
      why(any.truncated ? 'すぐには見つからない' : '解けない');
      continue;
    }
    t0 = Date.now();
    let plainOk = true;
    for (const f of featuresOf(th)) {
      const plain = exists(root, { maxNodes, avoid: FEATURES[f] });
      if (plain.found || plain.truncated) {
        why(plain.found ? '気付きを使わずに解ける' : '調べきれない');
        plainOk = false;
        break;
      }
    }
    clock('気付きなしで解けるか', t0);
    if (!plainOk) continue;
    // メインの素材を、同じ形の鉛に替えると解けないこと（メインが最初から置く物のテーマは、形で確かめ済み）
    // main は1つの素材か、素材の並び（どれを鉛に替えても解けないこと）
    const mains = mainsOf(th, hand);
    let replaceable = false;
    for (const m of mains) {
      const swapped = { ...raw, hand: hand.map(h => (h.startsWith(`${m} `) ? `lead ${h.split(' ')[1]}` : h)) };
      t0 = Date.now();
      const rs = exists(createState(parseStage(stageToText(swapped))), { maxNodes });
      clock('鉛に替えて解けるか', t0);
      if (rs.found || rs.truncated) {
        replaceable = m;
        break;
      }
    }
    if (replaceable) {
      why(`鉛に替えても解ける:${replaceable}`);
      continue;
    }
    t0 = Date.now();
    const res = solveState(root, { maxNodes, examples: th.check ? 30 : 1 });
    clock('全部数える', t0);
    if (res.truncated) {
      why('調べきれない');
      continue;
    }
    if (!big && res.finalStates !== 1) {
      why('答えが2つ以上');
      continue;
    }
    // テーマごとの確かめ（例：火種で消す物が、どの答えでも同じ）
    let note;
    if (th.check) {
      const c = th.check({ root, raw, hand, res, maxNodes });
      if (!c) {
        why('テーマの確かめ');
        continue;
      }
      note = c.note;
    }
    t0 = Date.now();
    const score = difficulty(st, maxNodes);
    clock('難しさ', t0);
    if (!score) continue;
    return { theme: key, name: th.name, raw: { ...raw, solution: res.examples[0].moves.map(m => `${m.orig + 1} r${m.r} x${m.x}`) }, ...score, paths: res.paths, finalStates: res.finalStates, note, early: measureEarly ? earlyShare(st, maxNodes) : undefined };
  }
  return null;
}

// 特殊な素材（鉛以外の手持ち）を全部先に置いてから、鉛だけで解ける置き方の割合（判断材料。0 なら「適当に置いてから鉛パズル」ができない）
export function earlyShare(stage, maxNodes = 200000) {
  let frontier = [createState(stage)];
  for (let guard = 0; guard < 8 && frontier.some(s => s.hand.some(h => h.mat !== 'lead')); guard++) {
    const next = [];
    for (const s of frontier) {
      if (!s.hand.some(h => h.mat !== 'lead')) {
        next.push(s);
        continue;
      }
      for (const m of moves(s)) {
        if (s.hand[m.hand].mat === 'lead') continue;
        const d = drop(s, m.hand, m.r, m.x);
        if (d.ok) next.push(d.state);
      }
    }
    frontier = next;
    if (frontier.length > 400) return null; // 多すぎるときは測らない
  }
  if (!frontier.length) return 0;
  const ok = frontier.filter(s => solveState(s, { maxNodes }).solvable).length;
  return Math.round((ok / frontier.length) * 100) / 100;
}

// テーマの気付き（1つか並び。ないテーマもある）
export function featuresOf(th) {
  return th.feature == null ? [] : [].concat(th.feature);
}

// 作った問題がテーマを守っているか（テストで使う）：どの答えも気付きを使う・メインの素材を鉛に替えると解けない・テーマごとの確かめ
export function verifyThemed(key, st, { maxNodes = 600000 } = {}) {
  const th = THEMED[key];
  const root = createState(st);
  for (const f of featuresOf(th)) {
    const p = exists(root, { maxNodes, avoid: FEATURES[f] });
    if (p.found || p.truncated) return `気付き ${f} を使わずに解ける`;
  }
  const hand = st.raw.hand;
  for (const m of mainsOf(th, hand)) {
    const swapped = { ...st.raw, hand: hand.map(h => (h.startsWith(`${m} `) ? `lead ${h.split(' ')[1]}` : h)) };
    const rs = exists(createState(parseStage(stageToText(swapped))), { maxNodes });
    if (rs.found || rs.truncated) return `${m}を鉛に替えても解ける`;
  }
  if (th.check) {
    const res = solveState(root, { maxNodes, examples: 30 });
    if (!th.check({ root, raw: st.raw, hand, res, maxNodes })) return 'テーマの確かめ';
  }
  return null;
}

// テーマの「鉛に替えると解けないはずの素材」の並び（main は素材名・並び・手持ちから決める関数のどれか）
export function mainsOf(th, hand) {
  return typeof th.main === 'function' ? th.main(hand) : Array.isArray(th.main) ? th.main : th.main ? [th.main] : [];
}

// 角笛の新しい器（2026-11-19）：真上からは入れず、押さないと埋まらない所の作り方を増やす
//   つらら（上から垂れた壁）・浮いた棚・段の肩（2列で深さが違う）・上が開いた肩（枠の途中に出っぱり）
function newHornTerrain(r, W, H, only = null) {
  const t = Array.from({ length: H }, () => Array(W).fill('+'));
  const kind = only ?? pick(r, ['hang', 'ledge', 'stair', 'lip']);
  if (kind === 'hang') {
    // 上から垂れた壁（1〜2列）。その下と横は押して入れる
    const w = between(r, 1, 2);
    const x = between(r, 1, W - 1 - w);
    const d = between(r, 1, H - 2);
    for (let y = 0; y < d; y++) for (let k = 0; k < w; k++) t[y][x + k] = '#';
  } else if (kind === 'ledge') {
    // 宙に浮いた棚（1〜2マス）。上には積めて、下は押して入れる
    const w = between(r, 1, 2);
    const x = between(r, 0, W - w);
    const y = between(r, 1, H - 2);
    for (let k = 0; k < w; k++) t[y][x + k] = '#';
  } else if (kind === 'stair') {
    // 段の肩：端の列は深く、となりの列は浅い
    const left = r() < 0.5;
    const d = between(r, 2, H - 1);
    for (let y = 0; y < d; y++) t[y][left ? 0 : W - 1] = '#';
    for (let y = 0; y < d - 1; y++) t[y][left ? 1 : W - 2] = '#';
  } else {
    // 上が開いた肩：端の列の途中に出っぱり（上は真上から入れ、下は押して入れる）
    const left = r() < 0.5;
    const y = between(r, 1, H - 2);
    t[y][left ? 0 : W - 1] = '#';
    if (r() < 0.5) t[y][left ? 1 : W - 2] = '#';
  }
  return t;
}
