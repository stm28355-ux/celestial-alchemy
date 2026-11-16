// ピースの形。マスは [x, y] の並びで、y は下向き。いつも左上が (0, 0) になるようにそろえる。
// テキストでは行を "/" で区切り、"#" がマス、"." が空き（例："##/#."）。

export function parseShape(text) {
  const cells = [];
  text.trim().split('/').forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '#') cells.push([x, y]);
      else if (c !== '.') throw new Error(`形に使えない文字です：「${c}」（${text}）`);
    });
  });
  if (cells.length === 0) throw new Error(`マスのない形です：${text}`);
  return normalize(cells);
}

export function normalize(cells) {
  const minX = Math.min(...cells.map(c => c[0]));
  const minY = Math.min(...cells.map(c => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

// 時計回りに r 回、90度まわす。
export function rotate(cells, r) {
  let out = cells;
  for (let i = 0; i < ((r % 4) + 4) % 4; i++) out = out.map(([x, y]) => [-y, x]);
  return normalize(out);
}

// 同じ形（同じ配列）は何度も聞かれるので、覚えておく（ソルバーで多く呼ばれる）
const sizeMemo = new WeakMap();
export function size(cells) {
  let v = sizeMemo.get(cells);
  if (!v) {
    let w = 0, h = 0;
    for (const [x, y] of cells) {
      if (x + 1 > w) w = x + 1;
      if (y + 1 > h) h = y + 1;
    }
    v = { w, h };
    sizeMemo.set(cells, v);
  }
  return v;
}

export function shapeKey(cells) {
  return cells.map(([x, y]) => `${x},${y}`).join(';');
}

export function shapeText(cells) {
  const { w, h } = size(cells);
  const rows = Array.from({ length: h }, () => Array(w).fill('.'));
  for (const [x, y] of cells) rows[y][x] = '#';
  return rows.map(r => r.join('')).join('/');
}

// 向きの違いで形が変わるものだけを返す（正方形なら1つ）。
export function uniqueRotations(cells) {
  const seen = new Set();
  const out = [];
  for (let r = 0; r < 4; r++) {
    const c = rotate(cells, r);
    const k = shapeKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ r, cells: c });
  }
  return out;
}

// 回転しても同じ形なら同じ値になる。手持ちの同じピースをまとめるのに使う。
export function canonicalKey(cells) {
  return [0, 1, 2, 3].map(r => shapeKey(rotate(cells, r))).sort()[0];
}
