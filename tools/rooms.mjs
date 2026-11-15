// 部屋分けの確かめ：上から下まで壁の列で区切られた器を、部屋ごとに調べて、全体のクリア盤面の数を出す。
// 手持ちが多くて全体をソルバーで調べきれない問題（最後の調合など）に使う。
//
//   node tools/rooms.mjs stage.txt

import { readFile } from 'node:fs/promises';
import { parseStage } from '../src/core/stage.js';
import { createState } from '../src/core/rules.js';
import { solveRooms, roomsOf } from '../src/core/solver.js';

const st = parseStage(await readFile(process.argv[2], 'utf8'));
const s = createState(st);
console.log(`部屋：${roomsOf(s).map((q, i) => `${i + 1}（${q.start}〜${q.end}列）`).join('、')}`);
const r = solveRooms(s);
if (!r) console.log('部屋が1つしかありません。tools/solve.mjs を使ってください。');
else console.log(`解ける：${r.solvable ? 'はい' : 'いいえ'}　クリア盤面の数：${r.finalStates}${r.truncated ? '（調べきれない部屋がありました）' : ''}　最初の1手の候補：${r.firstMoves.length}`);
