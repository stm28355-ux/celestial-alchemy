// セーブ：端末のブラウザ（localStorage）に置く。使えないとき（プライベートモードなど）でも遊べるようにする。

const KEY = 'celestial-alchemy:save';

const data = load();

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { cleared: v.cleared ?? [], openAll: !!v.openAll, editor: v.editor ?? null, controls: v.controls === 2 ? 2 : 1 };
  } catch {
    return { cleared: [], openAll: false, editor: null, controls: 1 };
  }
}

function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 保存できなくても遊べる
  }
}

export const save = {
  isCleared: id => data.cleared.includes(id),
  markCleared(id) {
    if (!data.cleared.includes(id)) {
      data.cleared.push(id);
      store();
    }
  },
  get openAll() {
    return data.openAll;
  },
  set openAll(v) {
    data.openAll = !!v;
    store();
  },
  // マウスの操作タイプ。1：右クリックで回す・ホイールでピースを替える　2：右クリックでピースを替える・ホイールで回す
  get controls() {
    return data.controls;
  },
  set controls(v) {
    data.controls = v === 2 ? 2 : 1;
    store();
  },
  get editor() {
    return data.editor;
  },
  set editor(v) {
    data.editor = v;
    store();
  },
};
