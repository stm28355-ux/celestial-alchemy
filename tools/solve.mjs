// npm run solve stages/xxx.txt [さらにファイルやフォルダ]
// ステージが解けるか、解がいくつあるか、反応を使わずに解けるか、狙いの手順で解けるかを出す。

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseStage } from '../src/core/stage.js';
import { solve, checkSolution } from '../src/core/solver.js';
import { initialProblems } from '../src/core/rules.js';
import { material } from '../src/core/materials.js';
import { rotate, shapeText } from '../src/core/shape.js';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('使い方：npm run solve stages/xxx.txt（フォルダも指定できる）');
  process.exit(1);
}

let failed = false;
for (const file of await expand(args)) {
  const text = await readFile(file, 'utf8');
  let stage;
  try {
    stage = parseStage(text);
  } catch (e) {
    console.log(`\n■ ${file}\n  読めません：${e.message}`);
    failed = true;
    continue;
  }
  console.log(`\n■ ${file}  ${stage.title}`);
  for (const p of initialProblems(stage)) console.log(`  注意：${p}`);

  const t0 = Date.now();
  const r = solve(stage);
  const ms = Date.now() - t0;
  console.log(`  解ける：${r.solvable ? 'はい' : 'いいえ'}${r.truncated ? '（探しきれていない）' : ''}`);
  console.log(`  クリアできる道筋：${r.paths}（反応を使わない道筋：${r.pathsNoReaction}）`);
  console.log(`  クリアしたときの盤面の種類：${r.finalStates}`);
  if (r.firstMoves.length) {
    console.log(`  最初の1手の候補：${r.firstMoves.length}`);
    for (const m of r.firstMoves.slice(0, 5)) console.log(`    ${moveText(stage, m)}（道筋 ${m.paths}）`);
  }
  if (stage.solution.length) {
    const c = checkSolution(stage);
    if (!c.ok) console.log(`  狙いの手順：${c.step + 1}手目で失敗（${c.reason}）`);
    else console.log(`  狙いの手順：${c.cleared ? 'クリア' : 'クリアにならない'}（反応 ${c.reactions}回）`);
    if (!c.ok || !c.cleared) failed = true;
  }
  if (!r.solvable) failed = true;
  console.log(`  調べた盤面：${r.nodes}（${ms}ms）`);
}
process.exit(failed ? 1 : 0);

function moveText(stage, m) {
  const h = stage.hand[m.orig];
  return `${m.orig + 1}番 ${material(h.mat).short} ${shapeText(rotate(h.cells, m.r))}（r${m.r} x${m.x}）`;
}

async function expand(paths) {
  const out = [];
  for (const p of paths) {
    if ((await stat(p)).isDirectory()) {
      const names = (await readdir(p)).filter(n => n.endsWith('.txt')).sort();
      out.push(...(await expand(names.map(n => join(p, n)))));
    } else {
      out.push(p);
    }
  }
  return out;
}
