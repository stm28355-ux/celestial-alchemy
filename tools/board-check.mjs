// 依頼の掲示板の全問を確かめる（数分かかる）。npm run test:board（tools/board-check.mjs）
import { spawnSync } from 'node:child_process';

const r = spawnSync(process.execPath, ['--test', '--test-name-pattern=依頼の掲示板'], { stdio: 'inherit', env: { ...process.env, BOARD_ALL: '1' } });
process.exit(r.status ?? 1);
