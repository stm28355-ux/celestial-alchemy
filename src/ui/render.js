import { drawIcon } from './icons.js';

// 盤面の描画（試作の見た目。フェーズ9で作り直す）。
// 素材の色は企画まとめの「素材の色とアイコン」に合わせる。アイコンの代わりに、いまは短い呼び名の1文字を書く。

export const LOOK = {
  lead: { fill: '#565b69', ink: '#eceef3', glyph: '鉛' },
  gold: { fill: '#e6b422', ink: '#5a3d00', glyph: '金' },
  fire: { fill: '#f0882a', ink: '#fff6e8', glyph: '火' },
  ice: { fill: '#cdeefa', ink: '#2b6c80', glyph: '鱗' },
  water: { fill: '#2f62c8', ink: '#e8f0ff', glyph: '水' },
  vine: { fill: '#3f9b4c', ink: '#effbe9', glyph: 'つ' },
  slime: { fill: '#f6a3cb', ink: '#7a2150', glyph: 'ゼ' },
  sand: { fill: '#5d3f9a', ink: '#f1e9ff', glyph: '星' },
  horn: { fill: '#efe2c2', ink: '#6b5428', glyph: '角' },
  stone: { fill: '#a5123c', ink: '#ffe9ef', glyph: '石' },
};

const WOOD = '#8a5a36';
const WOOD_DARK = '#6a4327';
const INSIDE = '#fbf3e3';
const INSIDE_FREE = '#f1e6cf';
const RUNE = '#c8a46a';
const EDGE = 'rgba(40, 28, 18, 0.75)';

// 落とす前のピースと器の口の間に空ける高さ（マス数）。くっついて見えないように。
export const SPAWN_GAP = 0.7;

// 盤面の置き場所（マスの大きさと、盤の左上）。spawnRows は盤の上に空けておく行の数（落とす前のピース用）。
export function layout(stage, spawnRows, cell) {
  const frame = Math.round(cell * 0.35);
  const top = Math.round((spawnRows + SPAWN_GAP) * cell + cell * 0.15);
  return {
    cell,
    frame,
    left: frame,
    top,
    width: stage.W * cell + frame * 2,
    height: top + stage.H * cell + frame,
  };
}

// view: { stage, pieces, lift: Map(id → 上にずらすマス数), flash: Set(id), ghost, preview, invalid, icons }
export function draw(ctx, L, view) {
  const { stage } = view;
  const c = L.cell;
  ctx.clearRect(0, 0, L.width, L.height);

  // 器の外枠（左右と底）と、口のふち
  ctx.fillStyle = WOOD;
  ctx.fillRect(0, L.top, L.frame, stage.H * c + L.frame);
  ctx.fillRect(L.left + stage.W * c, L.top, L.frame, stage.H * c + L.frame);
  ctx.fillRect(0, L.top + stage.H * c, L.width, L.frame);
  ctx.fillStyle = WOOD_DARK;
  ctx.fillRect(0, L.top - 3, L.frame, 3);
  ctx.fillRect(L.left + stage.W * c, L.top - 3, L.frame, 3);

  // 器の中：空きマス・目標マス・壁
  for (let y = 0; y < stage.H; y++) {
    for (let x = 0; x < stage.W; x++) {
      const t = stage.terrain[y][x];
      const px = L.left + x * c, py = L.top + y * c;
      if (t === '#') {
        ctx.fillStyle = WOOD;
        ctx.fillRect(px, py, c, c);
        ctx.strokeStyle = WOOD_DARK;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, c - 1, c - 1);
        continue;
      }
      ctx.fillStyle = t === '.' ? INSIDE_FREE : INSIDE;
      ctx.fillRect(px, py, c, c);
      ctx.strokeStyle = 'rgba(120, 90, 50, 0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, c - 1, c - 1);
      if (t === '+' || t === 'G' || t === 'L') drawRune(ctx, px, py, c, t);
    }
  }

  // 落とす前のピースから着地点の影まで、薄い帯で列を示す
  if (view.preview && view.ghost && !view.invalid) {
    const xs = view.preview.cells.map(([x]) => x);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1;
    const yTop = L.top - SPAWN_GAP * c;
    const yBottom = L.top + Math.min(...view.ghost.cells.map(([, y]) => y)) * c;
    ctx.fillStyle = 'rgba(217, 130, 43, 0.08)';
    ctx.fillRect(L.left + x0 * c, yTop, (x1 - x0) * c, yBottom - yTop);
  }

  // ピース
  for (const p of view.pieces) {
    const lift = view.lift?.get(p.id) ?? 0;
    drawPiece(ctx, L, p.cells, p.mat, { lift, fixed: p.fixed, flash: view.flash?.has(p.id) ? view.flashAlpha ?? 0.7 : 0, icons: view.icons });
  }

  // 着地点の影
  if (view.ghost) drawPiece(ctx, L, view.ghost.cells, view.ghost.mat, { ghost: true });

  // 落とす前のピース（器の口から少し上に浮かせる）
  if (view.preview) drawPiece(ctx, L, view.preview.cells, view.preview.mat, { invalid: view.invalid, lift: SPAWN_GAP, icons: view.icons });
}

function drawRune(ctx, px, py, c, t) {
  ctx.save();
  ctx.strokeStyle = t === 'G' ? '#d9a514' : t === 'L' ? '#565b69' : RUNE;
  ctx.lineWidth = Math.max(1.5, c * 0.04);
  ctx.setLineDash([c * 0.09, c * 0.07]);
  ctx.beginPath();
  ctx.arc(px + c / 2, py + c / 2, c * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(px + c / 2, py + c / 2, c * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// cells は盤のマス座標（y が負なら盤の上）。lift は上にずらすマス数（落ちていく途中の見せ方）。
// icons: true で、1文字の代わりにアイコン（試し描き）を描く。
export function drawPiece(ctx, L, cells, mat, { lift = 0, fixed = false, flash = 0, ghost = false, invalid = false, icons = false } = {}) {
  const c = L.cell;
  const look = LOOK[mat];
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const pos = (x, y) => [L.left + x * c, L.top + (y - lift) * c];
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.32;
  for (const [x, y] of cells) {
    const [px, py] = pos(x, y);
    ctx.fillStyle = invalid ? '#d9534f' : look.fill;
    ctx.fillRect(px, py, c, c);
    if (!ghost && icons && !invalid) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(px + 2, py + 2, c - 4, c * 0.16);
      drawIcon(ctx, mat, px, py, c);
    } else if (!ghost) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(px + 2, py + 2, c - 4, c * 0.22);
      ctx.fillStyle = invalid ? '#fff' : look.ink;
      ctx.font = `bold ${Math.round(c * 0.42)}px "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(look.glyph, px + c / 2, py + c / 2 + 1);
    }
    if (fixed) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, c, c);
      ctx.clip();
      ctx.strokeStyle = 'rgba(43, 108, 128, 0.35)';
      ctx.lineWidth = 2;
      for (let k = -c; k < c; k += c / 4) {
        ctx.beginPath();
        ctx.moveTo(px + k, py + c);
        ctx.lineTo(px + k + c, py);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (flash) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flash})`;
      ctx.fillRect(px, py, c, c);
    }
  }
  // ピースのまとまりが分かるように、外側のふちだけを太く描く
  ctx.globalAlpha = ghost ? 0.9 : 1;
  ctx.strokeStyle = ghost ? look.fill : EDGE;
  ctx.lineWidth = ghost ? 2 : Math.max(2, c * 0.06);
  if (ghost) ctx.setLineDash([c * 0.12, c * 0.08]);
  ctx.beginPath();
  for (const [x, y] of cells) {
    const [px, py] = pos(x, y);
    if (!set.has(`${x},${y - 1}`)) { ctx.moveTo(px, py); ctx.lineTo(px + c, py); }
    if (!set.has(`${x},${y + 1}`)) { ctx.moveTo(px, py + c); ctx.lineTo(px + c, py + c); }
    if (!set.has(`${x - 1},${y}`)) { ctx.moveTo(px, py); ctx.lineTo(px, py + c); }
    if (!set.has(`${x + 1},${y}`)) { ctx.moveTo(px + c, py); ctx.lineTo(px + c, py + c); }
  }
  ctx.stroke();
  ctx.restore();
}

// 手持ちの小さな絵
export function drawMini(canvas, cells, mat, cell = 16, dim = false) {
  const w = Math.max(...cells.map(c => c[0])) + 1;
  const h = Math.max(...cells.map(c => c[1])) + 1;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = (w * cell + 4) * dpr;
  canvas.height = (h * cell + 4) * dpr;
  canvas.style.width = `${w * cell + 4}px`;
  canvas.style.height = `${h * cell + 4}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvas.style.opacity = dim ? '0.25' : '1';
  drawPiece(ctx, { cell, left: 2, top: 2 }, cells, mat);
}
