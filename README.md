# Celestial Alchemy（セレスティアル・アルケミー）

錬金素材のピースを横から見た器に落とし、素材どうしの反応で盤面を動かして、器の刻印をぴったり埋めるパズル。見習い錬金術師が7人の師匠を訪ね、称号「天体」を目指す。

**遊ぶ：** https://stm28355-ux.github.io/celestial-alchemy/

今は試作です（10問：反応なし5問、溶ける5問）。進み具合は [Milestones](https://github.com/stm28355-ux/celestial-alchemy/milestones) を見てください。

## 遊び方

1. 右の「手持ち」からピースを選ぶ（好きな順に使える）
2. 器の上でマウスを動かして列を選び、右クリックかホイールで回す。点線の影が、止まる場所
3. クリックで落とす。ピースは形を保ったまま落ち、1マスでも支えがあれば止まる
4. 刻印（○）のマスを全部埋めて、手持ちを使い切ると調合成功
5. 6問目から：サラマンダーの火種に触れた氷竜の鱗は、ピースごと溶けて消える。上に乗っていたピースは落ちる

キー：← → 列、↑ か R 回す、↓ か Space 落とす、Z 一手戻す、1〜9 ピースを選ぶ。

## 開発

```bash
npm run serve                  # http://localhost:5190/
npm test                       # テスト
npm run solve stages/xxx.txt   # ステージが解けるか、解がいくつあるかを出す
```

ビルドはありません。`index.html` と `src/` がそのまま GitHub Pages で動きます。計画は [docs/plan.md](docs/plan.md)。
