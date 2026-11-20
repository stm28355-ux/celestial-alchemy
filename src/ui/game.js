// パズル画面：手持ちを選ぶ・列と向きを決める・落とす・1段ずつ見せる・一手戻す・やり直し・ヒント。
// root の中に #board #hand #message と、ボタン（#btn-rotate #btn-drop #btn-undo #btn-reset #btn-hint）があること。

import { createState, drop, landing, isCleared, targetsFilled } from '../core/rules.js';
import { size } from '../core/shape.js';
import { material } from '../core/materials.js';
import { draw, layout, drawMini, SPAWN_GAP } from './render.js';
import { buildSteps, runSteps } from './anim.js';
import { askHint } from './hint.js';
import { solutionHint } from '../core/solver.js';
import { save } from '../save.js';

// 置けない手の知らせ方（rules.js の reason ごと）
const REASONS = {
  above: 'そこに置くと、器の上にはみ出して止まります。',
  rim: 'そこに置くと、器にないマス（点線）で止まります。',
  spill: 'そこに置くと、ピースが器の外へ落ちてしまいます。',
};

export class Game {
  constructor(root, stage, { onClear } = {}) {
    this.root = root;
    this.stage = stage;
    this.onClear = onClear;
    this.canvas = root.querySelector('#board');
    this.ctx = this.canvas.getContext('2d');
    this.handBox = root.querySelector('#hand');
    this.msg = root.querySelector('#message');
    // 回すと縦横が入れ替わるので、長い方の辺で考える
    this.spawnRows = Math.max(...stage.hand.map(h => Math.max(size(h.cells).w, size(h.cells).h)), 1);
    this.span = Math.max(stage.W, this.spawnRows);
    this.reset();
    this.bind();
    this.resize();
  }

  // 打った手順（ステージの solution の書き方）。エディタで、作った人のクリア手順を残すのに使う
  movesText() {
    return this.history.map(h => `${h.orig + 1} r${h.r} x${h.x}`);
  }

  // ── 状態 ──
  reset() {
    this.anim?.cancel();
    this.anim = null;
    this.state = createState(this.stage);
    this.history = [];
    this.done = false;
    this.hintToken = null;
    this.select(this.state.hand[0]?.orig ?? null);
    this.say('');
    this.render();
  }

  undo() {
    if (this.anim) this.anim.finish();
    const prev = this.history.pop();
    if (!prev) return;
    this.state = prev.state;
    this.done = false;
    this.hintToken = null;
    this.select(prev.orig, prev.r);
    this.x = prev.x;
    this.clampX();
    this.say('');
    this.render();
  }

  select(orig, r = 0) {
    this.sel = orig;
    this.r = r;
    if (this.x === undefined) this.x = 0;
    this.clampX();
    this.renderHand();
  }

  current() {
    const idx = this.state.hand.findIndex(h => h.orig === this.sel);
    return idx < 0 ? null : { idx, item: this.state.hand[idx], cells: this.state.hand[idx].rots[this.r] };
  }

  clampX() {
    const cur = this.current();
    if (!cur) return;
    this.x = fitX(this.stage.W, size(cur.cells).w, this.x);
  }

  rotate(dir = 1) {
    if (!this.current() || this.anim) return;
    if (material(this.current().item.mat).noRotate) {
      this.say(`${material(this.current().item.mat).short}は回せません（いつも縦向き）。`);
      return;
    }
    this.r = (this.r + dir + 4) % 4;
    this.clampX();
    this.render();
  }

  // 手持ちの次（dir=1）・前（dir=-1）のピースに替える（残っているものだけ、端まで行ったら反対の端へ）
  cycle(dir = 1) {
    if (this.anim || this.done) return;
    const rest = this.state.hand.map(h => h.orig);
    if (rest.length < 2) return;
    const i = rest.indexOf(this.sel);
    this.select(rest[(i + dir + rest.length) % rest.length]);
    this.render();
  }

  move(dx) {
    if (!this.current() || this.anim) return;
    this.x += dx;
    this.clampX();
    this.render();
  }

  dropNow() {
    if (this.anim) return this.anim.finish();
    const cur = this.current();
    if (!cur || this.done) return;
    const before = this.state;
    const d = drop(before, cur.idx, this.r, this.x);
    if (!d.ok) {
      this.say(REASONS[d.reason] ?? (size(cur.cells).w > this.stage.W ? 'この向きでは器に入りません。回してみましょう。' : 'そこには置けません。'));
      this.shake();
      return;
    }
    this.history.push({ state: before, orig: this.sel, r: this.r, x: this.x });
    this.hintToken = null;
    this.say('');
    const steps = buildSteps(before, d, cur.cells, SPAWN_GAP);
    this.anim = runSteps(
      steps,
      (pieces, extra) => draw(this.ctx, this.L, { stage: this.stage, pieces, icons: true, see: this.see, ...extra }),
      () => {
        this.anim = null;
        this.state = d.state;
        this.afterMove();
      },
    );
  }

  afterMove() {
    const s = this.state;
    if (isCleared(s)) {
      this.done = true;
      this.render();
      this.onClear?.();
      return;
    }
    // 次のピース：今の位置から後ろ、なければ最初
    const rest = s.hand.map(h => h.orig);
    const next = rest.find(o => o > this.sel) ?? rest[0] ?? null;
    this.select(next);
    if (s.hand.length === 0) this.say(`${targetsFilled(s) ? '×印のマスにピースが残りました' : '刻印が残りました'}。「一手戻す」か「やり直し」でもう一度。`);
    this.render();
  }

  // ヒント：今の盤面から、クリアにつながる最初の1手を選んだ状態にする（落とすのは自分）。
  async hint() {
    if (!this.root.querySelector('#btn-hint')) return; // ヒントを出さない問題
    if (this.anim || this.done || !this.state.hand.length) return;
    // 狙いの手順（作った人のクリア手順など）の途中なら、その次の1手をすぐ出す
    const fromSolution = solutionHint(this.stage, this.state);
    if (fromSolution) return this.showHint(fromSolution, true);
    const token = {};
    this.hintToken = token;
    this.say('ヒントを考えています…', 'hint');
    let res;
    try {
      res = await askHint(this.state);
    } catch (e) {
      this.say(`ヒントを出せませんでした（${e.message}）`);
      return;
    }
    if (this.hintToken !== token) return; // 考えている間に盤面が変わった
    if (!res.move) {
      const offPath = this.stage.solution?.length && this.history.length;
      this.say(
        res.truncated
          ? offPath
            ? 'この盤面は広すぎて、ヒントを見つけきれませんでした。「一手戻す」か「やり直し」で戻ると、ヒントが出せることがあります。'
            : 'この盤面は広すぎて、ヒントを見つけきれませんでした。'
          : 'この盤面からは解けません。「一手戻す」で前に戻ってみましょう。',
      );
      return;
    }
    this.showHint(res.move);
  }

  // fixed：決まった手順（作った人の手順）からのヒント。答えはほかにもあることを添える
  showHint(m, fixed = false) {
    this.select(m.orig, m.r);
    this.x = m.x;
    this.clampX();
    this.render();
    this.say(
      fixed
        ? `ヒント（決まった手順の次の1手）：${m.orig + 1}番の${material(m.mat).short}を、この向き・この列で落としてみましょう。順番を入れ替えたり、別の解き方をしたりしてもかまいません。`
        : `ヒント：${m.orig + 1}番の${material(m.mat).short}を、この向き・この列で落としてみましょう。`,
      'hint',
    );
  }

  // ── 入力 ──
  bind() {
    // 画面を替えるとき、つけた入力をまとめて外せるようにする
    this.ac = new AbortController();
    const on = { signal: this.ac.signal };
    const cv = this.canvas;
    const colAt = ev => {
      const rect = cv.getBoundingClientRect();
      const mx = ((ev.clientX - rect.left) / rect.width) * this.L.width;
      return Math.floor((mx - this.L.left) / this.L.cell);
    };
    const aimAt = ev => {
      const cur = this.current();
      if (!cur) return null;
      const { w } = size(cur.cells);
      return fitX(this.stage.W, w, colAt(ev) - Math.floor((w - 1) / 2));
    };
    cv.addEventListener('pointermove', ev => {
      if (ev.pointerType !== 'mouse' || this.anim) return;
      const x = aimAt(ev);
      if (x !== null && x !== this.x) {
        this.x = x;
        this.render();
      }
    }, on);
    let lastTap = null;
    cv.addEventListener('pointerup', ev => {
      if (ev.button === 2) return;
      if (this.anim) return this.anim.finish();
      const x = aimAt(ev);
      if (x === null) return;
      if (ev.pointerType === 'mouse') {
        this.x = x;
        return this.dropNow();
      }
      // 指で触るとき：1回目で列を選び、同じ列をもう一度触ると落とす
      if (lastTap && lastTap.x === x && lastTap.sel === this.sel && lastTap.r === this.r && performance.now() - lastTap.t < 2500) {
        lastTap = null;
        this.x = x;
        return this.dropNow();
      }
      lastTap = { x, sel: this.sel, r: this.r, t: performance.now() };
      this.x = x;
      this.render();
    }, on);
    // 回したり替えたりすると幅が変わるので、マウスの位置に合わせ直す
    const reaim = ev => {
      const x = aimAt(ev);
      if (x !== null && x !== this.x) {
        this.x = x;
        this.render();
      }
    };
    // 操作タイプ（save.controls）。1：右クリックで回す・ホイールでピースを替える　2：右クリックでピースを替える・ホイールで回す
    cv.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      if (save.controls === 2) this.cycle(1);
      else this.rotate(1);
      reaim(ev);
    }, on);
    // タッチパッドはホイールが細かく続けて届くので、少し間をあける
    let lastWheel = 0;
    cv.addEventListener('wheel', ev => {
      ev.preventDefault();
      if (!ev.deltaY || performance.now() - lastWheel < 150) return;
      lastWheel = performance.now();
      const dir = ev.deltaY > 0 ? 1 : -1;
      if (save.controls === 2) this.rotate(dir);
      else this.cycle(dir);
      reaim(ev);
    }, { passive: false, signal: this.ac.signal });
    window.addEventListener('keydown', ev => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      if (ev.altKey || ev.ctrlKey || ev.metaKey || document.querySelector('dialog[open]')) return;
      const k = ev.key;
      if (k === 'ArrowLeft' || k === 'a') this.move(-1);
      else if (k === 'ArrowRight' || k === 'd') this.move(1);
      else if (k === 'ArrowUp' || k === 'r' || k === 'w') this.rotate(1);
      else if (k === 'ArrowDown' || k === ' ' || k === 'Enter' || k === 's') this.dropNow();
      else if (k === 'z' || k === 'Backspace') this.undo();
      else if (k === 'h') this.hint();
      else if (k === 't') this.toggleSee();
      else if (/^[1-9]$/.test(k)) {
        const orig = Number(k) - 1;
        if (this.state.hand.some(h => h.orig === orig)) {
          this.select(orig);
          this.render();
        }
      } else return;
      ev.preventDefault();
    }, on);
    window.addEventListener('resize', () => this.resize(), on);
    const btn = (id, fn) => this.root.querySelector(id)?.addEventListener('click', fn, on);
    btn('#btn-rotate', () => this.rotate(1));
    btn('#btn-drop', () => this.dropNow());
    btn('#btn-undo', () => this.undo());
    btn('#btn-reset', () => this.reset());
    btn('#btn-hint', () => this.hint());
    btn('#btn-see', () => this.toggleSee());
  }

  // ピースを透かして、下の刻印を見る（押すたびに切り替え）
  toggleSee() {
    this.see = !this.see;
    const b = this.root.querySelector('#btn-see');
    if (b) {
      b.setAttribute('aria-pressed', String(this.see));
      b.classList.toggle('on', this.see);
    }
    this.render();
  }

  destroy() {
    this.ac.abort();
    this.anim?.cancel();
    this.anim = null;
    this.hintToken = null;
  }

  // ── 描画 ──
  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const availW = Math.max(200, box.width - 8);
    const availH = Math.max(240, window.innerHeight - 260);
    const cell = Math.floor(Math.min(64, availW / (this.span + 0.8), availH / (this.stage.H + this.spawnRows + 0.6)));
    this.L = layout(this.stage, this.spawnRows, Math.max(28, cell), this.span);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.L.width * dpr;
    this.canvas.height = this.L.height * dpr;
    this.canvas.style.width = `${this.L.width}px`;
    this.canvas.style.height = `${this.L.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  render() {
    if (!this.L || this.anim) return;
    const view = { stage: this.stage, pieces: this.state.pieces, icons: true, see: this.see };
    const cur = this.done ? null : this.current();
    if (cur) {
      const { h } = size(cur.cells);
      const dir = cur.item.mat === 'horn' ? (this.r % 2 === 0 ? 1 : -1) : 1;
      view.preview = { mat: cur.item.mat, dir, cells: cur.cells.map(([cx, cy]) => [cx + this.x, cy - h]) };
      const land = landing(this.state, cur.cells, this.x, undefined, cur.item.mat);
      if (land.ok) {
        view.ghost = { mat: cur.item.mat, cells: land.cells };
        // 止まる所は器の中でも、反応や押し出しのあとで器の外へ出てしまう手は赤くする
        if (!drop(this.state, cur.idx, this.r, this.x).ok) view.invalid = true;
      } else view.invalid = true;
    }
    draw(this.ctx, this.L, view);
  }

  renderHand() {
    const box = this.handBox;
    box.innerHTML = '';
    const left = new Set(this.state.hand.map(h => h.orig));
    this.stage.hand.forEach((h, i) => {
      const used = !left.has(i);
      const btn = document.createElement('button');
      btn.className = 'hand-item' + (i === this.sel ? ' selected' : '') + (used ? ' used' : '');
      btn.disabled = used;
      btn.title = `${i + 1}：${material(h.mat).name}`;
      const cv = document.createElement('canvas');
      drawMini(cv, h.cells, h.mat, 18, used);
      const label = document.createElement('span');
      label.textContent = `${i + 1} ${material(h.mat).short}`;
      btn.append(cv, label);
      btn.onclick = () => {
        if (used || this.anim) return;
        if (this.sel === i) this.rotate(1);
        else {
          this.select(i);
          this.render();
        }
      };
      box.append(btn);
    });
  }

  // kind：'hint' でヒントの色にする（ふだんは注意の色）
  say(text, kind = '') {
    this.msg.textContent = text;
    this.msg.className = kind ? `message ${kind}` : 'message';
  }

  shake() {
    this.canvas.classList.remove('shake');
    void this.canvas.offsetWidth;
    this.canvas.classList.add('shake');
  }
}

// 列の位置をそろえる。器より広いピースは、器の真ん中に合わせて左右にはみ出させる（置けない印が全部見えるように）。
function fitX(W, w, x) {
  if (w > W) return Math.floor((W - w) / 2);
  return Math.max(0, Math.min(W - w, x));
}
