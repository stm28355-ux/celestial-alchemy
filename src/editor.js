// エディタ：器の形・最初から置く素材・手持ちを決めて、試しに遊び、共有URLを作る。
// 下書きは端末に保存する（save.editor）。作った人がクリアするまで共有URLは作れない。

import { buildStage, parseStageText, stageToText, FORMAT } from './core/stage.js';
import { MATERIALS, material } from './core/materials.js';
import { createState, initialProblems } from './core/rules.js';
import { parseShape, shapeText } from './core/shape.js';
import { encodeStage, decodeStage } from './core/share.js';
import { draw, drawMini, layout } from './ui/render.js';
import { askHint } from './ui/hint.js';
import { save } from './save.js';

const MAX_W = 8, MAX_H = 10;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const TERRAIN_TOOLS = [
  ['+', '目標マス（刻印）'],
  ['.', '空きマス'],
  ['x', '空けておくマス（×印）'],
  ['#', '壁'],
  ['-', 'マスを消す（器にないマス）'],
  ['G', '金で埋めるマス'],
  ['L', '鉛のまま残すマス'],
];

function defaultRaw() {
  return {
    format: FORMAT,
    id: 'custom',
    title: '',
    request: '',
    terrain: ['++++', '++++', '++++'],
    pieces: ['....', '....', '....'],
    legend: {},
    hand: ['lead #..#/####', 'lead ##', 'lead ####'],
  };
}

function draft() {
  const d = save.editor;
  if (d?.raw) return d;
  return { raw: defaultRaw(), verifiedText: null };
}

function store(d) {
  save.editor = d;
}

export function loadIntoEditor(raw) {
  const r = structuredClone(raw);
  r.id = 'custom';
  if (!r.pieces?.length) r.pieces = r.terrain.map(row => '.'.repeat(row.length));
  r.legend ??= {};
  r.hand ??= [];
  delete r.solution;
  store({ raw: r, verifiedText: null });
}

export function editorPlayStage() {
  try {
    return buildStage(draft().raw);
  } catch {
    return null;
  }
}

export function markEditorCleared() {
  const d = draft();
  d.verifiedText = stageToText(d.raw);
  store(d);
}

// ── 画面 ──
export function openEditor(view) {
  const d = draft();
  let tool = { kind: 'terrain', value: '+' };
  let pieceMat = 'lead';
  let pieceFixed = false;
  let pieceLeft = false; // 最初から置く角笛の口の向き
  let newShape = new Set(); // 手持ちに足す形（"x,y"）
  let newMat = 'lead';
  const ac = new AbortController();
  const on = { signal: ac.signal };

  const readyMats = Object.entries(MATERIALS).filter(([, m]) => m.ready);
  view.innerHTML = `
    <main class="editor">
      <section class="ed-side">
        <p class="back"><a href="#/">← タイトル</a></p>
        <h2>自分で作る</h2>
        <label>依頼の名前 <input id="ed-title" maxlength="30"></label>
        <label>依頼文 <input id="ed-request" maxlength="60"></label>
        <div class="ed-size">
          <label>幅 <input id="ed-w" type="number" min="2" max="${MAX_W}"></label>
          <label>高さ <input id="ed-h" type="number" min="2" max="${MAX_H}"></label>
        </div>
        <fieldset>
          <legend>器を塗る</legend>
          ${TERRAIN_TOOLS.map(([v, label]) => `<label><input type="radio" name="tool" value="t${v}"> ${label}</label>`).join('')}
        </fieldset>
        <fieldset>
          <legend>枠を外す・付ける（マスはそのまま）</legend>
          <label><input type="radio" name="tool" value="side"> 左右の枠（左端か右端のマスを押す。低い枠）</label>
          <label><input type="radio" name="tool" value="floor"> 底の枠（その列のマスを押す。底の穴）</label>
        </fieldset>
        <fieldset>
          <legend>素材を置く（ひと続きに塗ったマスが1つのピース）</legend>
          <label><input type="radio" name="tool" value="piece"> 置く</label>
          <select id="ed-piece-mat">${readyMats.map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('')}</select>
          <label><input type="checkbox" id="ed-fixed"> 動かない（器の一部）</label>
          <label><input type="checkbox" id="ed-left"> 角笛の口を左に向ける（ないときは右）</label>
          <label><input type="radio" name="tool" value="erase"> 素材を消す</label>
        </fieldset>
        <p class="ed-note">ドラッグで塗れます。右クリック（右ボタンでなぞる）で素材を消せます。まだルールのない素材（水玉など）は、その章のフェーズで使えるようになります。</p>
      </section>

      <section class="ed-board">
        <canvas id="ed-canvas"></canvas>
        <ul id="ed-problems" class="ed-problems"></ul>
      </section>

      <section class="ed-hand">
        <h3>手持ち</h3>
        <div id="ed-hand-list" class="hand"></div>
        <div class="ed-new">
          <canvas id="ed-shape"></canvas>
          <div>
            <select id="ed-new-mat">${readyMats.map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('')}</select>
            <button id="ed-add">手持ちに足す</button>
            <button id="ed-clear-shape" class="linkish">形を消す</button>
            <p class="ed-note">左のマス目をクリックして形を作る（5×5まで）。</p>
          </div>
        </div>
        <div class="buttons">
          <a class="button primary" href="#/edit/play">試しに遊ぶ</a>
          <button id="ed-solve">解けるか調べる</button>
          <button id="ed-share">共有URLを作る</button>
        </div>
        <p id="ed-result" class="ed-result" role="status"></p>
        <div id="ed-share-box" class="ed-share" hidden>
          <input id="ed-url" readonly>
          <button id="ed-copy">コピー</button>
        </div>
        <details class="ed-text" open>
          <summary>テキストで書き出す・読み込む</summary>
          <p class="ed-note">下の欄はいつも今の下書きです。書き換えるか、別のテキストや共有URLを貼ってから「読み込む」を押すと、エディタに取り込みます。</p>
          <textarea id="ed-textarea" rows="14" spellcheck="false"></textarea>
          <div class="ed-text-buttons">
            <button id="ed-copy-text">テキストをコピー</button>
            <button id="ed-import">読み込む（テキストか共有URL）</button>
            <button id="ed-reset" class="linkish">新しく作り直す</button>
          </div>
        </details>
      </section>
    </main>`;

  const $ = s => view.querySelector(s);
  const canvas = $('#ed-canvas');
  const ctx = canvas.getContext('2d');
  let L = null;

  // ── 下書きを変えたら ──
  const changed = () => {
    cleanLegend(d.raw);
    store(d);
    renderAll();
  };

  // ── 器と素材を塗る ──
  const cellAt = ev => {
    const rect = canvas.getBoundingClientRect();
    const mx = ((ev.clientX - rect.left) / rect.width) * L.width;
    const my = ((ev.clientY - rect.top) / rect.height) * L.height;
    const x = Math.floor((mx - L.left) / L.cell), y = Math.floor((my - L.top) / L.cell);
    const { W, H } = dims(d.raw);
    return x >= 0 && x < W && y >= 0 && y < H ? [x, y] : null;
  };
  let stroke = null;
  const paint = cell => {
    if (!cell) return;
    const [x, y] = cell;
    const r = d.raw;
    if (stroke.erase || tool.kind === 'erase') {
      setChar(r.pieces, x, y, '.');
    } else if (tool.kind === 'terrain') {
      setChar(r.terrain, x, y, tool.value);
      if (tool.value === '#' || tool.value === '-') setChar(r.pieces, x, y, '.');
    } else if (tool.kind === 'piece') {
      if (r.terrain[y][x] === '#' || r.terrain[y][x] === '-') return;
      setChar(r.pieces, x, y, stroke.letter);
    } else if (tool.kind === 'side' || tool.kind === 'floor') {
      const o = openOf(r);
      const { W } = dims(r);
      const spots = tool.kind === 'floor' ? [['floor', x]] : [...(x === 0 ? [['left', y]] : []), ...(x === W - 1 ? [['right', y]] : [])];
      for (const [side, n] of spots) {
        // なぞりの最初のマスで、外すか付けるかを決める
        stroke.open ??= !o[side].includes(n);
        o[side] = o[side].filter(v => v !== n);
        if (stroke.open) o[side].push(n);
      }
      setOpen(r, o);
    }
  };
  canvas.addEventListener('pointerdown', ev => {
    const cell = cellAt(ev);
    if (!cell) return;
    canvas.setPointerCapture(ev.pointerId);
    // 右クリック（右ボタンでなぞる）は、どの道具を選んでいても素材を消す
    stroke = { erase: ev.button === 2 };
    if (!stroke.erase && tool.kind === 'piece') {
      stroke.letter = freeLetter(d.raw);
      if (!stroke.letter) {
        say('ピースは26個までです。');
        stroke = null;
        return;
      }
      d.raw.legend[stroke.letter] = pieceMat + (pieceFixed ? ' fixed' : '') + (pieceMat === 'horn' && pieceLeft ? ' left' : '');
    }
    paint(cell);
    renderBoard();
  }, on);
  canvas.addEventListener('pointermove', ev => {
    if (!stroke) return;
    paint(cellAt(ev));
    renderBoard();
  }, on);
  const endStroke = () => {
    if (!stroke) return;
    stroke = null;
    changed();
  };
  canvas.addEventListener('pointerup', endStroke, on);
  canvas.addEventListener('contextmenu', ev => ev.preventDefault(), on);
  canvas.addEventListener('pointercancel', endStroke, on);

  // ── 道具 ──
  view.querySelectorAll('input[name="tool"]').forEach(el => {
    el.checked = el.value === 't+';
    el.addEventListener('change', () => {
      tool = el.value.startsWith('t') ? { kind: 'terrain', value: el.value.slice(1) } : { kind: el.value };
    }, on);
  });
  $('#ed-piece-mat').addEventListener('change', ev => {
    pieceMat = ev.target.value;
    view.querySelector('input[value="piece"]').click();
  }, on);
  $('#ed-fixed').addEventListener('change', ev => {
    pieceFixed = ev.target.checked;
    view.querySelector('input[value="piece"]').click();
  }, on);
  $('#ed-left').addEventListener('change', ev => {
    pieceLeft = ev.target.checked;
    view.querySelector('input[value="piece"]').click();
  }, on);

  // ── 名前と大きさ ──
  $('#ed-title').value = d.raw.title ?? '';
  $('#ed-request').value = d.raw.request ?? '';
  $('#ed-title').addEventListener('input', ev => {
    d.raw.title = ev.target.value.trim();
    changed();
  }, on);
  $('#ed-request').addEventListener('input', ev => {
    d.raw.request = ev.target.value.trim();
    changed();
  }, on);
  const resize = () => {
    const W = clamp(Number($('#ed-w').value) || 2, 2, MAX_W);
    const H = clamp(Number($('#ed-h').value) || 2, 2, MAX_H);
    resizeRaw(d.raw, W, H);
    changed();
  };
  $('#ed-w').addEventListener('change', resize, on);
  $('#ed-h').addEventListener('change', resize, on);

  // ── 手持ちに足す形 ──
  const shapeCanvas = $('#ed-shape');
  const SC = 22;
  shapeCanvas.width = shapeCanvas.height = 5 * SC + 2;
  shapeCanvas.addEventListener('pointerdown', ev => {
    const rect = shapeCanvas.getBoundingClientRect();
    const x = Math.floor(((ev.clientX - rect.left) / rect.width) * 5);
    const y = Math.floor(((ev.clientY - rect.top) / rect.height) * 5);
    const k = `${x},${y}`;
    newShape.has(k) ? newShape.delete(k) : newShape.add(k);
    renderShape();
  }, on);
  $('#ed-new-mat').addEventListener('change', ev => {
    newMat = ev.target.value;
    renderShape();
  }, on);
  $('#ed-clear-shape').addEventListener('click', () => {
    newShape = new Set();
    renderShape();
  }, on);
  $('#ed-add').addEventListener('click', () => {
    if (newShape.size === 0) return say('左のマス目で形を作ってから足してください。');
    const cells = parseShape(shapeText([...newShape].map(k => k.split(',').map(Number))));
    d.raw.hand.push(`${newMat} ${shapeText(cells)}`);
    newShape = new Set();
    renderShape();
    changed();
  }, on);

  // ── 調べる・共有 ──
  $('#ed-solve').addEventListener('click', async () => {
    let st;
    try {
      st = buildStage(d.raw);
    } catch (e) {
      return say(`まだ遊べない形です：${e.message}`);
    }
    say('調べています…（大きいと少し時間がかかります）');
    const res = await askHint(createState(st), 1500000);
    if (res.truncated && !res.solvable) return say('探しきれませんでした。手持ちを減らすか、器を小さくするか、壁の列で部屋に分けてみてください。');
    if (!res.solvable) return say('解けません。');
    const once = res.finalStates === 1 ? '答えは1つに決まっています。' : `クリアしたときの盤面は${res.finalStates}種類あります。`;
    const react = res.pathsNoReaction === 0 ? '反応を使わないと解けません。' : '';
    const paths = res.paths == null ? '（部屋ごとに調べたので、道筋の数は数えていません）' : `クリアまでの道筋は${res.paths}通り。`;
    say(`解けます。${paths}${once}${react}${res.truncated ? '（全部は調べきれていません）' : ''}`);
  }, on);
  $('#ed-share').addEventListener('click', async () => {
    if (d.verifiedText !== stageToText(d.raw)) return say('共有する前に「試しに遊ぶ」で、自分でクリアしてください。');
    const code = await encodeStage(d.raw);
    const url = `${location.origin}${location.pathname}#/s/${code}`;
    $('#ed-share-box').hidden = false;
    $('#ed-url').value = url;
    say(`共有URLを作りました（${url.length}文字）。このURLを開くと、だれでも遊べます。`);
  }, on);
  $('#ed-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#ed-url').value);
      say('コピーしました。');
    } catch {
      $('#ed-url').select();
      say('選んだので、Ctrl+C でコピーしてください。');
    }
  }, on);

  // ── テキスト ──
  $('#ed-copy-text').addEventListener('click', async () => {
    const text = stageToText(d.raw);
    $('#ed-textarea').value = text;
    try {
      await navigator.clipboard.writeText(text);
      say('テキストをコピーしました。');
    } catch {
      $('#ed-textarea').select();
      say('選んだので、Ctrl+C でコピーしてください。');
    }
  }, on);
  $('#ed-import').addEventListener('click', async () => {
    try {
      const raw = await readStageInput($('#ed-textarea').value);
      buildStage(raw);
      loadIntoEditor(raw);
      Object.assign(d, draft());
      $('#ed-title').value = d.raw.title ?? '';
      $('#ed-request').value = d.raw.request ?? '';
      changed();
      $('#ed-textarea').value = stageToText(d.raw);
      say('読み込みました。');
    } catch (e) {
      say(`読み込めません：${e.message}`);
    }
  }, on);
  $('#ed-reset').addEventListener('click', () => {
    if (!confirm('今の下書きを消して、新しく作り直しますか？')) return;
    d.raw = defaultRaw();
    d.verifiedText = null;
    $('#ed-title').value = '';
    $('#ed-request').value = '';
    changed();
  }, on);

  window.addEventListener('resize', () => renderBoard(), on);

  // ── 描画 ──
  function renderAll() {
    const { W, H } = dims(d.raw);
    $('#ed-w').value = W;
    $('#ed-h').value = H;
    renderBoard();
    renderHand();
    renderShape();
    renderProblems();
    const text = stageToText(d.raw);
    if (document.activeElement !== $('#ed-textarea')) $('#ed-textarea').value = text;
    $('#ed-share').disabled = false;
    $('#ed-share').title = d.verifiedText === text ? '' : '自分でクリアすると作れます';
    $('#ed-share').classList.toggle('dim', d.verifiedText !== text);
    if (d.verifiedText !== text) $('#ed-share-box').hidden = true;
  }

  function renderBoard() {
    const r = d.raw;
    const { W, H } = dims(r);
    const avail = Math.max(220, canvas.parentElement.getBoundingClientRect().width - 8);
    const cell = Math.max(26, Math.floor(Math.min(56, avail / (W + 0.8), (window.innerHeight - 220) / (H + 1))));
    L = layout({ W, H }, 0, cell);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = L.width * dpr;
    canvas.height = L.height * dpr;
    canvas.style.width = `${L.width}px`;
    canvas.style.height = `${L.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, L, { stage: { W, H, terrain: r.terrain, open: openOf(r) }, pieces: piecesOf(r), icons: true });
  }

  function renderHand() {
    const box = $('#ed-hand-list');
    box.innerHTML = '';
    d.raw.hand.forEach((line, i) => {
      const [mat, shape] = line.split(/\s+/);
      const item = document.createElement('div');
      item.className = 'hand-item';
      const cv = document.createElement('canvas');
      try {
        drawMini(cv, parseShape(shape), mat, 16);
      } catch {
        // 形が読めないときは絵を出さない
      }
      const label = document.createElement('span');
      label.textContent = `${i + 1} ${MATERIALS[mat]?.short ?? mat}`;
      const del = document.createElement('button');
      del.className = 'linkish';
      del.textContent = '外す';
      del.onclick = () => {
        d.raw.hand.splice(i, 1);
        changed();
      };
      item.append(cv, label, del);
      box.append(item);
    });
    if (!d.raw.hand.length) box.innerHTML = '<p class="ed-note">まだ手持ちがありません。</p>';
  }

  function renderShape() {
    const c = shapeCanvas.getContext('2d');
    c.clearRect(0, 0, shapeCanvas.width, shapeCanvas.height);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        c.fillStyle = newShape.has(`${x},${y}`) ? '#e9a35a' : '#fbf3e3';
        c.fillRect(1 + x * SC, 1 + y * SC, SC - 1, SC - 1);
      }
    }
    if (newShape.size) {
      c.fillStyle = '#7a5a2a';
      c.font = '11px sans-serif';
      c.fillText(material(newMat).short, 3, 5 * SC - 3);
    }
  }

  function renderProblems() {
    const list = $('#ed-problems');
    const problems = [];
    let st = null;
    let info = '';
    try {
      st = buildStage(d.raw);
      problems.push(...initialProblems(st));
    } catch (e) {
      problems.push(e.message);
    }
    if (st) {
      const targets = st.terrain.join('').split('').filter(c => '+GL'.includes(c)).length;
      const handCells = st.hand.reduce((n, h) => n + h.cells.length, 0);
      const filled = st.pieces.reduce((n, p) => n + p.cells.filter(([x, y]) => '+GL'.includes(st.terrain[y][x])).length, 0);
      if (!st.hand.length) problems.push('手持ちがありません。');
      if (!targets) problems.push('刻印のマスがありません。');
      info = `刻印 ${targets}マス（最初から埋まっている ${filled}）／手持ち ${handCells}マス`;
    }
    for (const [letter, cells] of letterCells(d.raw)) if (!connected(cells)) problems.push(`離れたマスが1つのピースになっています（${d.raw.legend[letter]}）。`);
    list.replaceChildren(
      ...[info, ...problems].map((text, i) => {
        const li = document.createElement('li');
        if (i === 0) li.className = 'info';
        li.textContent = text;
        return li;
      }),
    );
  }

  function say(text) {
    $('#ed-result').textContent = text;
  }

  renderAll();
  return () => ac.abort();
}

// テキスト（ステージの書き方）か、共有URL（または # の後ろの文字だけ）を読む
export async function readStageInput(input) {
  const text = input.trim();
  const url = text.match(/#\/s\/([A-Za-z0-9_-]+)/);
  if (url) return decodeStage(url[1]);
  if (/^[A-Za-z0-9_-]{20,}$/.test(text)) return decodeStage(text);
  return parseStageText(text);
}

// ── 下書きのあつかい ──
function dims(r) {
  return { W: r.terrain[0].length, H: r.terrain.length };
}

function setChar(rows, x, y, ch) {
  rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
}

function resizeRaw(r, W, H) {
  const fit = (rows, fill) => Array.from({ length: H }, (_, y) => (rows[y] ?? '').padEnd(W, fill).slice(0, W));
  r.terrain = fit(r.terrain, '+');
  r.pieces = fit(r.pieces, '.');
  const o = openOf(r);
  setOpen(r, { left: o.left.filter(n => n < H), right: o.right.filter(n => n < H), floor: o.floor.filter(n => n < W) });
}

// 外した枠（raw.open の行）を、{ left, right, floor } の番号の並びにする／戻す
function openOf(r) {
  const o = { left: [], right: [], floor: [] };
  for (const line of r.open ?? []) {
    const [side, ...nums] = line.split(/\s+/);
    if (o[side]) o[side].push(...nums.map(Number));
  }
  return o;
}

function setOpen(r, o) {
  r.open = ['left', 'right', 'floor'].filter(k => o[k].length).map(k => `${k} ${[...o[k]].sort((a, b) => a - b).join(' ')}`);
}

function letterCells(r) {
  const map = new Map();
  r.pieces.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === '.') return;
      if (!map.has(c)) map.set(c, []);
      map.get(c).push([x, y]);
    }),
  );
  return map;
}

function cleanLegend(r) {
  const used = letterCells(r);
  for (const k of Object.keys(r.legend)) if (!used.has(k)) delete r.legend[k];
  // legend のない文字は消す
  r.pieces = r.pieces.map(row => [...row].map(c => (c === '.' || r.legend[c] ? c : '.')).join(''));
}

function freeLetter(r) {
  const used = new Set([...letterCells(r).keys(), ...Object.keys(r.legend)]);
  return [...LETTERS].find(c => !used.has(c)) ?? null;
}

function piecesOf(r) {
  return [...letterCells(r)].map(([letter, cells], i) => {
    const [mat, ...flags] = (r.legend[letter] ?? 'lead').split(/\s+/);
    return { id: i + 1, mat, cells, fixed: flags.includes('fixed'), ...(mat === 'horn' ? { dir: flags.includes('left') ? -1 : 1 } : {}) };
  });
}

function connected(cells) {
  if (cells.length <= 1) return true;
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const seen = new Set([`${cells[0][0]},${cells[0][1]}`]);
  const stack = [cells[0]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push([x + dx, y + dy]);
      }
    }
  }
  return seen.size === set.size;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
