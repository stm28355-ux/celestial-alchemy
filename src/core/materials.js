// 素材の一覧。key はステージのテキストで使う呼び名。
// ready が true の素材だけ、ルールができている（ほかはその章のフェーズで作る）。
// rule は師匠のノートに出す1行の説明（企画まとめ「中身の表で決まったこと」）。noRotate は回せない素材。
export const MATERIALS = {
  lead: { name: '鉛', short: '鉛', chapter: 0, ready: true, rule: '何も起きない、ふつうの素材。7章で金に変わる。' },
  gold: { name: '金', short: '金', chapter: 7, ready: false, rule: '鉛が変わったもの。何とも反応しない。' },
  fire: { name: 'サラマンダーの火種', short: '火種', chapter: 2, ready: true, rule: '触れた鱗とつるを消す。火種は残る。水玉に触れると、いっしょに消える。' },
  ice: { name: '氷竜の鱗', short: '鱗', chapter: 2, ready: true, rule: '火種に触れると、ピースごと溶けて消える。斜線の鱗は器の一部で、動かない。' },
  water: { name: 'ウンディーネの水玉', short: '水玉', chapter: 3, ready: true, rule: 'つるに吸われて消え、つるを1マス伸ばす。火種に触れると、いっしょに消える。' },
  vine: { name: 'ドリアードのつる', short: 'つる', chapter: 3, ready: true, noRotate: true, rule: '縦の棒で、回せない。水玉に触れると、いちばん上の真上に1マス伸びる。' },
  slime: { name: 'スライムゼリー', short: 'ゼリー', chapter: 4, ready: true, rule: '止まると、触れたピースとくっついて1つになる。' },
  sand: { name: 'ヘルメスの星砂', short: '星砂', chapter: 5, ready: false, rule: '止まると、1マスずつにばらけて真下に落ちる。' },
  horn: { name: 'シルフの角笛', short: '角笛', chapter: 6, ready: false, rule: '止まると、口の前のピースを壁か他のピースまで横に押す。' },
  stone: { name: '賢者の石', short: '賢者の石', chapter: 7, ready: false, rule: '触れた鉛を金に変える。金はつながった鉛に広がる。' },
};

export function material(key) {
  const m = MATERIALS[key];
  if (!m) throw new Error(`知らない素材です：${key}`);
  return m;
}
