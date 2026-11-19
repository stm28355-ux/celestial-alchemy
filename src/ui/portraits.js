// 立ち絵（胸から上）。SVG を文字で持つ。明るいページに合わせて、やわらかい色・細い線・丸い顔。
// 2026-11-19 見本：ノエル・サトゥル・ソレイユ。人が見て OK なら、残りの6人も同じ描き方で足す。

const INK = '#5a4632';
const SKIN = '#fde6cf';
const CHEEK = '#f6b6a8';

// 共通の顔（目・ほお・口）。eye は目の形：'round' 丸い目、'smile' 笑った目（への字）、'calm' 少し細い目
function face(cx, cy, { eye = 'round', mouth = 'smile', gap = 13 } = {}) {
  const eyes = [cx - gap, cx + gap]
    .map(x => {
      if (eye === 'smile') return `<path d="M${x - 5} ${cy + 1} q5 -6 10 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
      if (eye === 'calm') return `<path d="M${x - 5} ${cy} q5 4 10 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
      return `<ellipse cx="${x}" cy="${cy}" rx="3.6" ry="4.6" fill="${INK}"/><circle cx="${x + 1.2}" cy="${cy - 1.6}" r="1.3" fill="#fff"/>`;
    })
    .join('');
  const cheeks = `<ellipse cx="${cx - gap - 4}" cy="${cy + 9}" rx="5" ry="3" fill="${CHEEK}" opacity="0.7"/><ellipse cx="${cx + gap + 4}" cy="${cy + 9}" rx="5" ry="3" fill="${CHEEK}" opacity="0.7"/>`;
  const m =
    mouth === 'open'
      ? `<path d="M${cx - 5} ${cy + 13} q5 7 10 0 z" fill="#c9605a" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`
      : mouth === 'flat'
        ? `<path d="M${cx - 4} ${cy + 15} h8" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`
        : `<path d="M${cx - 5} ${cy + 13} q5 5 10 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
  return eyes + cheeks + m;
}

function frame(bg, ring, body) {
  return `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" role="img">
  <defs><clipPath id="pc"><rect x="0" y="0" width="160" height="160" rx="22"/></clipPath></defs>
  <g clip-path="url(#pc)">
    <rect width="160" height="160" fill="${bg}"/>
    <circle cx="80" cy="74" r="58" fill="${ring}"/>
    ${body}
  </g>
</svg>`;
}

export const PORTRAITS = {
  // 主人公：見習い錬金術師。明るく、好奇心が強い。学院の上着と、光る小びん
  ノエル: frame(
    '#fff1dc',
    '#ffe2b8',
    `
    <path d="M30 160 q4 -42 50 -46 q46 4 50 46 z" fill="#3f8f9a" stroke="${INK}" stroke-width="2"/>
    <path d="M62 116 l18 18 l18 -18" fill="#fff8ec" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M70 126 l10 8 l10 -8 l-4 10 h-12 z" fill="#d9822b" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="72" y="100" width="16" height="18" rx="6" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
    <ellipse cx="80" cy="72" rx="31" ry="33" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
    <path d="M47 76 q-6 -40 33 -44 q40 0 34 42 q-6 -16 -16 -22 q-8 10 -26 10 q6 -6 6 -12 q-12 14 -31 26 z" fill="#c0703f" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M88 34 q10 -12 6 -20 q14 8 4 22" fill="#c0703f" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    ${face(80, 76, { eye: 'round', mouth: 'open' })}
    <g transform="translate(114 112) rotate(12)">
      <path d="M-6 -14 h12 v8 l9 16 a10 10 0 0 1 -9 14 h-12 a10 10 0 0 1 -9 -14 l9 -16 z" fill="#e8f6ff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M-13 6 h26 l2 4 a10 10 0 0 1 -9 14 h-12 a10 10 0 0 1 -9 -14 z" fill="#7fd0c4"/>
      <rect x="-7" y="-19" width="14" height="6" rx="2" fill="#b98a5a" stroke="${INK}" stroke-width="2"/>
      <circle cx="-3" cy="12" r="2" fill="#fff"/>
    </g>
    <circle cx="128" cy="92" r="2.5" fill="#ffd34d"/><circle cx="136" cy="100" r="1.8" fill="#ffd34d"/><circle cx="122" cy="84" r="1.6" fill="#ffd34d"/>
    <ellipse cx="111" cy="128" rx="9" ry="7" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
  `,
  ),

  // 1章 土星：時間にきびしい老人。砂時計を持つ。鉛の色に近い、落ち着いた藍のローブ
  サトゥル: frame(
    '#eef0f6',
    '#dde2ef',
    `
    <path d="M26 160 q4 -44 54 -48 q50 4 54 48 z" fill="#5c6690" stroke="${INK}" stroke-width="2"/>
    <path d="M66 114 q14 8 28 0 l-4 46 h-20 z" fill="#8e98c2" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="80" cy="70" rx="30" ry="32" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
    <path d="M54 52 q-12 2 -10 14 q-7 6 -2 14 q4 6 12 2 z M106 52 q12 2 10 14 q7 6 2 14 q-4 6 -12 2 z" fill="#f4f1ea" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    ${face(80, 72, { eye: 'calm', mouth: 'flat' })}
    <path d="M56 82 q-2 36 24 46 q26 -10 24 -46 q-8 8 -24 8 q-16 0 -24 -8 z" fill="#f7f4ee" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M70 92 q10 -6 20 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
    <path d="M60 64 q7 -6 14 -2 M86 62 q7 -4 14 2" fill="none" stroke="#e6e2da" stroke-width="5" stroke-linecap="round"/>
    <path d="M60 64 q7 -6 14 -2 M86 62 q7 -4 14 2" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="67" cy="72" r="8" fill="none" stroke="#b08a3e" stroke-width="1.8"/><circle cx="93" cy="72" r="8" fill="none" stroke="#b08a3e" stroke-width="1.8"/><path d="M75 72 h10" stroke="#b08a3e" stroke-width="1.8"/>
    <g transform="translate(122 118)">
      <rect x="-14" y="-24" width="28" height="5" rx="2" fill="#a0703e" stroke="${INK}" stroke-width="2"/>
      <rect x="-14" y="19" width="28" height="5" rx="2" fill="#a0703e" stroke="${INK}" stroke-width="2"/>
      <path d="M-10 -19 q0 12 10 19 q-10 7 -10 19 h20 q0 -12 -10 -19 q10 -7 10 -19 z" fill="#f2fbff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M-6 -12 h12 q-2 6 -6 10 q-4 -4 -6 -10 z M-8 17 q8 -10 16 0 z" fill="#e6b84a"/>
      <path d="M0 0 v14" stroke="#e6b84a" stroke-width="1.4" stroke-dasharray="2 2"/>
    </g>
    <ellipse cx="108" cy="130" rx="9" ry="7" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
  `,
  ),

  // 7章 太陽：すべての錬金術師の長。明るく温かい。後ろに太陽の輪、金の髪と白と金の衣
  ソレイユ: frame(
    '#fff6d8',
    '#ffe48a',
    `
    <g stroke="#f2b31b" stroke-width="5" stroke-linecap="round" opacity="0.9">
      ${Array.from({ length: 12 }, (_, k) => {
        const a = (k * Math.PI) / 6;
        const x1 = 80 + Math.cos(a) * 62, y1 = 74 + Math.sin(a) * 62, x2 = 80 + Math.cos(a) * 74, y2 = 74 + Math.sin(a) * 74;
        return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
      }).join('')}
    </g>
    <path d="M44 84 q-10 30 -4 60 h80 q6 -30 -4 -60 z" fill="#f0c03a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M28 160 q4 -42 52 -46 q48 4 52 46 z" fill="#fffaf0" stroke="${INK}" stroke-width="2"/>
    <path d="M58 118 q22 18 44 0 l6 42 h-56 z" fill="#f0c03a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="80" cy="136" r="7" fill="#fff3c4" stroke="${INK}" stroke-width="1.8"/><circle cx="80" cy="136" r="2.2" fill="#d99a00"/>
    <rect x="72" y="100" width="16" height="16" rx="6" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
    <ellipse cx="80" cy="72" rx="30" ry="32" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
    <path d="M48 80 q-6 -46 32 -46 q38 0 32 46 q-6 -22 -20 -26 q-12 10 -30 8 q-10 4 -14 18 z" fill="#f0c03a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M60 42 l6 -14 l8 10 l6 -14 l6 14 l8 -10 l6 14 z" fill="#ffd84d" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="80" cy="36" r="3" fill="#e2574c"/>
    ${face(80, 76, { eye: 'smile', mouth: 'smile' })}
  `,
  ),
};
