// 新しい依頼を探す（Web Worker）。画面を止めないように、裏で問題を作る。
// 受け取る：{ seed, min, until }　返す：{ tried }（途中）／{ found, tried }／{ timeout, tried }

import { makeCandidate, rng } from '../core/generate.js';

self.onmessage = ev => {
  const { seed, min, until } = ev.data;
  const t0 = Date.now();
  for (let k = 0; Date.now() - t0 < until; k++) {
    let c = null;
    try {
      c = makeCandidate(rng(seed + k * 7919));
    } catch {
      c = null;
    }
    if (c && c.bits >= min && c.pathsNoReaction === 0) {
      self.postMessage({ found: c, tried: k + 1 });
      return;
    }
    if (k % 3 === 0) self.postMessage({ tried: k + 1 });
  }
  self.postMessage({ timeout: true });
};
