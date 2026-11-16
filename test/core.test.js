import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseShape, rotate, uniqueRotations, shapeText, canonicalKey } from '../src/core/shape.js';
import { parseStage, parseStageText, stageToText, buildStage } from '../src/core/stage.js';
import { createState, drop, isCleared, initialProblems } from '../src/core/rules.js';
import { solve, checkSolution, solveRooms, solveState } from '../src/core/solver.js';
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
  for (const chars of ['++++.#', '+++..#x', '++++.#-']) {
  let solvable = 0;
  for (let n = 0; n < 200; n++) {
    const W = 2 + rand(3), H = 2 + rand(2);
    const terrain = Array.from({ length: H }, () =>
      Array.from({ length: W }, () => chars[rand(chars.length)]).join(''),
    ).map((row, y) => (y === 0 ? row.replace(/#/g, '.') : row));
    const hand = Array.from({ length: 2 + rand(3) }, () => `  ${MATS[rand(MATS.length)]} ${SHAPES[rand(SHAPES.length)]}`);
    const open = chars.includes('-') ? ['open:', `  floor ${rand(W)}`, `  right ${rand(H)}`] : [];
    const st = stage(['terrain:', ...terrain.map(r => `  ${r}`), ...open, 'hand:', ...hand]);
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
      // 手持ちが多い問題（最後の調合）は、壁で区切られた部屋ごとに調べる
      let r = solve(st, { maxNodes: 300000 });
      if (r.truncated) r = solveRooms(createState(st)) ?? r;
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

// ── ヘルメスの星砂 ──
test('星砂：止まると1マスずつの粒にばらけて、真下に落ちる。止まる場所はばらける前の形で決まる', () => {
  const st = stage(['terrain:', '  ...', '  ...', '  #.#', 'hand:', '  sand ###']);
  const { s, events } = play(st, [[0, 0, 0]]);
  assert.deepEqual(cellsOf(s, 'sand'), ['0,1', '1,2', '2,1'].sort());
  assert.equal(s.pieces.filter(p => p.mat === 'sand').length, 3);
  assert.ok(events.some(e => e.type === 'react' && e.split.length === 1));
});

test('星砂：フタの下には入らない。火種では消えない。ゼリーは粒をまとめる', () => {
  // フタ（鉛の横棒）の下は空いたまま
  const st = stage(['terrain:', '  ...', '  ...', '  ...', 'pieces:', '  ...', '  .aa', '  ..b', 'legend:', '  a: lead', '  b: lead', 'hand:', '  sand ###']);
  assert.deepEqual(initialProblems(st), []);
  assert.deepEqual(cellsOf(play(st, [[0, 0, 0]]).s, 'sand'), ['0,2', '1,0', '2,0']);
  const st2 = stage(['terrain:', '  ..', '  ..', 'hand:', '  fire #', '  sand #/#']);
  assert.deepEqual(cellsOf(play(st2, [[0, 0, 0], [0, 0, 1]]).s, 'sand'), ['1,0', '1,1']);
  // ゼリーに触れた粒だけが、ゼリーとくっつく
  const st3 = stage(['terrain:', '  ....', '  ....', 'hand:', '  sand ##', '  slime #']);
  const s3 = play(st3, [[0, 0, 0], [0, 0, 2]]).s;
  const at = (x, y) => s3.pieces.find(p => p.cells.some(c => c[0] === x && c[1] === y));
  assert.equal(at(1, 1).group, at(2, 1).group);
  assert.notEqual(at(0, 1).group, at(1, 1).group);
});

// ── シルフの角笛 ──
test('角笛：止まると、口の前のピースを壁まで横に押す。口の向きは r0 右・r1 左', () => {
  const st = stage(['terrain:', '  ....', '  ....', 'pieces:', '  ....', '  .a..', 'legend:', '  a: lead', 'hand:', '  horn #']);
  assert.deepEqual(cellsOf(play(st, [[0, 0, 0]]).s, 'lead'), ['3,1']);
  const st2 = stage(['terrain:', '  ....', '  ....', 'pieces:', '  ....', '  ..a.', 'legend:', '  a: lead', 'hand:', '  horn #']);
  assert.deepEqual(cellsOf(play(st2, [[0, 1, 3]]).s, 'lead'), ['0,1']);
  // 口の前でなければ押さない
  assert.deepEqual(cellsOf(play(st2, [[0, 0, 3]]).s, 'lead'), ['2,1']);
});

test('角笛：押されたピースは、下が空いていれば落ちる。上に乗っていた物は置いていかれる', () => {
  const st = stage(['terrain:', '  ....', '  ....', '  ##..', 'pieces:', '  .b..', '  .a..', '  ....', 'legend:', '  a: lead', '  b: ice', 'hand:', '  horn #']);
  assert.deepEqual(initialProblems(st), []);
  const s = play(st, [[0, 0, 0]]).s;
  // 鉛は右の壁まで滑ってから下の段へ落ち、上に乗っていた鱗はその場で真下に落ちる
  assert.deepEqual(cellsOf(s, 'lead'), ['3,2']);
  assert.deepEqual(cellsOf(s, 'ice'), ['1,1']);
});

test('角笛：左右から押されたピースは動かない。下が溶けて落ちると、もう一度押す', () => {
  const st = stage(['terrain:', '  .....', 'pieces:', '  b.a.c', 'legend:', '  a: lead', '  b: horn', '  c: horn left', 'hand:', '  horn #']);
  assert.ok(initialProblems(st).length === 0);
  const st2 = stage(['terrain:', '  ...', '  ...', 'pieces:', '  ...', '  .b.', 'legend:', '  b: lead', 'hand:', '  horn #', '  lead #']);
  // 角笛を左に置いて鉛を右へ。もう1つ鉛を真ん中に置いても、角笛は止まったままなので押さない
  const s = play(st2, [[0, 0, 0], [0, 0, 1]]).s;
  assert.deepEqual(cellsOf(s, 'lead'), ['1,1', '2,1']);
  // 鱗の上の角笛：鱗が溶けて落ちると、落ちた先で押す
  const st3 = stage(['terrain:', '  ...', '  ...', 'pieces:', '  ...', '  a.c', 'legend:', '  a: ice', '  c: lead', 'hand:', '  horn #', '  fire #']);
  const s3 = play(st3, [[0, 0, 0], [0, 0, 1]]).s;
  assert.deepEqual(cellsOf(s3, 'horn'), ['0,1']);
  assert.deepEqual(cellsOf(s3, 'lead'), ['2,1']); // 押しても壁ぎわなので動かない
});

// ── 消したマスと、外した枠 ──
test('消したマス（-）：通り抜けられるが、止まる手は置けない', () => {
  const st = stage(['terrain:', '  -++', '  +++', 'hand:', '  lead #', '  lead #/#']);
  assert.equal(drop(createState(st), 1, 0, 0).reason, 'rim'); // 縦2マスを左に：上のマスが消したマス
  assert.equal(drop(createState(st), 0, 0, 0).ok, true); // 1マスなら通り抜けて下で止まる
});

test('低い枠（左だけ）：マスはそのまま。枠のない高さでは、ゼリーがつかまれない', () => {
  const st = stage(['terrain:', '  ...', '  ...', '  ...', 'open:', '  left 0', 'hand:', '  slime #', '  lead #/#/#']);
  assert.deepEqual(cellsOf(play(st, [[0, 0, 2]]).s, 'slime'), ['2,0']); // 右はいちばん上で貼りつく
  assert.deepEqual(cellsOf(play(st, [[0, 0, 0]]).s, 'slime'), ['0,1']); // 左は枠のある高さで貼りつく
  assert.equal(drop(createState(st), 1, 0, 0).ok, true); // 枠のない高さのマスにも置ける
});

test('底の穴：穴から落ちる手は置けない。穴をまたげば置ける。反応のあとで落ちる手も置けない', () => {
  const st = stage(['terrain:', '  ...', '  ...', 'open:', '  floor 1', 'hand:', '  lead #', '  lead ###']);
  assert.equal(drop(createState(st), 0, 0, 1).reason, 'spill');
  assert.equal(drop(createState(st), 0, 0, 0).ok, true);
  assert.deepEqual(cellsOf(play(st, [[1, 0, 0]]).s, 'lead'), ['0,1', '1,1', '2,1']); // 穴の上にかかる
  const st2 = stage(['terrain:', '  ..', '  ..', 'open:', '  floor 0', 'pieces:', '  b.', '  aa', 'legend:', '  a: ice', '  b: lead', 'hand:', '  fire #']);
  assert.deepEqual(initialProblems(st2), []);
  assert.equal(drop(createState(st2), 0, 0, 1).reason, 'spill');
});

test('角笛：低い枠の高さで押すと器の外へ出るので置けない。枠のある高さなら枠で止まる', () => {
  const st = stage(['terrain:', '  ....', '  ....', 'open:', '  right 0', 'pieces:', '  ..a.', '  .cc.', 'legend:', '  a: lead', '  c: lead', 'hand:', '  horn #']);
  assert.deepEqual(initialProblems(st), []);
  assert.equal(drop(createState(st), 0, 0, 1).reason, 'spill');
  const st2 = stage(['terrain:', '  ....', '  ....', 'open:', '  right 0', 'pieces:', '  ....', '  ..b.', 'legend:', '  b: lead', 'hand:', '  horn #']);
  assert.deepEqual(cellsOf(play(st2, [[0, 0, 1]]).s, 'lead'), ['3,1']);
});

test('枠を外す（open）は文字に書き出して、元に戻せる', () => {
  const st = stage(['terrain:', '  ...', '  ...', 'open:', '  left 0 1', '  floor 2', 'hand:', '  lead #']);
  assert.deepEqual(st.open, { left: [0, 1], right: [], floor: [2] });
  const again = parseStage(stageToText(st.raw));
  assert.deepEqual(again.open, st.open);
  assert.throws(() => stage(['terrain:', '  ..', 'open:', '  floor 5']), /器の外/);
});

// ── 賢者の石と金 ──
test('賢者の石：触れた鉛は金になり、つながった鉛に広がる。別の鉛のピースでも触れていれば広がる', () => {
  const st = stage(['terrain:', '  ....', '  ....', 'pieces:', '  ....', '  .aab', 'legend:', '  a: lead', '  b: lead', 'hand:', '  stone #']);
  const { s, events } = play(st, [[0, 0, 0]]);
  assert.deepEqual(cellsOf(s, 'gold'), ['1,1', '2,1', '3,1']);
  assert.deepEqual(cellsOf(s, 'stone'), ['0,1']); // 石は残る
  const g = events.find(e => e.type === 'react').gilded;
  assert.deepEqual(g.flatMap(p => p.cells).map(c => c[2]).sort(), [1, 2, 3]); // 石から1マスずつ広がる
});

test('賢者の石：鉛以外で区切ると止まる。あとから金に触れた鉛も金になる', () => {
  const st = stage(['terrain:', '  ....', '  ....', 'pieces:', '  ....', '  .ab.', 'legend:', '  a: lead', '  b: ice', 'hand:', '  stone #', '  lead #']);
  const s = play(st, [[0, 0, 0]]).s;
  assert.deepEqual(cellsOf(s, 'gold'), ['1,1']);
  // 金の上に落ちてきた鉛も金になる
  const s2 = play(st, [[0, 0, 0], [0, 0, 1]]).s;
  assert.deepEqual(cellsOf(s2, 'gold'), ['1,0', '1,1']);
});

test('金の刻印は金で、鉛の刻印は鉛で埋める', () => {
  const st = stage(['terrain:', '  GL', 'hand:', '  stone #', '  lead #']);
  // 石を右に置いて左に鉛 → 鉛が金に。金の刻印は埋まるが、石が鉛の刻印にいるので失敗
  assert.equal(isCleared(play(st, [[0, 0, 1], [0, 0, 0]]).s), false);
  const st2 = stage(['terrain:', '  ..', '  GL', 'pieces:', '  ..', '  ab', 'legend:', '  a: lead', '  b: lead', 'hand:', '  stone #']);
  // 鉛が2つ並んでいると、両方金になってしまう
  assert.deepEqual(cellsOf(play(st2, [[0, 0, 0]]).s, 'gold'), ['0,1', '1,1']);
  assert.equal(solve(st2).solvable, false);
});

test('部屋分け：壁で区切られた部屋ごとに調べても、全体を調べたのと同じ盤面の数になる', () => {
  let seed = 7;
  const rand = n => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const SHAPES = ['#', '##', '#/#', '##/#.', '###'];
  const MATS = ['lead', 'lead', 'ice', 'fire', 'slime', 'sand', 'horn', 'stone'];
  let compared = 0;
  for (let n = 0; n < 60; n++) {
    const room = () => Array.from({ length: 2 }, () => Array.from({ length: 1 + rand(2) }, () => '++.GLx'[rand(6)]).join(''));
    const a = room(), b = room();
    const terrain = [0, 1].map(y => a[y] + '#' + b[y]);
    const hand = Array.from({ length: 2 + rand(3) }, () => {
      const m = MATS[rand(MATS.length)];
      return `  ${m} ${m === 'horn' || m === 'stone' ? '#' : m === 'sand' ? '##' : SHAPES[rand(SHAPES.length)]}`;
    });
    let st;
    try {
      st = stage(['terrain:', ...terrain.map(r => `  ${r}`), 'hand:', ...hand]);
    } catch {
      continue;
    }
    const whole = solve(st);
    const rooms = solveRooms(createState(st));
    assert.equal(rooms.finalStates, whole.finalStates, terrain.join('/') + ' ' + hand.join(','));
    if (whole.solvable) assert.ok(rooms.firstMoves.length > 0);
    compared++;
  }
  assert.ok(compared > 40);
});

// ── 問題の生成と依頼の掲示板 ──
test('生成：作った問題は狙いの手順でクリアでき、答えが1つ', async () => {
  const { makeCandidate, rng } = await import('../src/core/generate.js');
  // 作れることが分かっている種で確かめる（同じ種からは、いつも同じ問題ができる）
  for (const [seed, bits] of [[1935369, 20.9], [4406105, 19.3]]) {
    const c = makeCandidate(rng(seed));
    assert.ok(c, `種 ${seed}：作れない`);
    assert.equal(c.bits, bits);
    const st = parseStage(stageToText(c.raw));
    const ch = checkSolution(st);
    assert.ok(ch.ok && ch.cleared, `種 ${seed}：狙いの手順でクリアできない`);
    assert.equal(solve(st).finalStates, 1);
  }
});

// 全問の確かめは時間がかかる（数分）。ふだんは10問おきに1問、BOARD_ALL=1（npm run test:board）で全問
test('依頼の掲示板：どの問題も読めて、狙いの手順でクリアでき、答えが1つ', async () => {
  const board = JSON.parse(await readFile(new URL('../stages/board.json', import.meta.url), 'utf8'));
  assert.ok(board.length >= 100, `問題が足りない（${board.length}）`);
  const ids = new Set();
  for (const [k, b] of board.entries()) {
    assert.ok(!ids.has(b.id), `id が重なっている：${b.id}`);
    ids.add(b.id);
    const st = parseStage(b.text);
    assert.deepEqual(initialProblems(st), [], b.id);
    const c = checkSolution(st);
    assert.ok(c.ok && c.cleared, `${b.id}：狙いの手順でクリアできない`);
    if (!process.env.BOARD_ALL && k % 10 !== 0) continue;
    const r = solve(st, { maxNodes: 400000 });
    assert.ok(!r.truncated && r.finalStates === 1, `${b.id}：答えが1つでない（${r.finalStates}）`);
  }
});

test('作り方の試作：テーマの気付きを使い、メインの素材を鉛に替えると解けない', async () => {
  const { THEMED } = await import('../src/core/generate.js');
  const { FEATURES } = await import('../src/core/solver.js');
  const trial = JSON.parse(await readFile(new URL('../stages/board-trial.json', import.meta.url), 'utf8'));
  for (const b of trial) {
    const st = parseStage(b.text);
    const th = THEMED[b.theme];
    const r = solveState(createState(st), { feature: FEATURES[th.feature], maxNodes: 600000 });
    // 大きい器の試作（big）は答えがいくつあってもよい
    assert.ok(r.solvable && (b.big || r.finalStates === 1) && r.pathsWithoutFeature === 0, `${b.id}：どの答えも気付きを使う`);
    if (!th.main) continue; // メインが最初から置く物のテーマ（高い鱗）は、器の形で確かめ済み
    const swapped = { ...st.raw, hand: st.raw.hand.map(h => (h.startsWith(`${th.main} `) ? `lead ${h.split(' ')[1]}` : h)) };
    assert.equal(solve(parseStage(stageToText(swapped))).solvable, false, `${b.id}：鉛に替えても解ける`);
  }
});
