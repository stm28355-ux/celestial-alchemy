// お手本の再生：ステージの狙いの手順（solution）を、くり返し自動で見せる。師匠のノートで使う。

import { createState, drop } from '../core/rules.js';
import { size } from '../core/shape.js';
import { draw, layout, SPAWN_GAP } from './render.js';
import { buildSteps, runSteps } from './anim.js';

const AIM_MS = 650; // 落とす前に、ピースを器の上に見せておく時間
const END_MS = 1400; // 最後の盤面を見せておく時間

export class Replay {
  constructor(canvas, stage, cell = 36) {
    this.canvas = canvas;
    this.stage = stage;
    const spawn = Math.max(...stage.hand.map(h => Math.max(size(h.cells).w, size(h.cells).h)), 1);
    this.L = layout(stage, spawn, cell);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = this.L.width * dpr;
    canvas.height = this.L.height * dpr;
    canvas.style.width = `${this.L.width}px`;
    canvas.style.height = `${this.L.height}px`;
    this.ctx = canvas.getContext('2d');
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.stopped = false;
    this.loop();
  }

  async loop() {
    while (!this.stopped) {
      let s = createState(this.stage);
      this.show(s);
      await this.wait(END_MS / 2);
      for (const m of this.stage.solution) {
        if (this.stopped) return;
        const idx = s.hand.findIndex(h => h.orig === m.hand);
        if (idx < 0) break;
        const cells = s.hand[idx].rots[m.r];
        const { h } = size(cells);
        this.show(s, { mat: s.hand[idx].mat, cells: cells.map(([x, y]) => [x + m.x, y - h]) });
        await this.wait(AIM_MS);
        const d = drop(s, idx, m.r, m.x);
        if (!d.ok) break;
        await new Promise(done => {
          this.anim = runSteps(buildSteps(s, d, cells, SPAWN_GAP), (pieces, extra) => this.frame(pieces, extra), done);
        });
        s = d.state;
        this.show(s);
        await this.wait(300);
      }
      await this.wait(END_MS);
    }
  }

  show(s, preview) {
    if (this.stopped) return;
    draw(this.ctx, this.L, { stage: this.stage, pieces: s.pieces, icons: true, preview });
  }

  frame(pieces, extra) {
    if (this.stopped) return;
    draw(this.ctx, this.L, { stage: this.stage, pieces, icons: true, ...extra });
  }

  wait(ms) {
    return new Promise(done => setTimeout(done, ms));
  }

  stop() {
    this.stopped = true;
    this.anim?.cancel();
  }
}
