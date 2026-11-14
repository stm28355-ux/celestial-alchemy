// 試作の入口：ステージの一覧を読み、選んだステージをパズル画面で遊ぶ。

import { parseStage } from './core/stage.js';
import { Game } from './ui/game.js';

const LIST = 'stages/proto/list.json';
const SAVE_KEY = 'celestial-alchemy:proto-cleared';
const GROUPS = [
  { from: 0, label: '反応なし' },
  { from: 5, label: '溶ける' },
];

const RULES = {
  base: [
    '手持ちのピースを1つ選び、向きと列を決めて上から落とす。',
    '刻印（○）のマスを全部埋めて、手持ちを使い切ると調合成功。',
    'ピースは形を保ったまま落ち、1マスでも支えがあれば止まる。',
  ],
  free: '刻印のないマスは、埋めなくてよい（はみ出してもよい）。',
  fire: 'サラマンダーの火種に触れた氷竜の鱗は、ピースごと溶けて消える。火種は残る。',
  fixed: '斜線の鱗は器の一部で、動かない。でも火種で溶ける。',
};

const stages = [];
let game = null;
let index = 0;

const cleared = loadCleared();

async function main() {
  const names = await (await fetch(LIST)).json();
  for (const name of names) {
    const text = await (await fetch(`stages/proto/${name}`)).text();
    stages.push(parseStage(text));
  }
  const fromHash = Number(location.hash.slice(1)) - 1;
  open(Number.isInteger(fromHash) && fromHash >= 0 && fromHash < stages.length ? fromHash : firstUncleared());
  window.addEventListener('hashchange', () => {
    const n = Number(location.hash.slice(1)) - 1;
    if (n !== index && n >= 0 && n < stages.length) open(n);
  });
  document.querySelector('#btn-again').onclick = () => {
    document.querySelector('#clear').close();
    game.reset();
  };
  document.querySelector('#btn-next').onclick = () => {
    document.querySelector('#clear').close();
    open(Math.min(index + 1, stages.length - 1));
  };
}

function open(n) {
  index = n;
  if (location.hash !== `#${n + 1}`) history.replaceState(null, '', `#${n + 1}`);
  const st = stages[n];
  const dialog = document.querySelector('#clear');
  if (dialog.open) dialog.close();
  game?.destroy();
  document.querySelector('#stage-title').textContent = `${n + 1}. ${st.title}`;
  document.querySelector('#stage-request').textContent = st.request;
  const rules = [...RULES.base];
  if (st.terrain.some(r => r.includes('.'))) rules.push(RULES.free);
  if (st.hand.some(h => h.mat === 'fire') || st.pieces.some(p => p.mat === 'fire')) rules.push(RULES.fire);
  if (st.pieces.some(p => p.fixed)) rules.push(RULES.fixed);
  document.querySelector('#stage-rules').innerHTML = rules.map(r => `<li>${r}</li>`).join('');
  game = new Game(document.querySelector('#game'), st, { onClear: () => win(n) });
  renderNav();
}

function win(n) {
  cleared.add(stages[n].id);
  saveCleared();
  renderNav();
  document.querySelector('#clear-text').textContent = n + 1 < stages.length ? '依頼の品ができあがった。' : '試作の10問はこれで全部です。遊んでくれてありがとう。';
  const next = document.querySelector('#btn-next');
  next.hidden = n + 1 >= stages.length;
  document.querySelector('#clear').showModal();
  (next.hidden ? document.querySelector('#btn-again') : next).focus();
}

function renderNav() {
  const nav = document.querySelector('#stages');
  nav.innerHTML = '';
  stages.forEach((st, i) => {
    const g = GROUPS.find(g => g.from === i);
    if (g) {
      const span = document.createElement('span');
      span.className = 'group';
      span.textContent = g.label;
      nav.append(span);
    }
    const b = document.createElement('button');
    b.textContent = i + 1;
    b.title = st.title;
    b.className = (i === index ? 'current' : '') + (cleared.has(st.id) ? ' cleared' : '');
    b.onclick = () => open(i);
    nav.append(b);
  });
}

function firstUncleared() {
  const i = stages.findIndex(s => !cleared.has(s.id));
  return i < 0 ? 0 : i;
}

function loadCleared() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SAVE_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function saveCleared() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify([...cleared]));
  } catch {
    // 保存できなくても遊べる
  }
}

main().catch(e => {
  document.querySelector('#message').textContent = `読み込みに失敗しました：${e.message}`;
  console.error(e);
});
