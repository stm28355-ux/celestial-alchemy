import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseShape, rotate, uniqueRotations, shapeText, canonicalKey } from '../src/core/shape.js';
import { parseStage, parseStageText, stageToText, buildStage } from '../src/core/stage.js';
import { createState, drop, isCleared, initialProblems } from '../src/core/rules.js';
import { solve, checkSolution } from '../src/core/solver.js';
import { encodeStage, decodeStage } from '../src/core/share.js';

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
  assert.throws(() => stage(['terrain:', '  ++', 'hand:', '  sand #']), /まだありません/);
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

test('×印：最後に何も残っていてはいけない。途中で止まるのはよい', () => {
  const st = stage(['terrain:', '  x.', '  ++', 'hand:', '  lead ##', '  lead #']);
  assert.equal(isCleared(play(st, [[0, 0, 0], [0, 0, 1]]).s), true);
  assert.equal(isCleared(play(st, [[0, 0, 0], [0, 0, 0]]).s), false); // ×印の上に残った
  // 鱗を×印に仮置きして、あとで溶かす
  const st2 = stage(['terrain:', '  x.', '  ++', 'hand:', '  lead ##', '  ice #', '  fire #']);
  const r = play(st2, [[0, 0, 0], [0, 0, 0], [0, 0, 1]]);
  assert.equal(r.s.pieces.some(p => p.mat === 'ice'), false);
  assert.equal(isCleared(r.s), true);
  assert.equal(solve(st2).solvable, true);
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
  for (const chars of ['++++.#', '+++..#x']) {
  let solvable = 0;
  for (let n = 0; n < 200; n++) {
    const W = 2 + rand(3), H = 2 + rand(2);
    const terrain = Array.from({ length: H }, () =>
      Array.from({ length: W }, () => chars[rand(chars.length)]).join(''),
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
  assert.ok(solvable > 10, `解けるものが少なすぎる：${solvable}（${chars}）`);
  }
});

test('章のステージとお手本：読めて、最初の盤面に問題がなく、狙いの手順でクリアできる', async () => {
  const root = new URL('../stages/', import.meta.url);
  const chapters = JSON.parse(await readFile(new URL('chapters.json', root), 'utf8'));
  assert.equal(chapters.length, 8);
  const ids = new Set();
  for (const ch of chapters) {
    for (const path of ch.stages) {
      const st = parseStage(await readFile(new URL(path, root), 'utf8'));
      assert.match(st.id, new RegExp(`^ch${ch.id}-[0-9]{2}$`), path);
      assert.ok(!ids.has(st.id), `id がかぶっている：${st.id}`);
      ids.add(st.id);
      assert.deepEqual(initialProblems(st), [], path);
      const c = checkSolution(st);
      assert.ok(c.ok && c.cleared, `${path}：狙いの手順でクリアできない`);
      // 答えが絞れていること（クリアしたときの盤面は2種類まで）
      const r = solve(st);
      assert.ok(!r.truncated && r.finalStates <= 2, `${path}：答えが多すぎる（${r.finalStates}）`);
    }
  }
  const notes = JSON.parse(await readFile(new URL('notes.json', root), 'utf8'));
  for (const n of notes) {
    const st = parseStage(await readFile(new URL(n.stage, root), 'utf8'));
    assert.deepEqual(initialProblems(st), [], n.stage);
    assert.ok(checkSolution(st).ok, `${n.stage}：お手本の手順が打てない`);
  }
});

test('共有URL：ステージを文字にして、元に戻せる', async () => {
  const text = await readFile(new URL('../stages/ch2/06-chain.txt', import.meta.url), 'utf8');
  const raw = parseStageText(text);
  const code = await encodeStage(raw);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeStage(code), raw);
});

test('ソルバー：解けないステージ', () => {
  const st = stage(['terrain:', '  +++', 'hand:', '  lead ##']);
  assert.equal(solve(st).solvable, false);
});

// ── 3・4章の素材（水玉・つる・ゼリー） ──
function cellsOfPiece(s, mat) {
  return s.pieces.filter(p => p.mat === mat).map(p => p.cells.map(([x, y]) => `${x},${y}`).sort());
}

test('つる×水玉：水玉は吸われて消え、つるがいちばん上の真上に1マス伸びる', () => {
  const st = stage(['terrain:', '  ..', '  ..', 'pieces:', '  ..', '  a.', 'legend:', '  a: vine', 'hand:', '  water #']);
  const { s, events } = play(st, [[0, 0, 1]]);
  assert.deepEqual(cellsOfPiece(s, 'vine'), [['0,0', '0,1']]);
  assert.deepEqual(cellsOfPiece(s, 'water'), []);
  const r = events.find(e => e.type === 'react');
  assert.deepEqual(r.grown, [{ id: 1, cells: [[0, 0]] }]);
  assert.equal(r.removed[0].why, 'absorb');
});

test('つる：伸びる先がふさがっていたら伸びず、水玉も残る（器の上端も同じ）', () => {
  const blocked = stage(['terrain:', '  ..', '  ..', 'pieces:', '  b.', '  a.', 'legend:', '  a: vine', '  b: lead', 'hand:', '  water #']);
  const s1 = play(blocked, [[0, 0, 1]]).s;
  assert.deepEqual(cellsOfPiece(s1, 'water'), [['1,1']]);
  const top = stage(['terrain:', '  ..', '  ..', 'pieces:', '  a.', '  a.', 'legend:', '  a: vine', 'hand:', '  water #']);
  const s2 = play(top, [[0, 0, 1]]).s;
  assert.deepEqual(cellsOfPiece(s2, 'vine'), [['0,0', '0,1']]);
  assert.deepEqual(cellsOfPiece(s2, 'water'), [['1,1']]);
});

test('つる：水玉2つで2マス伸びる。水玉が吸われると、上に乗っていた物が落ちる', () => {
  const st = stage(['terrain:', '  ...', '  ...', '  ...', 'pieces:', '  ...', '  ...', '  .a.', 'legend:', '  a: vine', 'hand:', '  water #', '  water #']);
  const s = play(st, [[0, 0, 0], [0, 0, 2]]).s;
  assert.deepEqual(cellsOfPiece(s, 'vine'), [['1,0', '1,1', '1,2']]);
  const st2 = stage(['terrain:', '  ..', '  ..', '  ..', 'pieces:', '  ..', '  .b', '  .a', 'legend:', '  a: water', '  b: lead', 'hand:', '  vine #']);
  const s2 = play(st2, [[0, 0, 0]]).s;
  assert.deepEqual(cellsOfPiece(s2, 'lead'), [['1,2']]);
  assert.deepEqual(cellsOfPiece(s2, 'vine'), [['0,1', '0,2']]);
});

test('つるは回せない（縦の棒だけ）', () => {
  const st = stage(['terrain:', '  ...', 'hand:', '  vine #/#']);
  const s = createState(st);
  assert.equal(s.hand[0].uniq.length, 1);
  assert.deepEqual(s.hand[0].rots[1], s.hand[0].rots[0]);
  assert.throws(() => stage(['terrain:', '  ...', 'hand:', '  vine ##']), /縦の棒/);
});

test('火種×つる：つるが燃えて消える。火種×水玉：両方消える', () => {
  const st = stage(['terrain:', '  ..', '  ..', 'pieces:', '  a.', '  a.', 'legend:', '  a: vine', 'hand:', '  fire #']);
  const s = play(st, [[0, 0, 1]]).s;
  assert.deepEqual(cellsOfPiece(s, 'vine'), []);
  assert.deepEqual(cellsOfPiece(s, 'fire'), [['1,1']]);
  const st2 = stage(['terrain:', '  ..', 'pieces:', '  a.', 'legend:', '  a: water', 'hand:', '  fire #']);
  const s2 = play(st2, [[0, 0, 1]]).s;
  assert.equal(s2.pieces.length, 0);
});

test('ゼリー：触れたピースとくっつき、組ごと支えられる（下の鱗が溶けても落ちない）', () => {
  const st = stage([
    'terrain:', '  ....', '  ....',
    'pieces:', '  .asb', '  .i.c',
    'legend:', '  a: lead', '  s: slime', '  b: lead', '  i: ice', '  c: lead',
    'hand:', '  fire #',
  ]);
  const s0 = createState(st);
  const byMat = (st0, mat, x) => st0.pieces.find(p => p.mat === mat && p.cells[0][0] === x);
  const A = byMat(s0, 'lead', 1), S = byMat(s0, 'slime', 2), B = byMat(s0, 'lead', 3);
  assert.equal(A.group, S.group);
  assert.equal(S.group, B.group); // a・ゼリー・b が1つの組
  assert.notEqual(s0.pieces.find(p => p.mat === 'lead' && p.cells[0][1] === 1).group, A.group); // c はゼリーに触れていない
  const s = play(st, [[0, 0, 0]]).s; // 火種が (0,1) に落ちて鱗を溶かす
  assert.deepEqual(cellsOfPiece(s, 'ice'), []);
  assert.deepEqual(cellsOfPiece(s, 'lead').sort(), [['1,0'], ['3,0'], ['3,1']]); // a は落ちない
});

test('ゼリー：鱗はつるつるで、くっつかない（触れても止まらない、組にもならない）', () => {
  // 鱗の柱の横に落としたゼリーは、止まらずに床まで落ちる
  const st = stage(['terrain:', '  ...', '  ...', '  ...', 'pieces:', '  ...', '  a..', '  a..', 'legend:', '  a: ice', 'hand:', '  slime #']);
  const s = play(st, [[0, 0, 1]]).s;
  assert.deepEqual(cellsOfPiece(s, 'slime'), [['1,2']]);
  assert.notEqual(s.pieces.find(p => p.mat === 'slime').group, s.pieces.find(p => p.mat === 'ice').group);
  // 枠に貼りついたゼリーの横を、鱗は通り抜ける
  const st2 = stage(['terrain:', '  ...', '  ...', '  ...', 'pieces:', '  a..', '  ...', '  ...', 'legend:', '  a: slime', 'hand:', '  ice #']);
  assert.deepEqual(cellsOfPiece(play(st2, [[0, 0, 1]]).s, 'ice'), [['1,2']]);
});

test('ゼリー：落ちる途中で横に触れたら、そこで止まる（壁・器の枠・ピース）', () => {
  // 柱の横：柱の上の段で止まり、下は空いたまま
  const st = stage(['terrain:', '  ...', '  ...', '  ...', 'pieces:', '  ...', '  a..', '  a..', 'legend:', '  a: lead', 'hand:', '  slime #']);
  const s = play(st, [[0, 0, 1]]).s;
  assert.deepEqual(cellsOfPiece(s, 'slime'), [['1,1']]);
  // 器の枠ぎわに落とすと、いちばん上で貼りつく
  const st2 = stage(['terrain:', '  ..', '  ..', '  ..', 'hand:', '  slime #']);
  assert.deepEqual(cellsOfPiece(play(st2, [[0, 0, 0]]).s, 'slime'), [['0,0']]);
  // ふつうの鉛は横に触れても止まらない
  const st3 = stage(['terrain:', '  ...', '  ...', '  ...', 'pieces:', '  ...', '  a..', '  a..', 'legend:', '  a: lead', 'hand:', '  lead #']);
  assert.deepEqual(cellsOfPiece(play(st3, [[0, 0, 1]]).s, 'lead').flat().sort(), ['0,1', '0,2', '1,2']);
});

test('ゼリー：横の壁につかまっているので、下の鱗が溶けても落ちない', () => {
  // ゼリーは内側の壁に貼りつき、その横に落ちた火種はゼリーにつかまって止まる（下の鱗に触れて溶かす）
  const st = stage([
    'terrain:', '  #..', '  #..',
    'pieces:', '  .s.', '  .ii',
    'legend:', '  s: slime', '  i: ice',
    'hand:', '  fire #',
  ]);
  const s = play(st, [[0, 0, 2]]).s;
  assert.deepEqual(cellsOfPiece(s, 'ice'), []);
  assert.deepEqual(cellsOfPiece(s, 'slime'), [['1,0']]);
  assert.deepEqual(cellsOfPiece(s, 'fire'), [['2,0']]);
});

test('ゼリー：先に置いたゼリーの横を落ちるピースも、そこでくっついて止まる', () => {
  const st = stage(['terrain:', '  ...', '  ...', '  ...', 'pieces:', '  a..', '  ...', '  ...', 'legend:', '  a: slime', 'hand:', '  lead #']);
  const s = play(st, [[0, 0, 1]]).s;
  assert.deepEqual(cellsOfPiece(s, 'lead'), [['1,0']]);
  assert.equal(s.pieces.find(p => p.mat === 'lead').group, s.pieces.find(p => p.mat === 'slime').group);
});
