# PV の作り方

X 投稿用の PV（1080×1920・約31秒）を、ゲームの実際のプレイ映像と
[mp4mp3](https://github.com/cadmium2525/mp4mp3) の「つなぐ」（動画エディタ）・「かなでる」（作曲）で作る。
素材と書き出し（`pv/media/`・`pv/out/`）は容量が大きいのでコミットしない。

| ファイル | 内容 |
|---|---|
| `capture.mjs` | ゲームを撮影モード（`?debug&capture`）で開き、1/30 秒ずつ進めて1コマずつ撮影 → ffmpeg で MP4。場面ごとのシード・攻撃・自動操縦の設定もここ |
| `bgm.gen.mjs` → `bgm.json` | BGM（132 BPM・F メジャー）。映像の区切りの拍に合わせた構成、効果音、尿の「シャー」 |
| `project.gen.mjs` → `project.json` | 編集内容。素材の長さを読み、拍に合わせてカットとテロップを並べる |

```sh
npm run build && npx http-server dist -p 4173 &          # base を / でビルドした場合は URL を合わせる
node pv/capture.mjs http://localhost:4173/ pv/media       # 全場面を撮影（ソフトウェア描画だと1場面 5〜15 分）
HIT=...  # 命中の拍: 50 + (hit.mp4 の長さ − 4.3) ÷ (60/132)
HIT_BEAT=$HIT CLEAR_BEAT=47.35 node pv/bgm.gen.mjs > pv/bgm.json
node <mp4mp3>/daw/tools/render.mjs pv/bgm.json pv/media/bgm.wav --report
# 書き出し用 Chromium は H.264 を読めないので、素材は VP9 の WebM にしてから渡す
mkdir -p pv/media/final && for n in open intro queue drunk elderly muscle clear hit title; do
  ffmpeg -i pv/media/$n.mp4 -c:v libvpx-vp9 -crf 16 -b:v 0 pv/media/final/$n.webm; done
cp pv/media/bgm.wav pv/media/final/
HIT_BEAT=$HIT node pv/project.gen.mjs pv/media > pv/project.json
node <mp4mp3>/editor/tools/render.mjs pv/project.json pv/media/final pv/out/mato_pv.mp4 --short 1080
```

- 冒頭はサムネイルになるので、1コマ目から「2WAY のサラリーマン」のプレイ画面とテロップをフェードなしで出す
- 自動操縦（`?debug&autopilot`）は公平性テストと同じ計画型ボット（`src/debug/Autopilot.ts`）
