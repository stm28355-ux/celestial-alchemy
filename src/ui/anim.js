// 1手の「起きたこと」（events）を、見せる段に分けて再生する。パズル画面とお手本の再生で使う。

import { size } from '../core/shape.js';

const FALL_MS = 55; // 1マス落ちるのにかける時間
const FLASH_MS = 380; // 溶けるときの光
const PAUSE_MS = 90; // 段と段の間
const SLIDE_MS = 70; // 押されて1マス滑るのにかける時間

// before：落とす前の状態、d：drop の結果、cells：落とした形、gap：器の口から浮かせた高さ
export function buildSteps(before, d, cells, gap = 0) {
  const work = snapshot(before.pieces);
  const steps = [];
  const events = d.events;
  const place = events[0];
  const { h } = size(cells);
  const topY = Math.min(...place.cells.map(c => c[1]));
  work.push({ id: place.id, group: place.id, mat: place.mat, dir: place.dir, cells: place.cells.map(c => [...c]), fixed: false });
  const dist = topY + h + gap;
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
      if (gone.size) {
        steps.push({ pieces: snapshot(work), flash: gone, dur: FLASH_MS });
        for (let k = work.length - 1; k >= 0; k--) if (gone.has(work[k].id)) work.splice(k, 1);
      }
      // つるが伸びる：伸びたピースを光らせる
      if (e.grown?.length) {
        for (const g of e.grown) work.find(p => p.id === g.id)?.cells.push(...g.cells.map(c => [...c]));
        steps.push({ pieces: snapshot(work), flash: new Set(e.grown.map(g => g.id)), dur: FLASH_MS * 0.8 });
      }
      // ばらける（星砂）：ピースを1マスずつの粒に入れ替えて、粒を軽く光らせる
      if (e.split?.length) {
        for (const sp of e.split) {
          const k = work.findIndex(p => p.id === sp.id);
          if (k < 0) continue;
          const old = work[k];
          work.splice(k, 1, ...sp.into.map(g => ({ id: g.id, group: g.id, mat: old.mat, cells: g.cells.map(c => [...c]), fixed: old.fixed })));
        }
        steps.push({ pieces: snapshot(work), flash: new Set(e.split.flatMap(sp => sp.into.map(g => g.id))), dur: FLASH_MS * 0.6 });
      }
      // くっつく：組を入れ替える（のりの印が出る）
      if (e.groups) {
        const map = new Map(e.groups);
        for (const p of work) if (map.has(p.id)) p.group = map.get(p.id);
      }
      steps.push({ pieces: snapshot(work), dur: PAUSE_MS });
      // 押す（角笛）：押されたピースを横に滑らせる
      for (const ps of e.pushed ?? []) {
        for (const p of work) if (ps.ids.includes(p.id)) for (const c of p.cells) c[0] += ps.dx;
        const n = Math.abs(ps.dx);
        steps.push({ pieces: snapshot(work), slide: new Set(ps.ids), sdist: ps.dx, dur: n * SLIDE_MS + PAUSE_MS });
      }
    }
  }
  return steps;
}

// 段を順に再生する。frame(pieces, extra) で描き、終わると done()。返り値の finish() で最後まで飛ばす。
export function runSteps(steps, frame, done) {
  let i = 0;
  let t0 = performance.now();
  let stopped = false;
  const finish = () => {
    if (stopped) return;
    stopped = true;
    done();
  };
  const tick = now => {
    if (stopped) return;
    let st = steps[i];
    while (st && now - t0 >= st.dur) {
      t0 += st.dur;
      i++;
      st = steps[i];
    }
    if (!st) return finish();
    const t = Math.min(1, (now - t0) / st.dur);
    const lift = new Map();
    if (st.move) for (const id of st.move) lift.set(id, st.dist * (1 - t * t));
    const shift = new Map();
    if (st.slide) {
      const u = Math.min(1, (now - t0) / Math.max(1, st.dur - PAUSE_MS));
      for (const id of st.slide) shift.set(id, -st.sdist * (1 - u));
    }
    frame(st.pieces, { lift, shift, flash: st.flash, flashAlpha: 0.85 * Math.abs(Math.sin(t * Math.PI * 2)) });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return {
    finish,
    cancel() {
      stopped = true;
    },
  };
}

export function snapshot(pieces) {
  return pieces.map(p => ({ ...p, cells: p.cells.map(c => [...c]) }));
}

function sameIds(a, b) {
  return a.length === b.length && a.every(x => b.includes(x));
}
