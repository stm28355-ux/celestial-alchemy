// 入口：画面の切り替え（URL の # で決める）。
//   #/            タイトル
//   #/story       章をえらぶ
//   #/ch/2        章のステージ一覧
//   #/play/2/3    2章の3問目
//   #/note        師匠のノート
//   #/edit        エディタ（#/edit/play で試しに遊ぶ）
//   #/s/<文字>    共有されたステージ

import { parseStage, buildStage } from './core/stage.js';
import { MATERIALS } from './core/materials.js';
import { decodeStage } from './core/share.js';
import { Game } from './ui/game.js';
import { Replay } from './ui/replay.js';
import { drawPiece } from './ui/render.js';
import { save } from './save.js';
import { openEditor, editorPlayStage, markEditorCleared, loadIntoEditor } from './editor.js';

const view = document.querySelector('#view');
let chapters = [];
let notes = [];
let cleanup = null; // 今の画面の後片付け

async function boot() {
  chapters = await fetchJSON('stages/chapters.json');
  for (const ch of chapters) {
    ch.loaded = await Promise.all(ch.stages.map(async path => parseStage(await fetchText(`stages/${path}`))));
  }
  notes = await fetchJSON('stages/notes.json');
  for (const n of notes) n.loaded = parseStage(await fetchText(`stages/${n.stage}`));
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  cleanup?.();
  cleanup = null;
  const dialog = document.querySelector('#clear');
  if (dialog.open) dialog.close();
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  window.scrollTo(0, 0);
  switch (parts[0]) {
    case 'story':
      return showChapters();
    case 'ch':
      return showChapter(Number(parts[1]));
    case 'play':
      return showPlay(Number(parts[1]), Number(parts[2]));
    case 'note':
      return showNote();
    case 'edit':
      if (parts[1] === 'play') return showEditorPlay();
      cleanup = openEditor(view);
      return;
    case 's':
      return showShared(parts.slice(1).join('/'));
    default:
      return showTitle();
  }
}

// ── 進み具合 ──
function chapterCleared(ch) {
  return ch.loaded.length > 0 && ch.loaded.every(s => save.isCleared(s.id));
}
function chapterOpen(i) {
  if (i === 0 || save.openAll) return true;
  return chapterCleared(chapters[i - 1]);
}
// 章の中では、まだ解いていない最初の問題から2問先まで遊べる（詰まったら飛ばせる）
function stageOpen(ch, i) {
  if (save.openAll) return true;
  const first = ch.loaded.findIndex(s => !save.isCleared(s.id));
  return first < 0 || i <= first + 2;
}
function chapterLabel(ch) {
  return ch.metal ? `${ch.id}章 ${ch.name}・${ch.metal}` : `${ch.id}章 ${ch.name}`;
}

// ── タイトル ──
function showTitle() {
  const titles = chapters.filter(ch => ch.title && chapterCleared(ch)).length;
  view.innerHTML = `
    <section class="title-screen">
      <h1>Celestial Alchemy</h1>
      <p class="subtitle">見習い錬金術師ノエルと、7つの天体</p>
      <div class="menu">
        <a class="menu-item primary" href="#/story">物語<small>師匠をたずねて、称号「天体」をめざす</small></a>
        <span class="menu-item disabled">依頼の掲示板<small>準備中（フェーズ8）</small></span>
        <a class="menu-item" href="#/edit">自分で作る<small>器と手持ちを決めて、共有URLで遊んでもらう</small></a>
        <a class="menu-item" href="#/note">師匠のノート<small>覚えた素材と、お手本</small></a>
      </div>
      <p class="progress">得た称号 ${titles} / 7</p>
    </section>`;
}

// ── 章をえらぶ ──
function showChapters() {
  view.innerHTML = `
    <section class="page">
      <h2>物語 <small>章をえらぶ</small></h2>
      <div class="chapter-grid">${chapters.map(chapterCard).join('')}</div>
      <label class="dev"><input type="checkbox" id="open-all" ${save.openAll ? 'checked' : ''}> （試作用）すべての章と問題を開く</label>
    </section>`;
  view.querySelector('#open-all').onchange = ev => {
    save.openAll = ev.target.checked;
    showChapters();
  };
}

function chapterCard(ch, i) {
  const open = chapterOpen(i);
  const done = chapterCleared(ch);
  const count = ch.loaded.filter(s => save.isCleared(s.id)).length;
  const ready = ch.loaded.length > 0;
  const status = !ready ? '準備中' : !open ? '前の章をクリアすると開く' : done ? (ch.title ? `称号「${ch.title}」` : 'クリア') : `${count} / ${ch.loaded.length}`;
  const body = `<b>${chapterLabel(ch)}</b><span class="master">${ch.master}</span><span class="status">${status}</span>`;
  return open && ready
    ? `<a class="chapter-card${done ? ' done' : ''}" href="#/ch/${i}">${body}</a>`
    : `<span class="chapter-card locked">${body}</span>`;
}

// ── 章のステージ一覧 ──
function showChapter(i) {
  const ch = chapters[i];
  if (!ch || !chapterOpen(i)) return (location.hash = '#/story');
  view.innerHTML = `
    <section class="page">
      <p class="back"><a href="#/story">← 章をえらぶ</a></p>
      <h2>${chapterLabel(ch)} <small>${ch.master}</small></h2>
      <p class="master-line">「${ch.line}」</p>
      <ol class="stage-list">
        ${ch.loaded
          .map((s, k) => {
            const label = `<span class="num">${k + 1}</span><span class="name">${escapeHTML(s.title)}</span><span class="req">${escapeHTML(s.request)}</span>`;
            const cls = save.isCleared(s.id) ? ' cleared' : '';
            return stageOpen(ch, k)
              ? `<li><a class="stage-item${cls}" href="#/play/${i}/${k + 1}">${label}</a></li>`
              : `<li><span class="stage-item locked">${label}</span></li>`;
          })
          .join('')}
      </ol>
    </section>`;
}

// ── パズル画面 ──
const RULES = {
  base: [
    '手持ちのピースを1つ選び、向きと列を決めて上から落とす。',
    '刻印（○）のマスを全部埋めて、手持ちを使い切ると調合成功。',
    'ピースは形を保ったまま落ち、1マスでも支えがあれば止まる。',
  ],
  free: '刻印のないマスは、埋めなくてよい（はみ出してもよい）。',
  mark: '×印のマスには、最後に何も残っていてはいけない（途中で通ったり、しばらく止まったりするのはよい）。',
  fire: 'サラマンダーの火種に触れた氷竜の鱗は、ピースごと溶けて消える。火種は残る。',
  fixed: '斜線の鱗は器の一部で、動かない。でも火種で溶ける。',
  water: 'ウンディーネの水玉がドリアードのつるに触れると、水玉は吸われて消え、つるがいちばん上の真上に1マス伸びる（ふさがっていたら伸びない）。',
  vine: 'つるは縦の棒で、回せない。火種に触れると燃えて消える。',
  steam: '火種と水玉が触れると、両方消える。',
  slime: 'スライムゼリーとは、横で触れ合うとそこで止まる（ゼリーが落ちるときも、ゼリーの横を物が落ちるときも）。止まると、触れたピースとくっついて1つになる。',
  slip: '氷竜の鱗はつるつるで、ゼリーとくっつかない（触れても止まらない）。',
};

function puzzleHTML(st, { heading, back, extra = '' }) {
  const rules = [...RULES.base];
  if (st.terrain.some(r => r.includes('.'))) rules.push(RULES.free);
  if (st.terrain.some(r => r.includes('x'))) rules.push(RULES.mark);
  if (st.hand.some(h => h.mat === 'fire') || st.pieces.some(p => p.mat === 'fire')) rules.push(RULES.fire);
  if (st.pieces.some(p => p.fixed)) rules.push(RULES.fixed);
  const has = mat => st.hand.some(h => h.mat === mat) || st.pieces.some(p => p.mat === mat);
  if (has('water') && has('vine')) rules.push(RULES.water);
  if (has('vine')) rules.push(RULES.vine);
  if (has('water') && has('fire')) rules.push(RULES.steam);
  if (has('slime')) rules.push(RULES.slime);
  if (has('slime') && has('ice')) rules.push(RULES.slip);
  return `
    <main class="puzzle">
      <section class="info">
        <p class="back">${back}</p>
        <h2>${heading}</h2>
        ${st.request ? `<p class="request">${escapeHTML(st.request)}</p>` : ''}
        <ul class="rules">${rules.map(r => `<li>${r}</li>`).join('')}</ul>
        ${extra}
      </section>
      <section class="play">
        <div class="board-wrap"><canvas id="board" aria-label="器"></canvas></div>
        <p id="message" class="message" role="status"></p>
      </section>
      <section class="side">
        <h3>手持ち <small>（好きな順に使える）</small></h3>
        <div id="hand" class="hand"></div>
        <div class="buttons">
          <button id="btn-rotate">回す ↻</button>
          <button id="btn-drop" class="primary">落とす ↓</button>
          <button id="btn-undo">一手戻す</button>
          <button id="btn-reset">やり直し</button>
          <button id="btn-hint">ヒント</button>
        </div>
        <details class="help">
          <summary>操作</summary>
          <ul>
            <li>マウス：動かして列を選ぶ／クリックで落とす／右クリックかホイールで回す</li>
            <li>キー：← → 列　↑ か R 回す　↓ か Space 落とす　Z 一手戻す　H ヒント　1〜9 ピースを選ぶ</li>
            <li>指：触った列に合わせ、同じ所をもう一度触ると落とす</li>
            <li>動いている途中にクリックすると、最後まで飛ばす</li>
          </ul>
        </details>
      </section>
    </main>`;
}

function mountGame(st, opts, onClear) {
  view.innerHTML = puzzleHTML(st, opts);
  const game = new Game(view.querySelector('.puzzle'), st, { onClear });
  cleanup = () => game.destroy();
  return game;
}

function showPlay(i, n) {
  const ch = chapters[i];
  const st = ch?.loaded[n - 1];
  if (!st || !chapterOpen(i) || !stageOpen(ch, n - 1)) return (location.hash = '#/story');
  const game = mountGame(st, { heading: `${chapterLabel(ch)}　${n}. ${escapeHTML(st.title)}`, back: `<a href="#/ch/${i}">← ${chapterLabel(ch)}</a>` }, () => {
    const was = chapterCleared(ch);
    save.markCleared(st.id);
    const nowDone = !was && chapterCleared(ch);
    const next = n < ch.loaded.length ? `#/play/${i}/${n + 1}` : null;
    let text = '依頼の品ができあがった。';
    if (nowDone && ch.title) text = `${ch.master}から、称号「${ch.title}」を受け取った！`;
    else if (nowDone) text = `${ch.name}の章をすべて終えた。`;
    clearDialog(text, [
      { label: 'もう一度', run: () => game.reset() },
      next ? { label: '次の依頼へ', href: next, primary: true } : { label: '章をえらぶ', href: '#/story', primary: true },
    ]);
  });
}

// ── 共有されたステージ ──
async function showShared(code) {
  let st;
  try {
    st = buildStage(await decodeStage(code));
  } catch (e) {
    view.innerHTML = `<section class="page"><h2>ステージを開けませんでした</h2><p>URL が途中で切れているか、形式が違います（${escapeHTML(e.message)}）。</p><p><a href="#/">タイトルへ</a></p></section>`;
    return;
  }
  const game = mountGame(
    st,
    {
      heading: `みんなの依頼：${escapeHTML(st.title || '名前のない依頼')}`,
      back: '<a href="#/">← タイトル</a>',
      extra: '<p><button id="open-in-editor" class="linkish">エディタで開く</button></p>',
    },
    () => clearDialog('共有された依頼をクリアした！', [
      { label: 'もう一度', run: () => game.reset() },
      { label: 'タイトルへ', href: '#/', primary: true },
    ]),
  );
  view.querySelector('#open-in-editor').onclick = () => {
    if (!confirm('エディタの今の下書きは、このステージで上書きされます。開きますか？')) return;
    loadIntoEditor(st.raw);
    location.hash = '#/edit';
  };
}

// ── エディタで試しに遊ぶ ──
function showEditorPlay() {
  const st = editorPlayStage();
  if (!st) return (location.hash = '#/edit');
  const game = mountGame(st, { heading: `試しに遊ぶ：${escapeHTML(st.title || '名前のない依頼')}`, back: '<a href="#/edit">← エディタに戻る</a>' }, () => {
    markEditorCleared();
    clearDialog('作った人がクリアしたので、共有URLを作れるようになった。', [
      { label: 'もう一度', run: () => game.reset() },
      { label: 'エディタに戻る', href: '#/edit', primary: true },
    ]);
  });
}

// ── 師匠のノート ──
function showNote() {
  const reached = chapters.filter((ch, i) => chapterOpen(i)).map(ch => ch.id);
  const top = Math.max(...reached);
  const mats = Object.entries(MATERIALS).filter(([, m]) => m.chapter <= top);
  const entries = notes.filter(n => reached.includes(n.chapter));
  view.innerHTML = `
    <section class="page">
      <h2>師匠のノート <small>覚えた素材と、お手本</small></h2>
      <h3>素材</h3>
      <div class="note-mats">${mats.map(([key, m]) => `<div class="note-mat"><canvas data-mat="${key}"></canvas><div><b>${m.name}</b><p>${m.rule}</p></div></div>`).join('')}</div>
      <h3>お手本</h3>
      <div class="note-list">${entries
        .map(n => `<figure class="note"><canvas data-note="${n.key}"></canvas><figcaption><b>${n.key}　${n.title}</b><span>${n.text}</span></figcaption></figure>`)
        .join('')}</div>
      <p class="note-more">お手本は、章を作るときに増やしていく（全部で58個の予定）。</p>
    </section>`;
  view.querySelectorAll('canvas[data-mat]').forEach(cv => {
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.height = 52 * dpr;
    cv.style.width = cv.style.height = '52px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPiece(ctx, { cell: 44, left: 4, top: 4 }, [[0, 0]], cv.dataset.mat, { icons: true });
  });
  const players = [...view.querySelectorAll('canvas[data-note]')].map(cv => new Replay(cv, notes.find(n => n.key === cv.dataset.note).loaded, 30));
  cleanup = () => players.forEach(p => p.stop());
}

// ── 共通 ──
function clearDialog(text, buttons) {
  const dialog = document.querySelector('#clear');
  dialog.querySelector('#clear-text').textContent = text;
  const box = dialog.querySelector('#clear-buttons');
  box.innerHTML = '';
  let focus = null;
  for (const b of buttons) {
    const el = document.createElement('button');
    el.textContent = b.label;
    if (b.primary) {
      el.className = 'primary';
      focus = el;
    }
    el.onclick = () => {
      dialog.close();
      if (b.href) location.hash = b.href;
      b.run?.();
    };
    box.append(el);
  }
  dialog.showModal();
  focus?.focus();
}

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} を読めません（${res.status}）`);
  return res.text();
}

async function fetchJSON(path) {
  return JSON.parse(await fetchText(path));
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

boot().catch(e => {
  view.innerHTML = `<section class="page"><h2>読み込みに失敗しました</h2><p>${escapeHTML(e.message)}</p></section>`;
  console.error(e);
});
