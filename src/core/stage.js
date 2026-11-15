// ステージの形式（版1）。
//
// テキスト（人と Claude が書く）→ 生の形（JSON。共有URLにもこれを載せる）→ 遊べる形（buildStage）。
// 生の形でも盤面は文字の並びのまま持つ。
//
// テキストの例（項目の中の行は字下げする。字下げなしの「# 」で始まる行はコメント）：
//   format: 1
//   id: sample-01
//   title: はじめての調合
//   request: 学院の先生が、鉛の延べ棒をほしがっている。
//   terrain:
//     +++
//     +++
//   pieces:
//     ...
//     .a.
//   legend:
//     a: ice
//   hand:
//     lead ##
//     fire #
//   solution:
//     1 r0 x1
//
// terrain の文字：# 壁　. 空きマス（埋めなくてよい）　+ 目標マス　G 金で埋めるマス　L 鉛のまま残すマス
//   x ×印（最後に何も残っていてはいけない）　- 消したマス（器にないマス。通り抜けられるが止まれない）
//   いちばん下の行のさらに下は床（器の底の枠）。左右の外は器の枠。
// open：枠を外す所（任意）。マスはそのまま残る。1行に1つ：
//   left 0 1   左の枠を、0行目と1行目の高さだけ外す（低い枠）
//   right 0    右の枠を、0行目の高さだけ外す
//   floor 2    底の枠を、2列目の下だけ外す（底の穴）
// pieces：最初から盤にある素材。同じ英小文字のマスが1つのピース。legend で素材を決める。
//   "fixed" を付けると動かない（枠側の氷など）。
// hand：手持ち。「素材 形」。形は shape.js の書き方。
// solution：狙いの手順。「手持ちの番号 r向き x列」（向きは時計回りに90度ずつ、列は左端が0）。
//   手持ちの番号は、hand に書いた順の1から。

import { material } from './materials.js';
import { parseShape } from './shape.js';

export const FORMAT = 1;
const TERRAIN_CHARS = new Set(['#', '.', '+', 'G', 'L', 'x', '-']);
const BLOCKS = new Set(['terrain', 'open', 'pieces', 'legend', 'hand', 'solution']);
const OPEN_SIDES = ['left', 'right', 'floor'];

export function parseStageText(text) {
  const raw = { format: FORMAT };
  let block = null;
  for (const line of text.split(/\r?\n/)) {
    // 行の頭（字下げなし）の「# 」はコメント。項目の中の行は字下げするので、壁の「#」とまぎれない。
    if (/^#\s/.test(line) || /^\s*$/.test(line)) continue;
    const head = /^([a-z]+):\s*(.*)$/.exec(line);
    if (head && !/^\s/.test(line)) {
      const [, key, value] = head;
      if (BLOCKS.has(key)) {
        block = key;
        raw[key] = key === 'legend' ? {} : [];
      } else {
        block = null;
        raw[key] = key === 'format' ? Number(value) : value.trim();
      }
      continue;
    }
    if (!block) throw new Error(`どの項目の行か分かりません：${line}`);
    const body = line.trim();
    if (block === 'legend') {
      const m = /^([a-z]):\s*(.+)$/.exec(body);
      if (!m) throw new Error(`legend の書き方が違います：${line}`);
      raw.legend[m[1]] = m[2].trim();
    } else {
      raw[block].push(body);
    }
  }
  return raw;
}

export function stageToText(raw) {
  const out = [`format: ${raw.format ?? FORMAT}`];
  for (const key of ['id', 'title', 'request']) if (raw[key]) out.push(`${key}: ${raw[key]}`);
  for (const key of ['terrain', 'open', 'pieces']) {
    if (!raw[key]?.length) continue;
    out.push(`${key}:`, ...raw[key].map(r => `  ${r}`));
  }
  if (raw.legend && Object.keys(raw.legend).length) {
    out.push('legend:', ...Object.entries(raw.legend).map(([k, v]) => `  ${k}: ${v}`));
  }
  for (const key of ['hand', 'solution']) {
    if (!raw[key]?.length) continue;
    out.push(`${key}:`, ...raw[key].map(r => `  ${r}`));
  }
  return out.join('\n') + '\n';
}

// 生の形から、遊べる形を作る。間違いがあれば例外を出す。
export function buildStage(raw) {
  if (raw.format !== FORMAT) throw new Error(`知らない形式の版です：${raw.format}`);
  const terrain = raw.terrain ?? [];
  if (terrain.length === 0) throw new Error('terrain がありません');
  const W = terrain[0].length;
  const H = terrain.length;
  for (const row of terrain) {
    if (row.length !== W) throw new Error('terrain の行の長さがそろっていません');
    for (const c of row) if (!TERRAIN_CHARS.has(c)) throw new Error(`terrain に使えない文字です：「${c}」`);
  }

  const open = { left: [], right: [], floor: [] };
  for (const line of raw.open ?? []) {
    const [side, ...nums] = line.split(/\s+/);
    if (!OPEN_SIDES.includes(side)) throw new Error(`open の書き方が違います：${line}`);
    for (const n of nums) {
      const v = Number(n);
      const max = side === 'floor' ? W : H;
      if (!Number.isInteger(v) || v < 0 || v >= max) throw new Error(`open の番号が器の外です：${line}`);
      if (!open[side].includes(v)) open[side].push(v);
    }
  }

  const pieces = [];
  if (raw.pieces?.length) {
    if (raw.pieces.length !== H || raw.pieces.some(r => r.length !== W)) {
      throw new Error('pieces の大きさが terrain と違います');
    }
    const byLetter = new Map();
    raw.pieces.forEach((row, y) => {
      [...row].forEach((c, x) => {
        if (c === '.') return;
        if (!/[a-z]/.test(c)) throw new Error(`pieces に使えない文字です：「${c}」`);
        if (terrain[y][x] === '#') throw new Error(`壁の上にピースがあります：(${x}, ${y})`);
        if (terrain[y][x] === '-') throw new Error(`器の外にピースがあります：(${x}, ${y})`);
        if (!byLetter.has(c)) byLetter.set(c, []);
        byLetter.get(c).push([x, y]);
      });
    });
    for (const [letter, cells] of byLetter) {
      const spec = raw.legend?.[letter];
      if (!spec) throw new Error(`legend に「${letter}」がありません`);
      const [mat, ...flags] = spec.split(/\s+/);
      checkMaterial(mat);
      checkVine(mat, cells, `pieces の「${letter}」`);
      checkHorn(mat, cells, `pieces の「${letter}」`);
      pieces.push({ mat, cells, fixed: flags.includes('fixed'), ...(mat === 'horn' ? { dir: flags.includes('left') ? -1 : 1 } : {}) });
    }
  }

  const hand = (raw.hand ?? []).map((line, i) => {
    const [mat, shape] = line.split(/\s+/);
    if (!shape) throw new Error(`hand の書き方が違います：${line}`);
    checkMaterial(mat);
    const cells = parseShape(shape);
    checkVine(mat, cells, `hand の ${i + 1} 番`);
    checkHorn(mat, cells, `hand の ${i + 1} 番`);
    return { mat, cells, orig: i };
  });

  const solution = (raw.solution ?? []).map(line => {
    const m = /^(\d+)\s+r(\d)\s+x(\d+)$/.exec(line.trim());
    if (!m) throw new Error(`solution の書き方が違います：${line}`);
    return { hand: Number(m[1]) - 1, r: Number(m[2]), x: Number(m[3]) };
  });

  return {
    id: raw.id ?? '',
    title: raw.title ?? '',
    request: raw.request ?? '',
    W,
    H,
    terrain,
    open,
    pieces,
    hand,
    solution,
    raw,
  };
}

export function parseStage(text) {
  return buildStage(parseStageText(text));
}

// つるは縦の棒（1〜3マス）だけ（中身の表のルール1）
function checkVine(mat, cells, where) {
  if (mat !== 'vine') return;
  const xs = new Set(cells.map(c => c[0]));
  const ys = cells.map(c => c[1]).sort((a, b) => a - b);
  const straight = xs.size === 1 && ys.every((y, k) => k === 0 || y === ys[k - 1] + 1);
  if (!straight || cells.length > 3) throw new Error(`つるは縦の棒（1〜3マス）だけです：${where}`);
}

// 角笛は1マス（中身の表のルール6）。口の向きは、手持ちなら落とすときの向き（r0 右・r1 左）、最初から置くなら legend の left（なければ右）
function checkHorn(mat, cells, where) {
  if (mat === 'horn' && cells.length !== 1) throw new Error(`角笛は1マスだけです：${where}`);
  if (mat === 'stone' && cells.length !== 1) throw new Error(`賢者の石は1マスだけです：${where}`);
}

function checkMaterial(key) {
  const m = material(key);
  if (!m.ready) throw new Error(`「${m.name}」（${key}）のルールはまだありません`);
}

// 枠があるか。side は 'left' | 'right'（y は行）か 'floor'（y の代わりに列）。stage でも状態（s）でもよい。
export function hasFrame(s, side, n) {
  return !s.open?.[side]?.includes(n);
}
