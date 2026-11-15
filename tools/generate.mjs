// 依頼の掲示板の問題を、たくさん作って難しいものを集める。
//
//   node tools/generate.mjs [集める数=300] [難しさの下限=16] [働き手の数=20] [出力=gen.jsonl] [最初の種=1]
//
// 働き手（worker_threads）ごとに違う種でランダムに作り、下限以上の難しさのものを1行ずつ JSON で書き出す。
// 選ぶのは tools/board.mjs（重なりを除いて、テーマが偏らないように100問）。

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { appendFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeCandidate, rng } from '../src/core/generate.js';

if (isMainThread) {
  const [want = '300', min = '16', n = '20', out = 'gen.jsonl', seed0 = '1'] = process.argv.slice(2);
  writeFileSync(out, '');
  let got = 0;
  let tried = 0;
  const t0 = Date.now();
  const workers = [];
  for (let w = 0; w < Number(n); w++) {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { seed: Number(seed0) * 100000 + w, step: Number(n), min: Number(min) } });
    worker.on('message', m => {
      tried += m.tried;
      if (!m.found) return;
      appendFileSync(out, JSON.stringify(m.found) + '\n');
      got++;
      if (got % 10 === 0) console.log(`${got} 問（ためした ${tried}、${Math.round((Date.now() - t0) / 1000)} 秒）`);
      if (got >= Number(want)) {
        for (const x of workers) x.terminate();
        console.log(`おわり：${got} 問、ためした ${tried}`);
      }
    });
    workers.push(worker);
  }
} else {
  const { seed, step, min } = workerData;
  for (let k = 0; ; k++) {
    const s = seed + k * step * 7919;
    const r = rng(s);
    let found = null;
    try {
      const c = makeCandidate(r);
      if (c && c.bits >= min) found = { seed: s, ...c };
    } catch {
      // ルールの都合で作れない組み合わせは飛ばす
    }
    parentPort.postMessage({ tried: 1, found });
  }
}
