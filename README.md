# Celestial Alchemy（セレスティアル・アルケミー）

錬金素材のピースを横から見た器に落とし、素材どうしの反応で盤面を動かして、器の刻印をぴったり埋めるパズル。見習い錬金術師が7人の師匠を訪ね、称号「天体」を目指す。

**遊ぶ：** https://stm28355-ux.github.io/celestial-alchemy/

まだ作り始めたところです（フェーズ0：ルールとソルバー）。進み具合は [Milestones](https://github.com/stm28355-ux/celestial-alchemy/milestones) を見てください。

## 開発

```bash
npm run serve                  # http://localhost:5190/
npm test                       # テスト
npm run solve stages/xxx.txt   # ステージが解けるか、解がいくつあるかを出す
```

ビルドはありません。`index.html` と `src/` がそのまま GitHub Pages で動きます。計画は [docs/plan.md](docs/plan.md)。
