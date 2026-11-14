import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseShape, rotate, uniqueRotations, shapeText, canonicalKey } from '../src/core/shape.js';
import { parseStage, parseStageText, stageToText, buildStage } from '../src/core/stage.js';
import { createState, drop, isCleared, initialProblems } from '../src/core/rules.js';
import { solve, checkSolution } from '../src/core/solver.js';

// 小さな盤面を手早く作る。
function stage(lines) {
  return parseStage(['format: 1', ...lines].join('\n'));
}
function cellsOf(s, mat) {
  return s.pieces.filter(p => p.mat === mat).flatMap(p => p.cells).map(([x, y]) => `${x},${y}`).sort();
}
function play(st, moves) {
  let s = createState(st);
  const events = [];
  for (const [i, r, x] of moves) {
    const d = drop(s, i, r, x);
    assert.ok(d.ok, `置けない手：${i} r${r} x${x}（${d.reason}）`);
    events.push(...d.events);
    s = d.state;
  }
  return { s, events };
}

test('形：回転と、向きの違いの数', () => {
  const L = parseShape('#./#./##');
  assert.equal(uniqueRotations(L).length, 4);
  assert.equal(uniqueRotations(parseShape('##/##')).length, 1);
  assert.equal(uniqueRotations(parseShape('####')).length, 2);
  assert.equal(shapeText(rotate(parseShape('##'), 1)), '#/#');
  assert.equal(canonicalKey(parseShape('##')), canonicalKey(parseShape('#/#')));
  assert.throws(() => parseShape('#x'));
});

test('ステージ：テキスト → 生の形 → テキスト で同じになる', async () => {
  const text = await readFile(new URL('../stages/sample/02-false-floor.txt', import.meta.url), 'utf8');
  const raw = parseStageText(text);
  assert.deepEqual(parseStageText(stageToText(raw)), raw);
  assert.deepEqual(JSON.parse(JSON.stringify(raw)), raw); // 共有URLに載せる JSON
  const st = buildStage(raw);
  assert.equal(st.W, 3);
  assert.equal(st.hand.length, 6);
});

test('ステージ：間違いを知らせる', () => {
  assert.throws(() => stage(['terrain:', '  ++', '  +']), /長さ/);
  assert.throws(() => stage(['terrain:', '  ++', 'hand:', '  water #']), /まだありません/);
  assert.throws(() => stage(['terrain:', '  ++', 'hand:', '  copper #']), /知らない素材/);
  assert.throws(() => stage(['terrain:', '  #+', 'pieces:', '  a.', 'legend:', '  a: lead']), /壁の上/);
});

test('落ちる：床まで落ちる。1マスでも支えがあれば、はみ出しても止まる', () => {
  const st = stage(['terrain:', '  ...', '  ...', '  ...', 'hand:', '  lead #', '  lead ##']);
  const { s } = play(st, [[0, 0, 0], [0, 0, 0]]);
  assert.deepEqual(cellsOf(s, 'lead'), ['0,1', '0,2', '1,1']); // ## は (0,2) の鉛に乗り、(1,1) は浮いたまま
});

test('落ちる：上端より上で止まる所には置けない', () => {
  const st = stage(['terrain:', '  +', 'hand:', '  lead #', '  lead #']);
  const s = play(st, [[0, 0, 0]]).s;
  assert.equal(drop(s, 0, 0, 0).reason, 'above');
  assert.equal(drop(s, 0, 0, 1).reason, 'outside');
});

test('落ちる：器の口が狭いと、口からしか入らない', () => {
  const st = stage(['terrain:', '  #.#', '  ...', 'hand:', '  lead #', '  lead ###']);
  const s = createState(st);
  assert.equal(drop(s, 0, 0, 0).ok, false);
  assert.equal(drop(s, 0, 0, 1).ok, true);
  assert.equal(drop(s, 1, 0, 0).ok, false); // 横に長いピースは口を通れない
});

test('反応：火種に触れた鱗はピースごと消え、火種は残る', () => {
  const st = stage(['terrain:', '  ...', '  ...', 'hand:', '  ice ###', '  fire #']);
  const { s, events } = play(st, [[0, 0, 0], [0, 0, 0]]);
  assert.deepEqual(cellsOf(s, 'ice'), []); // 1マスしか触れていないが、3マスとも消える
  assert.deepEqual(cellsOf(s, 'fire'), ['0,1']); // 溶けたあと、床まで落ちる
  const melt = events.find(e => e.type === 'react');
  assert.equal(melt.removed[0].cells.length, 3);
});

test('反応：溶けて落ちた火種が、下の鱗も溶かす（2段の連鎖）', () => {
  const st = stage([
    'terrain:', '  ..', '  ..', '  ..',
    'pieces:', '  ..', '  ..', '  ab',
    'legend:', '  a: ice', '  b: ice',
    'hand:', '  fire #',
  ]);
  const { s, events } = play(st, [[0, 0, 0]]);
  assert.equal(events.filter(e => e.type === 'react').length, 2);
  assert.deepEqual(cellsOf(s, 'ice'), []);
  assert.deepEqual(cellsOf(s, 'fire'), ['0,2']);
});

test('反応：同時に触れた鱗は、同じ段でまとめて溶ける', () => {
  const st = stage([
    'terrain:', '  ...', '  ...',
    'pieces:', '  ...', '  a.b',
    'legend:', '  a: ice', '  b: ice',
    'hand:', '  fire #',
  ]);
  const { events } = play(st, [[0, 0, 1]]);
  const reacts = events.filter(e => e.type === 'react');
  assert.equal(reacts.length, 1);
  assert.equal(reacts[0].removed.length, 2);
});

test('枠側の氷：動かずに支えになり、溶けると下の目標マスが空く', () => {
  const st = stage([
    'terrain:', '  +++', '  +++',
    'pieces:', '  ...', '  a..',
    'legend:', '  a: ice fixed',
    'hand:', '  lead ###', '  fire #',
  ]);
  let s = createState(st);
  assert.deepEqual(initialProblems(st), []);
  s = drop(s, 0, 0, 0).state; // ### は (0,1) の氷に乗って、上の段に止まる
  assert.deepEqual(cellsOf(s, 'lead'), ['0,0', '1,0', '2,0']);
  const d = drop(s, 0, 0, 1);
  assert.equal(d.ok, false); // 真ん中の列は鉛でふさがっている
});

test('クリア：手持ちを使い切り、目標マスが全部埋まる。空きマスは空いていてよい', () => {
  const st = stage(['terrain:', '  ..', '  ++', 'hand:', '  lead ##']);
  const { s } = play(st, [[0, 0, 0]]);
  assert.equal(isCleared(s), true);
  const st2 = stage(['terrain:', '  ++', 'hand:', '  lead #', '  lead #']);
  assert.equal(isCleared(play(st2, [[0, 0, 0]]).s), false); // 手持ちが残っている
});

test('最初の盤面の確かめ：浮いている、もう反応する', () => {
  const st = stage(['terrain:', '  ..', '  ..', 'pieces:', '  a.', '  ..', 'legend:', '  a: lead']);
  assert.match(initialProblems(st)[0], /浮いている/);
  const st2 = stage(['terrain:', '  ..', 'pieces:', '  ab', 'legend:', '  a: ice', '  b: fire']);
  assert.match(initialProblems(st2)[0], /反応/);
});

test('ソルバー：フタの一手は、答えが2つ（器を先に／ひっくり返してフタに）', async () => {
  const st = parseStage(await readFile(new URL('../stages/sample/01-lid.txt', import.meta.url), 'utf8'));
  const r = solve(st);
  assert.equal(r.solvable, true);
  assert.equal(r.paths, 2);
  assert.equal(r.finalStates, 2);
  assert.equal(r.pathsNoReaction, 2);
  assert.deepEqual(r.firstMoves.map(m => [m.orig, m.r, m.x]).sort(), [[0, 0, 0], [1, 0, 1]]);
  assert.equal(checkSolution(st).cleared, true);
});

test('ソルバー：仮の床は、反応を使わないと解けない', async () => {
  const st = parseStage(await readFile(new URL('../stages/sample/02-false-floor.txt', import.meta.url), 'utf8'));
  const r = solve(st);
  assert.equal(r.solvable, true);
  assert.equal(r.pathsNoReaction, 0);
  const c = checkSolution(st);
  assert.equal(c.cleared, true);
  assert.equal(c.reactions, 1);
});

test('ソルバー：行き止まりの見切りは、答えを取りこぼさない（小さな盤面200個で、見切りなしと比べる）', () => {
  let seed = 12345;
  const rand = n => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const SHAPES = ['#', '##', '###', '#/#', '##/#.', '#./##', '##/##', '#.#/###', '###/.#.'];
  const MATS = ['lead', 'lead', 'lead', 'ice', 'fire'];
  let solvable = 0;
  for (let n = 0; n < 200; n++) {
    const W = 2 + rand(3), H = 2 + rand(2);
    const terrain = Array.from({ length: H }, () =>
      Array.from({ length: W }, () => '++++.#'[rand(6)]).join(''),
    ).map((row, y) => (y === 0 ? row.replace(/#/g, '.') : row));
    const hand = Array.from({ length: 2 + rand(3) }, () => `  ${MATS[rand(MATS.length)]} ${SHAPES[rand(SHAPES.length)]}`);
    const st = stage(['terrain:', ...terrain.map(r => `  ${r}`), 'hand:', ...hand]);
    const a = solve(st);
    const b = solve(st, { prune: false });
    assert.deepEqual(
      [a.paths, a.pathsNoReaction, a.finalStates],
      [b.paths, b.pathsNoReaction, b.finalStates],
      terrain.join('/') + ' ' + hand.join(','),
    );
    if (a.solvable) solvable++;
  }
  assert.ok(solvable > 10, `解けるものが少なすぎる：${solvable}`);
});

test('ソルバー：解けないステージ', () => {
  const st = stage(['terrain:', '  +++', 'hand:', '  lead ##']);
  assert.equal(solve(st).solvable, false);
});
