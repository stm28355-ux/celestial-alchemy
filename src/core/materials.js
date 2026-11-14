// 素材の一覧。key はステージのテキストで使う呼び名。
// ready が true の素材だけ、ルールができている（ほかはその章のフェーズで作る）。
export const MATERIALS = {
  lead: { name: '鉛', short: '鉛', chapter: 0, ready: true },
  gold: { name: '金', short: '金', chapter: 7, ready: false },
  fire: { name: 'サラマンダーの火種', short: '火種', chapter: 2, ready: true },
  ice: { name: '氷竜の鱗', short: '鱗', chapter: 2, ready: true },
  water: { name: 'ウンディーネの水玉', short: '水玉', chapter: 3, ready: false },
  vine: { name: 'ドリアードのつる', short: 'つる', chapter: 3, ready: false },
  slime: { name: 'スライムゼリー', short: 'ゼリー', chapter: 4, ready: false },
  sand: { name: 'ヘルメスの星砂', short: '星砂', chapter: 5, ready: false },
  horn: { name: 'シルフの角笛', short: '角笛', chapter: 6, ready: false },
  stone: { name: '賢者の石', short: '賢者の石', chapter: 7, ready: false },
};

export function material(key) {
  const m = MATERIALS[key];
  if (!m) throw new Error(`知らない素材です：${key}`);
  return m;
}
