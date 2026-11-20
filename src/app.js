// 入口：画面の切り替え（URL の # で決める）。
//   #/            タイトル
//   #/story       章をえらぶ
//   #/ch/2        章のステージ一覧
//   #/play/2/3    2章の3問目
//   #/note        師匠のノート
//   #/edit        エディタ（#/edit/play で試しに遊ぶ）
//   #/s/<文字>    共有されたステージ
//   #/board       依頼の掲示板（#/req/3 で3番の依頼）

import { parseStage, buildStage } from './core/stage.js';
import { MATERIALS } from './core/materials.js';
import { decodeStage, encodeStage } from './core/share.js';
import { Game } from './ui/game.js';
import { Replay } from './ui/replay.js';
import { drawPiece } from './ui/render.js';
import { save } from './save.js';
import { PORTRAITS } from './ui/portraits.js';
import { openEditor, editorPlayStage, markEditorCleared, loadIntoEditor } from './editor.js';

const view = document.querySelector('#view');
let chapters = [];
let notes = [];
let board = null; // 依頼の掲示板（はじめて開くときに読む）
let cleanup = null; // 今の画面の後片付け

async function boot() {
  // 章とノートのステージ（約120個）は、全部いっぺんに読む（1つずつ待つと、最初の表示まで1.5秒ほどかかっていた）
  [chapters, notes] = await Promise.all([fetchJSON('stages/chapters.json'), fetchJSON('stages/notes.json')]);
  await Promise.all([
    ...chapters.map(async ch => (ch.loaded = await Promise.all(ch.stages.map(async path => parseStage(await fetchText(`stages/${path}`)))))),
    ...notes.map(async n => (n.loaded = parseStage(await fetchText(`stages/${n.stage}`)))),
  ]);
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
    case 'board':
      return showBoard();
    case 'req':
      return showRequest(Number(parts[1]));
    case 'trial':
      return showTrial(Number(parts[1]));
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
      <div class="title-face">${PORTRAITS.ノエル}</div>
      <p class="subtitle">見習い錬金術師ノエルと、7つの天体</p>
      <div class="menu">
        <a class="menu-item primary" href="#/story">物語<small>師匠をたずねて、称号「天体」をめざす</small></a>
        <a class="menu-item" href="#/board">依頼の掲示板<small>難しい依頼ばかり。新しい依頼も探せる</small></a>
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
      <label class="dev"><input type="checkbox" id="open-all" ${save.openAll ? 'checked' : ''}> すべての章と問題を開く（先の章の素材が見えます）</label>
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
  const body = `<span class="face">${PORTRAITS[ch.master] ?? ''}</span><span class="text"><b>${chapterLabel(ch)}</b><span class="master">${ch.master}</span><span class="status">${status}</span></span>`;
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
      <div class="master-say"><span class="face">${PORTRAITS[ch.master] ?? ''}</span><p class="master-line"><b>${ch.master}</b>「${ch.line}」</p></div>
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
  stone: '賢者の石に触れた鉛は金になり、金はつながった鉛に広がる（触れていれば別の鉛にも）。金に触れた鉛は、あとから来てもいつでも金になる。石は残る。',
  goldMark: '金の刻印（金色の太陽）は金で、鉛の刻印（灰色の四角）は鉛で埋める。ピースの下に隠れた刻印は、ピースの右上に小さく出る。',
  removed: '点線のマスは器にないマス。通り抜けられるが、そこで止まる手は置けない。',
  open: '枠のない所（低い枠・底の穴）からは、ピースが器の外へ出てしまう。器の外へ落ちる手・押し出す手は置けない。',
  sand: 'ヘルメスの星砂は、落ちる間は形を保ち、止まると1マスずつの粒にばらけて真下に落ちる。火種では消えない。',
  horn: 'シルフの角笛は1マス。止まると、口の前のピースを、壁か他のピースに当たるまで横に押す。口の向き（左右）は回して決める。落ちてまた止まると、もう一度押す。',
};

// noHint：ヒントを出さない（人が作った大きな問題は、今のヒントでは答えを探しきれない）
function puzzleHTML(st, { heading, back, extra = '', noHint = false, face = null }) {
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
  if (has('sand')) rules.push(RULES.sand);
  if (has('horn')) rules.push(RULES.horn);
  if (has('stone')) rules.push(RULES.stone);
  if (st.terrain.some(r => r.includes('G') || r.includes('L'))) rules.push(RULES.goldMark);
  if (st.terrain.some(r => r.includes('-'))) rules.push(RULES.removed);
  if (st.open && (st.open.left.length || st.open.right.length || st.open.floor.length)) rules.push(RULES.open);
  return `
    <main class="puzzle">
      <section class="info">
        <p class="back">${back}</p>
        <h2>${heading}</h2>
        ${st.request ? (face ? `<div class="request-say"><span class="face">${PORTRAITS[face] ?? ''}</span><p class="request">${escapeHTML(st.request)}</p></div>` : `<p class="request">${escapeHTML(st.request)}</p>`) : ''}
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
          ${noHint ? '' : '<button id="btn-hint">ヒント</button>'}
          <button id="btn-see" aria-pressed="false" title="ピースを透かして、下の刻印を見る（T）">透かす</button>
        </div>
        <details class="help">
          <summary>操作</summary>
          <ul>
            <li>マウス：動かして列を選ぶ／クリックで落とす／右クリックかホイールで回す</li>
            <li>キー：← → 列　↑ か R 回す　↓ か Space 落とす　Z 一手戻す　H ヒント　T 透かす　1〜9 ピースを選ぶ</li>
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
  const game = mountGame(st, { heading: `${chapterLabel(ch)}　${n}. ${escapeHTML(st.title)}`, back: `<a href="#/ch/${i}">← ${chapterLabel(ch)}</a>`, face: ch.master }, () => {
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
    ], nowDone ? ch.master : 'ノエル');
  });
}

// ── 依頼の掲示板 ──
// 作り方の試作（テーマから作った問題を、人が遊んで確かめる）
let trial = null;
async function loadTrial() {
  if (!trial) trial = (await fetchJSON('stages/board-trial.json').catch(() => [])).map(b => ({ ...b, stage: parseStage(b.text) }));
  return trial;
}

async function showTrial(n) {
  const list = await loadTrial();
  const b = list[n - 1];
  if (!b) return (location.hash = '#/board');
  const st = b.stage;
  const game = mountGame(st, { heading: escapeHTML(st.title), back: '<a href="#/board">← 依頼の掲示板</a>' }, () => {
    save.markCleared(b.id);
    const next = n < list.length ? `#/trial/${n + 1}` : null;
    clearDialog('試作の依頼ができあがった。', [
      { label: 'もう一度', run: () => game.reset() },
      next ? { label: '次の試作へ', href: next, primary: true } : { label: '掲示板へ', href: '#/board', primary: true },
    ]);
  });
}

async function loadBoard() {
  if (!board) board = (await fetchJSON('stages/board.json')).map(b => ({ ...b, stage: parseStage(b.text) }));
  return board;
}

const THEME_MATS = mats => [...new Set(mats)].filter(m => m !== 'lead').map(m => MATERIALS[m].short).join('・') || '鉛';

async function showBoard() {
  const list = await loadBoard();
  const trials = await loadTrial();
  if (location.hash !== '#/board') return;
  const done = list.filter(b => save.isCleared(b.id)).length;
  view.innerHTML = `
    <section class="page">
      <p class="back"><a href="#/">← タイトル</a></p>
      <h2>依頼の掲示板 <small>${done} / ${list.length}</small></h2>
      <p class="master-line">「腕の立つ錬金術師へ。どれも一筋縄ではいかない依頼ばかりだ。」</p>
      ${trials.length ? `<h3>作り方の試作 <small>テーマから作った${trials.length}問（テーマと素材は伏せています）。遊んで感想を聞かせてください</small></h3>
      <ol class="stage-list board-list">${trials.map((b, k) => `<li><a class="stage-item${save.isCleared(b.id) ? ' cleared' : ''}" href="#/trial/${k + 1}"><span class="num">${k + 1}</span><span class="name">${escapeHTML(b.stage.title)}</span><span class="req">${escapeHTML(b.stage.request)}</span></a></li>`).join('')}</ol>
      <h3>依頼（${list.length}問）</h3>` : ''}
      <div class="board-new">
        <button id="find-new">新しい依頼を探す</button>
        <span id="find-status" class="ed-note">掲示板にない依頼を、ランダムに1つ出します（URLで人にも渡せます）</span>
      </div>
      <ol class="stage-list board-list">
        ${list
          .map((b, k) => {
            const s = b.stage;
            const mats = THEME_MATS([...s.hand.map(h => h.mat), ...s.pieces.map(p => p.mat)]);
            const cls = save.isCleared(b.id) ? ' cleared' : '';
            return `<li><a class="stage-item${cls}" href="#/req/${k + 1}"><span class="num">${b.pos ?? k + 1}</span><span class="name">${escapeHTML(s.title)}</span><span class="req">${mats}</span></a></li>`;
          })
          .join('')}
      </ol>
    </section>`;
  const btn = view.querySelector('#find-new');
  const status = view.querySelector('#find-status');
  let worker = null;
  cleanup = () => worker?.terminate();
  btn.onclick = async () => {
    btn.disabled = true;
    // 前もって作っておいた依頼から、まだ解いていないものをランダムに出す
    const extra = await fetchJSON('stages/board-extra.json').catch(() => []);
    const fresh = extra.filter(e => !save.isCleared(e.id));
    if (fresh.length) {
      const e = fresh[Math.floor(Math.random() * fresh.length)];
      const st = parseStage(e.text);
      location.hash = `#/s/${await encodeStage({ ...st.raw, title: '新しい依頼' })}`;
      return;
    }
    // 全部解いたら、その場で作る（時間がかかる）
    status.textContent = '探しています…';
    worker = new Worker(new URL('./ui/gen-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = async ev => {
      const m = ev.data;
      if (m.tried && !m.found) status.textContent = `探しています…（${m.tried} 個ためした）`;
      if (m.timeout) {
        status.textContent = '1分では見つかりませんでした。もう一度押してみてください。';
        btn.disabled = false;
        worker.terminate();
      }
      if (m.found) {
        worker.terminate();
        const raw = { ...m.found.raw, id: 'new', title: '新しい依頼', request: '掲示板に、まだ誰も見ていない依頼が貼られていた。' };
        location.hash = `#/s/${await encodeStage(raw)}`;
      }
    };
    worker.postMessage({ seed: Math.floor(Math.random() * 2 ** 31), min: 12, until: 60000 });
  };
}

async function showRequest(n) {
  const list = await loadBoard();
  const b = list[n - 1];
  if (!b) return (location.hash = '#/board');
  const st = b.stage;
  const game = mountGame(st, { heading: `依頼 ${b.pos ?? n}. ${escapeHTML(st.title)}`, back: '<a href="#/board">← 依頼の掲示板</a>', noHint: b.noHint }, () => {
    save.markCleared(b.id);
    const next = n < list.length ? `#/req/${n + 1}` : null;
    clearDialog('依頼の品ができあがった。', [
      { label: 'もう一度', run: () => game.reset() },
      next ? { label: '次の依頼へ', href: next, primary: true } : { label: '掲示板へ', href: '#/board', primary: true },
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
      <p class="note-more"><a href="portraits.html">登場人物の一覧</a></p>
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
function clearDialog(text, buttons, face = 'ノエル') {
  const dialog = document.querySelector('#clear');
  dialog.querySelector('#clear-face').innerHTML = PORTRAITS[face] ?? '';
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
