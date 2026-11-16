// テーマから問題を作る（並べて作り、テーマごとに要る数ができたら止める）。
//
//   node tools/themed.mjs テーマ1,テーマ2,... 1テーマの数 [働き手=24] [出力=themed.jsonl] [最初の種=1] [上限の秒=900]
//
// テーマは src/core/generate.js の THEMED の名前（melt・sand・tallIce・hornMelt・hornFire など）。
// 答えはいくつでもよい形（big）で作る。1行に1問、JSON で書き出す。

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { appendFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeThemed, rng } from '../src/core/generate.js';

if (isMainThread) {
  const [list, perArg = '3', n = '24', out = 'themed.jsonl', seed0 = '1', limit = '900'] = process.argv.slice(2);
  const themes = list.split(',');
  const per = Number(perArg);
  const got = Object.fromEntries(themes.map(t => [t, 0]));
  writeFileSync(out, '');
  const t0 = Date.now();
  const workers = [];
  const stop = why => {
    for (const w of workers) w.terminate();
    console.log(`${why}（${Math.round((Date.now() - t0) / 1000)} 秒）：${themes.map(t => `${t} ${got[t]}`).join('、')}`);
  };
  const timer = setTimeout(() => stop('時間切れ'), Number(limit) * 1000);
  for (let w = 0; w < Number(n); w++) {
    // 働き手をテーマに順に割り当てる
    const theme = themes[w % themes.length];
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { theme, seed: Number(seed0) * 1000000 + w * 7919 } });
    worker.on('message', c => {
      if (got[c.theme] >= per) return;
      got[c.theme]++;
      appendFileSync(out, JSON.stringify(c) + '\n');
      console.log(`${c.theme} ${got[c.theme]}/${per}（目安 ${c.bits}、答え ${c.finalStates}、${Math.round((Date.now() - t0) / 1000)} 秒）`);
      if (themes.every(t => got[t] >= per)) {
        clearTimeout(timer);
        stop('できた');
      }
    });
    workers.push(worker);
  }
} else {
  const { theme, seed } = workerData;
  for (let k = 0; ; k += 1) {
    let c = null;
    try {
      c = makeThemed(rng(seed + k), theme, { big: true });
    } catch {
      c = null;
    }
    if (c) parentPort.postMessage({ seed: seed + k, ...c });
  }
}
