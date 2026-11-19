// 立ち絵（胸から上）。SVG を文字で持つ。明るいページに合わせて、やわらかい色・細い線・丸い顔。
// 2026-11-19 見本3人（ノエル・サトゥル・ソレイユ）を人が見て OK。残りの6人も同じ描き方で描いた。

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

// clipPath の id は絵ごとに変える（同じページに何枚も並べるため）
let clipNo = 0;
function frame(bg, ring, body) {
  const id = `pc${++clipNo}`;
  return `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" role="img">
  <defs><clipPath id="${id}"><rect x="0" y="0" width="160" height="160" rx="22"/></clipPath></defs>
  <g clip-path="url(#${id})">
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
  // 0章：土の精ノーム。小さくて物知り。とがった土色の帽子、丸い鼻、本を持つ
  ノーム先生: frame(
    '#eef6e4',
    '#d9ebc4',
    `
    <path d="M34 160 q4 -38 46 -42 q42 4 46 42 z" fill="#7a9a4a" stroke="${INK}" stroke-width="2"/>
    <ellipse cx="80" cy="84" rx="28" ry="27" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
    ${face(80, 84, { eye: 'round', mouth: 'smile', gap: 11 })}
    <path d="M58 98 q22 30 44 0 q-6 8 -22 8 q-16 0 -22 -8 z" fill="#b98a5a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="80" cy="92" rx="7" ry="6" fill="#f6c3a8" stroke="${INK}" stroke-width="2"/>
    <path d="M46 70 q34 -12 68 0 l-4 -6 q-22 -52 -40 -56 q-6 30 -20 56 z" fill="#a8743f" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M48 68 q32 -10 64 0" fill="none" stroke="#7a5228" stroke-width="5" stroke-linecap="round"/>
    <circle cx="70" cy="10" r="5" fill="#ffd34d" stroke="${INK}" stroke-width="1.8"/>
    <g transform="translate(116 124) rotate(-10)">
      <rect x="-16" y="-12" width="32" height="24" rx="3" fill="#c0503f" stroke="${INK}" stroke-width="2"/>
      <path d="M-12 -8 h24 v16 h-24 z" fill="#fff8ec" stroke="${INK}" stroke-width="1.2"/>
      <path d="M0 -8 v16" stroke="${INK}" stroke-width="1.4"/>
      <path d="M-9 -3 h6 M-9 1 h6 M3 -3 h6 M3 1 h6" stroke="#c8a46a" stroke-width="1.2"/>
    </g>
  `,
  ),

  // 2章 火星：無口な鍛冶師。大きな金槌。赤茶の前掛けと、額の布
  マルタ: frame(
    '#fdeee8',
    '#f8d3c4',
    `
    <g transform="translate(118 70) rotate(28)">
      <rect x="-3.5" y="-6" width="7" height="72" rx="3" fill="#a0703e" stroke="${INK}" stroke-width="2"/>
      <rect x="-16" y="-20" width="32" height="18" rx="3" fill="#8a8f9c" stroke="${INK}" stroke-width="2"/>
      <path d="M-12 -16 h24" stroke="#c6cbd6" stroke-width="2"/>
    </g>
    <path d="M28 160 q4 -42 52 -46 q48 4 52 46 z" fill="#d9e0ea" stroke="${INK}" stroke-width="2"/>
    <path d="M56 124 h48 l6 36 h-60 z" fill="#b5523a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M60 124 l-8 -10 M100 124 l8 -10" stroke="#b5523a" stroke-width="5" stroke-linecap="round"/>
    <rect x="72" y="100" width="16" height="16" rx="6" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
    <ellipse cx="80" cy="72" rx="30" ry="32" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
    <path d="M50 70 q-4 -36 30 -38 q34 2 30 38 q-4 -14 -10 -18 h-40 q-6 4 -10 18 z" fill="#3e3a44" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M50 58 q30 -10 60 0 l-1 7 q-29 -9 -58 0 z" fill="#e2574c" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M110 60 l10 6 l-4 8 z" fill="#e2574c" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M62 68 h10 M88 68 h10" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
    ${face(80, 76, { eye: 'calm', mouth: 'flat' })}
  `,
  ),

  // 3章 木星：陽気で大らかな庭師。麦わら帽子に葉っぱ、緑の作業着、芽の出た鉢
  ジョーヴ: frame(
    '#f0f8e6',
    '#ffe9a8',
    `
    <path d="M26 160 q4 -44 54 -48 q50 4 54 48 z" fill="#4f9a55" stroke="${INK}" stroke-width="2"/>
    <path d="M60 116 v44 M100 116 v44" stroke="#3a7a40" stroke-width="5"/>
    <path d="M64 120 l16 10 l16 -10" fill="#fff8ec" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <rect x="72" y="100" width="16" height="18" rx="6" fill="#f3cfa8" stroke="${INK}" stroke-width="2"/>
    <ellipse cx="80" cy="74" rx="32" ry="31" fill="#f3cfa8" stroke="${INK}" stroke-width="2"/>
    <path d="M50 78 q-6 -10 2 -16 q2 8 8 10 z M110 78 q6 -10 -2 -16 q-2 8 -8 10 z" fill="#b5642f" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="80" cy="50" rx="52" ry="10" fill="#f2cf6b" stroke="${INK}" stroke-width="2"/>
    <path d="M54 50 q2 -28 26 -28 q24 0 26 28 z" fill="#f2cf6b" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M55 44 q25 6 50 0" fill="none" stroke="#e2574c" stroke-width="5"/>
    <path d="M98 40 q12 -14 22 -8 q-8 14 -22 8 z" fill="#5cb85c" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    ${face(80, 78, { eye: 'smile', mouth: 'open' })}
    <g transform="translate(120 128)">
      <path d="M-12 -4 h24 l-3 18 h-18 z" fill="#c9714a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <rect x="-14" y="-8" width="28" height="6" rx="2" fill="#d98a5e" stroke="${INK}" stroke-width="2"/>
      <path d="M0 -8 v-12" stroke="#3f9b4c" stroke-width="2.4"/>
      <path d="M0 -16 q-10 -6 -12 2 q8 4 12 -2 z M0 -18 q10 -8 12 0 q-8 4 -12 0 z" fill="#5cb85c" stroke="${INK}" stroke-width="1.6"/>
    </g>
  `,
  ),

  // 4章 金星：優雅な細工師。人と人をつなぐのが好き。まとめ髪にリボン、桃色の服、指輪
  ヴィーナ: frame(
    '#fdeef4',
    '#fbd3e2',
    `
    <path d="M28 160 q4 -42 52 -46 q48 4 52 46 z" fill="#f29bbf" stroke="${INK}" stroke-width="2"/>
    <path d="M60 116 q20 14 40 0" fill="none" stroke="#fff8ec" stroke-width="4"/>
    <circle cx="80" cy="128" r="5" fill="#ffd84d" stroke="${INK}" stroke-width="1.8"/>
    <rect x="72" y="100" width="16" height="16" rx="6" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
    <circle cx="80" cy="30" r="14" fill="#8a4e3a" stroke="${INK}" stroke-width="2"/>
    <ellipse cx="80" cy="72" rx="30" ry="32" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
    <path d="M48 82 q-8 -42 32 -44 q40 2 32 44 q-6 -22 -16 -28 q-14 12 -36 10 q-8 6 -12 18 z" fill="#8a4e3a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M94 20 l12 -6 l-2 12 z M94 20 l14 6 l-10 6 z" fill="#e2578f" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="51" cy="86" r="3" fill="#ffd84d" stroke="${INK}" stroke-width="1.4"/><circle cx="109" cy="86" r="3" fill="#ffd84d" stroke="${INK}" stroke-width="1.4"/>
    ${face(80, 76, { eye: 'smile', mouth: 'smile' })}
    <g transform="translate(118 116)">
      <ellipse cx="0" cy="12" rx="9" ry="7" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
      <circle cx="0" cy="-2" r="7" fill="none" stroke="#e6b422" stroke-width="3"/>
      <path d="M-4 -12 l4 -5 l4 5 l-4 4 z" fill="#8fd3f0" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
    </g>
  `,
  ),

  // 5章 水星：気まぐれな旅人。いつも急いでいる。羽の付いた帽子、なびく紫のマフラー、旅の鞄の帯
  メルク: frame(
    '#f1ecfb',
    '#ddd1f6',
    `
    <path d="M28 160 q4 -42 52 -46 q48 4 52 46 z" fill="#e9c98f" stroke="${INK}" stroke-width="2"/>
    <path d="M44 124 l60 36" stroke="#8a5a36" stroke-width="7"/>
    <path d="M60 112 q20 12 40 0 l2 10 q-22 12 -44 0 z" fill="#7a5cc0" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M100 116 q20 -4 34 -18 q-4 16 -26 26 z" fill="#7a5cc0" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M106 118 q14 -2 22 -12" fill="none" stroke="#b9a5ea" stroke-width="2"/>
    <ellipse cx="80" cy="74" rx="30" ry="32" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
    <path d="M50 76 q-2 -20 10 -28 l-4 12 q10 -12 24 -14 l-4 10 q14 -10 26 -6 q6 10 6 26 q-8 -12 -20 -14 q-20 0 -38 14 z" fill="#5a4a8a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="80" cy="46" rx="36" ry="8" fill="#9b84d8" stroke="${INK}" stroke-width="2"/>
    <path d="M56 46 q2 -22 24 -22 q22 0 24 22 z" fill="#9b84d8" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M104 36 q16 -14 26 -10 q-6 4 -10 6 q8 0 12 4 q-12 2 -16 6 q-6 -2 -12 -6 z" fill="#fff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M56 36 q-16 -14 -26 -10 q6 4 10 6 q-8 0 -12 4 q12 2 16 6 q6 -2 12 -6 z" fill="#fff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    ${face(80, 78, { eye: 'round', mouth: 'open' })}
    <path d="M30 70 h12 M26 80 h14 M30 90 h10" stroke="#b9a5ea" stroke-width="2.4" stroke-linecap="round"/>
  `,
  ),

  // 6章 月：静かで夢見がちな詩人。潮の満ち引きを読む。銀の長い髪に三日月の飾り、羽ペン
  ルーナ: frame(
    '#eaf1fb',
    '#d2e0f5',
    `
    <circle cx="128" cy="30" r="3" fill="#fff"/><circle cx="34" cy="40" r="2" fill="#fff"/><circle cx="140" cy="62" r="1.6" fill="#fff"/>
    <path d="M46 84 q-8 34 -4 76 h76 q4 -42 -4 -76 z" fill="#c9d3e6" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M30 160 q4 -40 50 -44 q46 4 50 44 z" fill="#5f7fb8" stroke="${INK}" stroke-width="2"/>
    <path d="M66 118 q14 10 28 0" fill="none" stroke="#dfe8f7" stroke-width="3"/>
    <rect x="72" y="100" width="16" height="16" rx="6" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
    <ellipse cx="80" cy="72" rx="30" ry="32" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
    <path d="M48 86 q-8 -50 32 -50 q40 0 32 50 q-4 -24 -14 -32 q-6 10 -18 14 q-4 -8 -4 -14 q-10 14 -24 18 q-2 6 -4 14 z" fill="#c9d3e6" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M98 38 a12 12 0 1 0 12 16 a9 9 0 1 1 -12 -16 z" fill="#ffe27a" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    ${face(80, 78, { eye: 'calm', mouth: 'smile' })}
    <g transform="translate(116 120) rotate(30)">
      <path d="M0 -30 q12 14 2 34 l-4 0 q-8 -18 2 -34 z" fill="#fff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M1 -24 v34" stroke="#8a9bc0" stroke-width="1.4"/>
    </g>
    <ellipse cx="112" cy="134" rx="9" ry="7" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
  `,
  ),
};
