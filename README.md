# 的、逃走中。（TARGET ESCAPE）

> あなたは的です。襲いかかってくる小便から逃げてください。

男子小便器の内側に貼られた「的」になって、次々に現れる利用者の尿の着弾をかわし、何人分を生き延びられるかを競う 3D ブラウザゲームです。
Three.js + TypeScript + Vite の完全クライアントサイド構成で、GitHub Pages の無料枠で配信できます（サーバー・API・DB・認証なし）。

- 企画: [`GAME_DESIGN.md`](./GAME_DESIGN.md)
- 実装指示: [`CLAUDE_CODE_INSTRUCTIONS.md`](./CLAUDE_CODE_INSTRUCTIONS.md)

## 遊び方

| 操作 | キー |
|---|---|
| 移動 | WASD / 矢印キー |
| ポーズ / 再開 | Esc（P でも可） |
| スタート / 演出スキップ / リトライ | Enter / Space |
| リトライ（リザルト画面） | R |
| タイトルへ（リザルト・ポーズ画面） | T |

- 黄色いリングは**相手の照準**。点滅中は予備動作（まだ発射しない）、常時表示は発射中です。
- 尿は発射時点の照準に向かって飛び、飛行時間（約0.3秒）後に着弾します。**発射後に的を追尾しません**。
- 1人分の排尿が終わるまで生き残ると「◯人抜き」。一度でも命中するとゲームオーバー。
- 画面右下の「順番待ち」と、カメラが映す行列は実際の登場順と一致しています。
- ウィンドウのフォーカスが外れると自動でポーズします。

### URL パラメータ

| パラメータ | 内容 |
|---|---|
| `?seed=123` | 乱数シード固定（同じ行列順・照準の揺れを再現） |
| `?low` | 低画質モード（影なし・アンチエイリアスなし・解像度1倍） |
| `?debug` | `window.__MATO__.state()` で内部状態を参照可能（E2E確認用） |
| `?debug&god` | デバッグ用の無敵モード（被弾を無視） |

## ローカル開発

Node.js 22 以上を推奨（Vite 8 の要件: `^20.19 || >=22.12`）。

```bash
npm install
npm run dev        # http://localhost:5173/ で起動
npm test           # ユニットテスト（Vitest）
npm run typecheck  # 型チェック
npm run build      # 型チェック + 本番ビルド（dist/）
npm run preview    # ビルド結果の確認
```

サブパス配信を手元で確認する場合:

```bash
VITE_BASE_PATH=/mato/ npm run build
```

## GitHub Pages への公開

`.github/workflows/deploy.yml` が `main` への push と手動実行（workflow_dispatch）で
`npm ci → npm test → npm run build → Pages Artifact アップロード → デプロイ` を行います。

**リポジトリ側で必要な手動設定（1回だけ）**

1. GitHub のリポジトリ画面で **Settings → Pages** を開く
2. **Build and deployment → Source** を **GitHub Actions** にする
3. `main` に push するか、Actions タブから「Deploy to GitHub Pages」を手動実行する

公開URLの想定: `https://cadmium2525.github.io/mato/`
（Pages を有効化してワークフローが成功するまでは公開されていません）

### base パスの決め方（`vite.config.ts`）

1. `VITE_BASE_PATH` があればそれを使う
2. GitHub Actions 上では `GITHUB_REPOSITORY` からリポジトリ名を取り `/REPO/` にする
   （`USER.github.io` リポジトリ＝ユーザー/組織ページの場合はルート `/`）
3. それ以外（ローカル）は `/`

## 実装状況

### Phase 1: Playable Vertical Slice — 完了

- Vite + Three.js 起動、WebGL 非対応時のエラーメッセージ
- 曲面メッシュの小便器（陶器マテリアル・排水口・フラッシュバルブ）、公衆トイレの部屋、隣の便器と仕切り
- 内壁の表面座標 `(u,v)` と `surfacePoint` / `surfaceNormal` / `toMetricUV` / `clampToPlayableArea`
- キーボード移動（斜め正規化・境界制限・矢印/Spaceでスクロールしない・フォーカス喪失でポーズ）
- 照準AI（反応遅延・追尾速度上限・時間連続の揺れ）と、飛行時間を持つ single 尿攻撃
- swept 判定による命中、被弾→スロー演出→ゲームオーバー、生存で「◯人抜き」、次ラウンド、リトライ
- タイトル / 導入テキスト / 行列カメラパン / ROUND_READY の入場演出 / HUD / リザルト / ポーズ
- 行列表示（3D + HUD）と実際の登場順が同じキューデータで一致
- ニアミス・回避スコア・ローカルベスト（localStorage 失敗時も継続）
- 4キャラの外見と設定値。サラリーマンが完成形。酔っ払いの揺れ・おじいちゃんの断続発射＋再開予兆・マッチョの大きな着弾は共通コントローラで数値反映済み
- 難易度テーブル（1〜3: single / 4〜: twoWay / 8〜: threeWay / 13〜: shotgun / 18〜: combo）と追尾倍率。**ただし Phase 1 で実際に生成されるのは single のみ**

### 後回し（Phase 2 以降）

- Phase 2: twoWay / threeWay / shotgun / combo の Impact 生成と安全な回避経路の保証、マッチョの跳ね返り二次Impactと予兆、キャラ別の予兆演出の調整
- Phase 3: 汚れの蓄積、効果音（Web Audio）と ON/OFF、行列の前進演出の強化、グラフィックス設定 UI、レスポンシブ調整、チュートリアル
- 対象外: スマホタッチ、ゲームパッド、オンラインランキング

### テスト

```bash
npm test
```

| ファイル | 内容 |
|---|---|
| `tests/Collision.test.ts` | 半径和未満で命中・以上で非命中、着弾時刻、swept 判定、縦横実寸比、ニアミスは1攻撃1回 |
| `tests/RoundDirector.test.ts` | シード再現、表示キューと消費キューの一致、生存で+1・被弾で+0、リトライ短縮、ポーズ |
| `tests/DifficultyDirector.test.ts` | 1〜3 single のみ、4/8/13/18人目の解禁、追尾倍率の上限 |
| `tests/Player.test.ts` | 入力なしで静止、境界、斜め正規化、横断0.7秒、判定半径、u=弧長の等方性、法線 |
| `tests/Enemy.test.ts` | 4キャラ設定の妥当性、予備動作、照準の非ワープ、シード再現、断続発射、**発射済み着弾位置が的の移動で変わらない** |
| `tests/ScoreManager.test.ts` | ベスト保存/読込、localStorage 例外・取得不可・壊れたJSONでも落ちない、比較順、加点 |
| `tests/RoundSimulation.test.ts` | 静止した的には命中、見えている情報だけで避けるボットが全4キャラを生き延びられる（回避経路の存在）、ラウンド間で着弾を引き継がない、再現性 |

## 技術上の決定事項（仮仕様）

- **表面モデル**: 内壁は鉛直な楕円柱の一部（横半径0.20m・奥行0.24m・左右±62°・高さ0.46m）。`u` は角度ではなく**弧長の割合**に対応させたので、`toMetricUV(u,v) = (u·幅, v·高さ)` が曲面上の実距離と一致する（局所補正をテーブルで内包）。
- **単位**: ロジックはメートル・秒。判定はメトリック座標の円同士。
- **固定ステップ**: 判定は 1/120 秒の固定ステップ、フレーム間隔の上限は 0.1 秒。
- **尿のモデル**: 発射中は 1/60 秒ごとに Impact を生成（判定時間 0.09 秒）。尿流は 0.6 秒ごとに別の攻撃IDに区切り、ニアミスはその単位で1回。
- **公平性**: 照準の追尾速度は的の速度（横幅/0.7秒 ≒ 0.64m/s）より必ず遅い（難易度倍率込み、テストで保証）。照準は的と反対側から出現し、予備動作 0.9〜1.1 秒は発射しない。
- **判定半径**: 的の見た目半径 3.2cm × 0.85。
- **カメラ**: プレイ中は便器正面に固定（画面右 = u+、上 = v+）。プレイ中は利用者の体がカメラと重なるため非表示にし、入場・退場はカメラを引いた画で見せる。
- **スコア**: 生存1秒10点、ニアミス100点、1.5秒以内の連続3回ごとに+300点、1人完遂+500点。ベストは人数→スコア→生存時間で比較。
- **シード**: 毎ゲームランダム（`?seed=` で固定）。待機列・照準の揺れ位相を再現できる。
- **素材**: 外部画像・フォント・音源なし。人物・便器はプリミティブと自前の曲面メッシュ、タイルと的はCanvasで生成。

## ディレクトリ

```text
src/
├── main.ts                  起動・WebGL チェック
├── styles.css               トイレ案内表示風のUI
├── game/                    Game（統括）, GameConfig, GameState, RoundDirector, RoundSimulation,
│                            DifficultyDirector, ScoreManager, SeededRandom
├── input/InputManager.ts
├── scene/                   RestroomScene, UrinalSurface, CameraDirector, QueueView, PersonFactory,
│                            StreamVFX, SurfaceMarkers, textures
├── entities/                TargetPlayer, EnemyProfiles, EnemyController, QueueManager
├── attacks/                 AttackTypes, AttackDirector, Collision
└── ui/                      HUD, Screens
tests/                       Vitest
```

描画（scene/）・判定（attacks/, game/RoundSimulation）・敵AI（entities/）・難易度・UI・状態遷移（RoundDirector）は分離しています。
