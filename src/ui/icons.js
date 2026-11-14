// 素材のアイコン（試し描き1回目）。1マスの中に、線と面だけで描く。
// 色は企画まとめの「素材の色とアイコン」に合わせる。色が近くても形で見分けられるようにする。

export const PALETTE = {
  lead: { fill: '#565b69', ink: '#c9ced9', deep: '#3d414c', name: '鉛', color: '濃い灰色' },
  gold: { fill: '#e6b422', ink: '#fff3c2', deep: '#a77b06', name: '金', color: '黄金色' },
  fire: { fill: '#f0882a', ink: '#fff1d6', deep: '#c45a10', name: 'サラマンダーの火種', short: '火種', color: 'オレンジ' },
  ice: { fill: '#cdeefa', ink: '#ffffff', deep: '#6fb6cf', name: '氷竜の鱗', short: '鱗', color: '白に近い水色' },
  water: { fill: '#2f62c8', ink: '#cfe0ff', deep: '#1d3f8a', name: 'ウンディーネの水玉', short: '水玉', color: '濃い青' },
  vine: { fill: '#3f9b4c', ink: '#d8f5c9', deep: '#286a33', name: 'ドリアードのつる', short: 'つる', color: '緑' },
  slime: { fill: '#f6a3cb', ink: '#fff0f7', deep: '#d0679b', name: 'スライムゼリー', short: 'ゼリー', color: '明るいピンク' },
  sand: { fill: '#5d3f9a', ink: '#f3e8ff', deep: '#3d2670', name: 'ヘルメスの星砂', short: '星砂', color: '濃い紫' },
  horn: { fill: '#efe2c2', ink: '#8a6a35', deep: '#c9b17d', name: 'シルフの角笛', short: '角笛', color: '象牙色' },
  stone: { fill: '#a5123c', ink: '#ffd6e2', deep: '#6d0624', name: '賢者の石', short: '賢者の石', color: '深紅' },
};

// (x, y) はマスの左上、s はマスの大きさ。
export function drawIcon(ctx, mat, x, y, s) {
  const p = PALETTE[mat];
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const lw = Math.max(1.5, s * 0.06);
  ICONS[mat]?.(ctx, s, p, lw);
  ctx.restore();
}

const ICONS = {
  // 重りの形の地金
  lead(ctx, s, p, lw) {
    ctx.fillStyle = p.deep;
    trapezoid(ctx, s * 0.22, s * 0.38, s * 0.78, s * 0.72, s * 0.1);
    ctx.fill();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = lw;
    trapezoid(ctx, s * 0.22, s * 0.38, s * 0.78, s * 0.72, s * 0.1);
    ctx.stroke();
    line(ctx, s * 0.36, s * 0.48, s * 0.64, s * 0.48);
  },
  // 光る地金と、きらめき
  gold(ctx, s, p, lw) {
    ctx.fillStyle = p.ink;
    trapezoid(ctx, s * 0.2, s * 0.42, s * 0.74, s * 0.76, s * 0.1);
    ctx.fill();
    ctx.strokeStyle = p.deep;
    ctx.lineWidth = lw;
    trapezoid(ctx, s * 0.2, s * 0.42, s * 0.74, s * 0.76, s * 0.1);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    sparkle(ctx, s * 0.74, s * 0.26, s * 0.14);
  },
  // トカゲのしっぽのように巻いた炎
  fire(ctx, s, p, lw) {
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.16);
    ctx.bezierCurveTo(s * 0.62, s * 0.34, s * 0.8, s * 0.44, s * 0.76, s * 0.62);
    ctx.bezierCurveTo(s * 0.72, s * 0.8, s * 0.6, s * 0.86, s * 0.5, s * 0.86);
    ctx.bezierCurveTo(s * 0.34, s * 0.86, s * 0.22, s * 0.74, s * 0.24, s * 0.58);
    ctx.bezierCurveTo(s * 0.26, s * 0.46, s * 0.36, s * 0.42, s * 0.38, s * 0.3);
    ctx.bezierCurveTo(s * 0.44, s * 0.38, s * 0.46, s * 0.44, s * 0.44, s * 0.5);
    ctx.bezierCurveTo(s * 0.5, s * 0.4, s * 0.52, s * 0.28, s * 0.5, s * 0.16);
    ctx.fill();
    ctx.fillStyle = p.deep;
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.7, s * 0.1, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  // 竜の鱗（上が丸く、下がとがった盾の形）と、まん中の筋
  ice(ctx, s, p, lw) {
    const shield = (k, dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(s * (0.5 - 0.3 * k) + dx, s * (0.4 - 0.04 * k) + dy);
      ctx.quadraticCurveTo(s * 0.5 + dx, s * (0.4 - 0.36 * k) + dy, s * (0.5 + 0.3 * k) + dx, s * (0.4 - 0.04 * k) + dy);
      ctx.quadraticCurveTo(s * (0.5 + 0.28 * k) + dx, s * (0.4 + 0.3 * k) + dy, s * 0.5 + dx, s * (0.4 + 0.46 * k) + dy);
      ctx.quadraticCurveTo(s * (0.5 - 0.28 * k) + dx, s * (0.4 + 0.3 * k) + dy, s * (0.5 - 0.3 * k) + dx, s * (0.4 - 0.04 * k) + dy);
      ctx.closePath();
    };
    ctx.fillStyle = p.deep;
    shield(1, 0, s * 0.02);
    ctx.fill();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = lw;
    shield(0.62, 0, s * 0.02);
    ctx.stroke();
    line(ctx, s * 0.5, s * 0.22, s * 0.5, s * 0.74);
  },
  // しずくと、光
  water(ctx, s, p, lw) {
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.16);
    ctx.bezierCurveTo(s * 0.6, s * 0.34, s * 0.76, s * 0.48, s * 0.76, s * 0.62);
    ctx.arc(s * 0.5, s * 0.62, s * 0.26, 0, Math.PI);
    ctx.bezierCurveTo(s * 0.24, s * 0.48, s * 0.4, s * 0.34, s * 0.5, s * 0.16);
    ctx.fill();
    ctx.fillStyle = p.fill;
    ctx.beginPath();
    ctx.ellipse(s * 0.42, s * 0.62, s * 0.06, s * 0.1, -0.4, 0, Math.PI * 2);
    ctx.fill();
  },
  // 巻きひげのある葉
  vine(ctx, s, p, lw) {
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = lw * 1.2;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.92);
    ctx.bezierCurveTo(s * 0.46, s * 0.7, s * 0.56, s * 0.5, s * 0.5, s * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * 0.62, s * 0.26, s * 0.1, Math.PI, Math.PI * 2.6);
    ctx.stroke();
    ctx.fillStyle = p.ink;
    leaf(ctx, s * 0.5, s * 0.6, s * 0.26, -0.6);
    leaf(ctx, s * 0.5, s * 0.46, s * 0.22, Math.PI + 0.6);
  },
  // ぷるぷるのかたまり
  slime(ctx, s, p, lw) {
    ctx.fillStyle = p.deep;
    ctx.beginPath();
    ctx.moveTo(s * 0.18, s * 0.78);
    ctx.bezierCurveTo(s * 0.16, s * 0.46, s * 0.3, s * 0.24, s * 0.5, s * 0.24);
    ctx.bezierCurveTo(s * 0.7, s * 0.24, s * 0.84, s * 0.46, s * 0.82, s * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.ellipse(s * 0.38, s * 0.4, s * 0.07, s * 0.04, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.3, s * 0.52, s * 0.025, 0, Math.PI * 2);
    ctx.fill();
  },
  // 星の形の粒
  sand(ctx, s, p) {
    ctx.fillStyle = p.ink;
    star(ctx, s * 0.34, s * 0.36, s * 0.14);
    star(ctx, s * 0.68, s * 0.5, s * 0.11);
    star(ctx, s * 0.4, s * 0.72, s * 0.09);
    star(ctx, s * 0.74, s * 0.8, s * 0.06);
  },
  // 角笛（細い先が左下、広い口が右）と、口から出る風（口は右向き）
  horn(ctx, s, p, lw) {
    ctx.fillStyle = p.deep;
    ctx.beginPath();
    ctx.moveTo(s * 0.12, s * 0.7);
    ctx.quadraticCurveTo(s * 0.36, s * 0.72, s * 0.62, s * 0.74);
    ctx.quadraticCurveTo(s * 0.68, s * 0.52, s * 0.62, s * 0.28);
    ctx.quadraticCurveTo(s * 0.34, s * 0.46, s * 0.12, s * 0.7);
    ctx.fill();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(s * 0.63, s * 0.51, s * 0.06, s * 0.23, 0, 0, Math.PI * 2);
    ctx.stroke();
    line(ctx, s * 0.36, s * 0.5, s * 0.38, s * 0.72);
    line(ctx, s * 0.76, s * 0.38, s * 0.9, s * 0.34);
    line(ctx, s * 0.78, s * 0.52, s * 0.94, s * 0.52);
    line(ctx, s * 0.76, s * 0.66, s * 0.9, s * 0.7);
  },
  // カットした宝石
  stone(ctx, s, p, lw) {
    const pts = [[0.5, 0.16], [0.82, 0.38], [0.7, 0.82], [0.3, 0.82], [0.18, 0.38]];
    ctx.fillStyle = p.deep;
    poly(ctx, pts.map(([a, b]) => [a * s, b * s]));
    ctx.fill();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = lw;
    poly(ctx, pts.map(([a, b]) => [a * s, b * s]));
    ctx.stroke();
    line(ctx, s * 0.18, s * 0.38, s * 0.82, s * 0.38);
    line(ctx, s * 0.5, s * 0.16, s * 0.38, s * 0.38);
    line(ctx, s * 0.5, s * 0.16, s * 0.62, s * 0.38);
    line(ctx, s * 0.38, s * 0.38, s * 0.5, s * 0.82);
    line(ctx, s * 0.62, s * 0.38, s * 0.5, s * 0.82);
  },
};

function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function trapezoid(ctx, x0, y0, x1, y1, inset) {
  ctx.beginPath();
  ctx.moveTo(x0 + inset, y0);
  ctx.lineTo(x1 - inset, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x0, y1);
  ctx.closePath();
}

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function sparkle(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.fill();
}

function leaf(ctx, x, y, len, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
  ctx.fill();
  ctx.restore();
}
