// パズル画面：手持ちを選ぶ・列と向きを決める・落とす・1段ずつ見せる・一手戻す・やり直し。

import { createState, drop, landing, isCleared } from '../core/rules.js';
import { size } from '../core/shape.js';
import { material } from '../core/materials.js';
import { draw, layout, drawMini, SPAWN_GAP } from './render.js';

const FALL_MS = 55; // 1マス落ちるのにかける時間
const FLASH_MS = 380; // 溶けるときの光
const PAUSE_MS = 90; // 段と段の間

export class Game {
  constructor(root, stage, { onClear } = {}) {
    this.root = root;
    this.stage = stage;
    this.onClear = onClear;
    this.canvas = root.querySelector('#board');
    this.ctx = this.canvas.getContext('2d');
    this.handBox = root.querySelector('#hand');
    this.msg = root.querySelector('#message');
    this.spawnRows = Math.max(...stage.hand.map(h => Math.max(size(h.cells).w, size(h.cells).h)), 1);
    this.reset();
    this.bind();
    this.resize();
  }

  // ── 状態 ──
  reset() {
    this.state = createState(this.stage);
    this.history = [];
    this.anim = null;
    this.done = false;
    this.select(this.state.hand[0]?.orig ?? null);
    this.say('');
    this.render();
  }

  undo() {
    if (this.anim) this.finishAnim();
    const prev = this.history.pop();
    if (!prev) return;
    this.state = prev.state;
    this.done = false;
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
    const { w } = size(cur.cells);
    this.x = Math.max(0, Math.min(this.stage.W - w, this.x));
  }

  rotate(dir = 1) {
    if (!this.current() || this.anim) return;
    this.r = (this.r + dir + 4) % 4;
    this.clampX();
    this.render();
  }

  move(dx) {
    if (!this.current() || this.anim) return;
    this.x += dx;
    this.clampX();
    this.render();
  }

  dropNow() {
    if (this.anim) return this.finishAnim();
    const cur = this.current();
    if (!cur || this.done) return;
    const before = this.state;
    const d = drop(before, cur.idx, this.r, this.x);
    if (!d.ok) {
      this.say(d.reason === 'above' ? 'そこに置くと、器の上にはみ出して止まります。' : 'そこには置けません。');
      this.shake();
      return;
    }
    this.history.push({ state: before, orig: this.sel, r: this.r, x: this.x });
    this.say('');
    this.play(before, d, cur.cells);
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
    if (s.hand.length === 0) this.say('刻印が残りました。「一手戻す」か「やり直し」でもう一度。');
    this.render();
  }

  // ── 1段ずつ見せる ──
  // events から「どのピースを・どれだけ動かすか」の段を作り、順に再生する。
  play(before, d, cells) {
    const work = before.pieces.map(p => ({ ...p, cells: p.cells.map(c => [...c]) }));
    const steps = [];
    const events = d.events;
    const place = events[0];
    const { h } = size(cells);
    const topY = Math.min(...place.cells.map(c => c[1]));
    work.push({ id: place.id, mat: place.mat, cells: place.cells.map(c => [...c]), fixed: false });
    const dist = topY + h + SPAWN_GAP;
    steps.push({ pieces: snapshot(work), move: new Set([place.id]), dist, dur: Math.max(120, dist * FALL_MS * 0.6) });
    for (let i = 1; i < events.length; i++) {
      const e = events[i];
      if (e.type === 'fall') {
        // 同じピースが続けて落ちるなら、1つの段にまとめる
        let n = 1;
        while (events[i + n]?.type === 'fall' && sameIds(events[i + n].ids, e.ids)) n++;
        for (const p of work) if (e.ids.includes(p.id)) for (const c of p.cells) c[1] += n;
        steps.push({ pieces: snapshot(work), move: new Set(e.ids), dist: n, dur: n * FALL_MS + PAUSE_MS });
        i += n - 1;
      } else if (e.type === 'react') {
        const gone = new Set(e.removed.map(r => r.id));
        steps.push({ pieces: snapshot(work), flash: gone, dur: FLASH_MS });
        for (let k = work.length - 1; k >= 0; k--) if (gone.has(work[k].id)) work.splice(k, 1);
        steps.push({ pieces: snapshot(work), dur: PAUSE_MS });
      }
    }
    this.anim = { steps, i: 0, t0: performance.now(), final: d.state };
    const tick = now => {
      if (!this.anim) return;
      const a = this.anim;
      let st = a.steps[a.i];
      while (st && now - a.t0 >= st.dur) {
        a.t0 += st.dur;
        a.i++;
        st = a.steps[a.i];
      }
      if (!st) return this.finishAnim();
      const t = Math.min(1, (now - a.t0) / st.dur);
      const lift = new Map();
      if (st.move) for (const id of st.move) lift.set(id, st.dist * (1 - easeIn(t)));
      this.renderPieces(st.pieces, { lift, flash: st.flash, flashAlpha: 0.85 * Math.abs(Math.sin(t * Math.PI * 2)) });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  finishAnim() {
    if (!this.anim) return;
    this.state = this.anim.final;
    this.anim = null;
    this.afterMove();
  }

  // ── 入力 ──
  bind() {
    // ステージを替えるとき、つけた入力をまとめて外せるようにする
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
      return Math.max(0, Math.min(this.stage.W - w, colAt(ev) - Math.floor((w - 1) / 2)));
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
      if (this.anim) return this.finishAnim();
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
    cv.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      this.rotate(1);
    }, on);
    cv.addEventListener('wheel', ev => {
      ev.preventDefault();
      this.rotate(ev.deltaY > 0 ? 1 : -1);
    }, { passive: false, signal: this.ac.signal });
    this.onKey = ev => {
      if (ev.target instanceof HTMLInputElement || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const k = ev.key;
      if (k === 'ArrowLeft' || k === 'a') this.move(-1);
      else if (k === 'ArrowRight' || k === 'd') this.move(1);
      else if (k === 'ArrowUp' || k === 'r' || k === 'w') this.rotate(1);
      else if (k === 'ArrowDown' || k === ' ' || k === 'Enter' || k === 's') this.dropNow();
      else if (k === 'z' || k === 'Backspace') this.undo();
      else if (/^[1-9]$/.test(k)) {
        const orig = Number(k) - 1;
        if (this.state.hand.some(h => h.orig === orig)) {
          this.select(orig);
          this.render();
        }
      } else return;
      ev.preventDefault();
    };
    window.addEventListener('keydown', this.onKey, on);
    window.addEventListener('resize', () => this.resize(), on);
    this.root.querySelector('#btn-rotate').onclick = () => this.rotate(1);
    this.root.querySelector('#btn-drop').onclick = () => this.dropNow();
    this.root.querySelector('#btn-undo').onclick = () => this.undo();
    this.root.querySelector('#btn-reset').onclick = () => this.reset();
  }

  destroy() {
    this.ac.abort();
    this.anim = null;
  }

  // ── 描画 ──
  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const availW = Math.max(200, box.width - 8);
    const availH = Math.max(240, window.innerHeight - 260);
    const cell = Math.floor(Math.min(64, availW / (this.stage.W + 0.8), availH / (this.stage.H + this.spawnRows + 0.6)));
    this.L = layout(this.stage, this.spawnRows, Math.max(28, cell));
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
    const view = { stage: this.stage, pieces: this.state.pieces, icons: true };
    const cur = this.done ? null : this.current();
    if (cur) {
      const { h } = size(cur.cells);
      view.preview = { mat: cur.item.mat, cells: cur.cells.map(([cx, cy]) => [cx + this.x, cy - h]) };
      const land = landing(this.state, cur.cells, this.x);
      if (land.ok) view.ghost = { mat: cur.item.mat, cells: land.cells };
      else view.invalid = true;
    }
    draw(this.ctx, this.L, view);
  }

  renderPieces(pieces, extra) {
    draw(this.ctx, this.L, { stage: this.stage, pieces, icons: true, ...extra });
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

  say(text) {
    this.msg.textContent = text;
  }

  shake() {
    this.canvas.classList.remove('shake');
    void this.canvas.offsetWidth;
    this.canvas.classList.add('shake');
  }
}

function snapshot(pieces) {
  return pieces.map(p => ({ ...p, cells: p.cells.map(c => [...c]) }));
}

function sameIds(a, b) {
  return a.length === b.length && a.every(x => b.includes(x));
}

function easeIn(t) {
  return t * t;
}
