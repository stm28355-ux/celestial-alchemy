// 生成の速さを測る：決まった種で、テーマごとに作ってみて、かかった時間とできた問題を出す。
//   node tools/bench-gen.mjs テーマ 最初の種 数 [出力.json]
// 直す前と後で同じ種を使い、できた問題が変わらないこと（答え・目安が同じ）も確かめる。
import { writeFileSync } from 'node:fs';
import { makeThemed, rng } from '../src/core/generate.js';

const [key, start = '9000', count = '15', out] = process.argv.slice(2);
const t0 = Date.now();
const found = [];
for (let k = 0; k < Number(count); k++) {
  const seed = Number(start) + k;
  let c = null;
  try {
    c = makeThemed(rng(seed), key, { big: true });
  } catch {
    c = null;
  }
  if (c) found.push({ seed, bits: c.bits, finalStates: c.finalStates, terrain: c.raw.terrain.join('/'), hand: c.raw.hand.join(',') });
}
const sec = (Date.now() - t0) / 1000;
console.log(`${key}：${count} 回で ${found.length} 問、${sec.toFixed(1)} 秒（1問あたり ${found.length ? (sec / found.length).toFixed(1) : '-'} 秒）`);
if (out) writeFileSync(out, JSON.stringify({ key, sec, found }, null, 1));
