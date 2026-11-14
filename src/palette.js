// 素材の色の試し描きページ（palette.html）。

import { PALETTE } from './ui/icons.js';
import { draw, drawPiece, layout } from './ui/render.js';

const ORDER = ['lead', 'gold', 'fire', 'ice', 'water', 'vine', 'slime', 'sand', 'horn', 'stone'];

// 1. 10種類
const tiles = document.querySelector('#tiles');
for (const mat of ORDER) {
  const p = PALETTE[mat];
  const box = document.createElement('div');
  box.className = 'tile';
  const cv = document.createElement('canvas');
  const ctx = setup(cv, 88, 88);
  drawPiece(ctx, { cell: 72, left: 8, top: 8 }, [[0, 0]], mat, { icons: true });
  box.append(cv);
  box.insertAdjacentHTML('beforeend', `<b>${p.name}</b><span>${p.short ?? p.name}・${p.color}<br>${PALETTE[mat].fill}</span>`);
  tiles.append(box);
}

// 2. 器に入れたところ
const vessel = {
  W: 8,
  H: 5,
  terrain: ['........', '..++GL..', '++++++++', '++++++++', '++++++++'],
};
const pieces = [
  { mat: 'ice', cells: [[0, 4], [1, 4]] },
  { mat: 'water', cells: [[2, 4], [3, 4]] },
  { mat: 'slime', cells: [[4, 4], [5, 4]] },
  { mat: 'sand', cells: [[6, 4], [7, 4]] },
  { mat: 'fire', cells: [[0, 3]] },
  { mat: 'stone', cells: [[1, 3]] },
  { mat: 'lead', cells: [[2, 3], [3, 3], [3, 2]] },
  { mat: 'horn', cells: [[4, 3]] },
  { mat: 'gold', cells: [[5, 3], [6, 3]] },
  { mat: 'vine', cells: [[7, 3], [7, 2]] },
  { mat: 'ice', cells: [[0, 2]], fixed: true },
  { mat: 'water', cells: [[1, 2]] },
  { mat: 'fire', cells: [[2, 2]] },
  { mat: 'slime', cells: [[5, 2]] },
  { mat: 'sand', cells: [[6, 2]] },
].map((p, i) => ({ id: i + 1, fixed: false, ...p }));

for (const [id, icons] of [['vessel-icons', true], ['vessel-glyph', false], ['v-gray', true], ['v-protan', true], ['v-deutan', true]]) {
  const L = layout(vessel, 0, id.startsWith('v-') ? 40 : 52);
  const ctx = setup(document.querySelector(`#${id}`), L.width, L.height);
  draw(ctx, L, { stage: vessel, pieces, icons });
}

// 3. 色が近い3組
const pairs = document.querySelector('#pairs');
for (const [a, b] of [['ice', 'water'], ['slime', 'sand'], ['fire', 'stone']]) {
  const fig = document.createElement('figure');
  const cv = document.createElement('canvas');
  const ctx = setup(cv, 220, 110);
  const sq = [[0, 0], [1, 0], [0, 1], [1, 1]];
  drawPiece(ctx, { cell: 48, left: 6, top: 7 }, sq, a, { icons: true });
  drawPiece(ctx, { cell: 48, left: 114, top: 7 }, sq, b, { icons: true });
  fig.append(cv);
  fig.insertAdjacentHTML('beforeend', `<figcaption>${PALETTE[a].short}（${PALETTE[a].color}）と ${PALETTE[b].short}（${PALETTE[b].color}）</figcaption>`);
  pairs.append(fig);
}

function setup(canvas, w, h) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
