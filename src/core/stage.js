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
//   いちばん下の行のさらに下は床。左右の外は壁。
// pieces：最初から盤にある素材。同じ英小文字のマスが1つのピース。legend で素材を決める。
//   "fixed" を付けると動かない（枠側の氷など）。
// hand：手持ち。「素材 形」。形は shape.js の書き方。
// solution：狙いの手順。「手持ちの番号 r向き x列」（向きは時計回りに90度ずつ、列は左端が0）。
//   手持ちの番号は、hand に書いた順の1から。

import { material } from './materials.js';
import { parseShape } from './shape.js';

export const FORMAT = 1;
const TERRAIN_CHARS = new Set(['#', '.', '+', 'G', 'L']);
const BLOCKS = new Set(['terrain', 'pieces', 'legend', 'hand', 'solution']);

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
  for (const key of ['terrain', 'pieces']) {
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
        if (!byLetter.has(c)) byLetter.set(c, []);
        byLetter.get(c).push([x, y]);
      });
    });
    for (const [letter, cells] of byLetter) {
      const spec = raw.legend?.[letter];
      if (!spec) throw new Error(`legend に「${letter}」がありません`);
      const [mat, ...flags] = spec.split(/\s+/);
      checkMaterial(mat);
      pieces.push({ mat, cells, fixed: flags.includes('fixed') });
    }
  }

  const hand = (raw.hand ?? []).map((line, i) => {
    const [mat, shape] = line.split(/\s+/);
    if (!shape) throw new Error(`hand の書き方が違います：${line}`);
    checkMaterial(mat);
    return { mat, cells: parseShape(shape), orig: i };
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
    pieces,
    hand,
    solution,
    raw,
  };
}

export function parseStage(text) {
  return buildStage(parseStageText(text));
}

function checkMaterial(key) {
  const m = material(key);
  if (!m.ready) throw new Error(`「${m.name}」（${key}）のルールはまだありません`);
}
