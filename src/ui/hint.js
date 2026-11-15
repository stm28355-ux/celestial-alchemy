// ヒントを裏で計算して返す（hint-worker.js とのやりとり）。
// 解けるかの確かめ（エディタ）にも使う。

let worker = null;
let nextId = 1;
const waiting = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./hint-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ev => {
      const done = waiting.get(ev.data.id);
      waiting.delete(ev.data.id);
      done?.(ev.data);
    };
  }
  return worker;
}

// state は rules.js の状態。{ move, solvable, truncated } を返す。
export function askHint(state, maxNodes) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, res => (res.error ? reject(new Error(res.error)) : resolve(res)));
    getWorker().postMessage({ id, state, maxNodes });
  });
}
