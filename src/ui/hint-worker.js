// ヒントの計算（Web Worker）。画面を止めないように、裏でソルバーを動かす。
// 受け取る：{ id, state }　返す：{ id, move, solvable, truncated }
// move は「クリアにつながる最初の1手」のうち、続く道筋がいちばん多いもの（迷いにくい手）。

import { solveState, solveRooms, roomsOf } from '../core/solver.js';

self.onmessage = ev => {
  const { id, state, maxNodes = 400000 } = ev.data;
  try {
    // 壁で区切られた部屋が2つ以上ある器は、全体をさっと調べて、調べきれなければ部屋ごとに調べる（最後の調合など）
    const multi = roomsOf(state).length >= 2;
    let r = solveState(state, { maxNodes: multi ? 30000 : maxNodes });
    if (r.truncated && multi) r = solveRooms(state, { maxNodes }) ?? r;
    const best = [...r.firstMoves].sort((a, b) => b.paths - a.paths)[0] ?? null;
    self.postMessage({
      id,
      move: best,
      solvable: r.solvable,
      truncated: r.truncated,
      paths: r.paths,
      pathsNoReaction: r.pathsNoReaction,
      finalStates: r.finalStates,
    });
  } catch (e) {
    self.postMessage({ id, error: String(e?.message ?? e) });
  }
};
