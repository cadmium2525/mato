# Claude Code 実装指示書 — 『的、逃走中。』

あなたはこのリポジトリの実装担当エンジニアです。先に `GAME_DESIGN.md` を読み、ゲームの体験・決定事項を守ってください。**設計案の提示だけで終わらず、実際に動くコードとテスト、デプロイ設定まで作ってください。** 無用な確認質問はせず、仮仕様で合理的に進めてください。

## 0. 最重要の制約

- 完全クライアントサイド。Three.js + TypeScript + Vite。サーバー/API/DB/ユーザー認証なし。
- GitHub Pagesの無料枠で配信できる静的サイト。ビルド後の `dist/` にすべて入る。
- 有料素材・有料API・商用ライセンスが不明な素材は禁止。人物や便器は最初は幾何形状で構築。外部画像取得を必須にしない。
- 実行時に外部サービスへ依存しない。CDN依存よりnpmインストール+バンドルを優先。
- デスクトップChrome/Firefox/Safariの新しめの環境を対象とする。WebGLが使えない場合はエラーメッセージを表示。
- 人体の露骨な部分を描画する必要はない。着衣の人物・背面/上半身/シルエットと射線表現で十分。
- 既存作業を破壊しない。変更履歴を残し、区切りごとにビルド・動作確認する。
- 追加のゲームエンジン、物理エンジン、UIフレームワークは原則導入しない。

## 1. プロジェクト立ち上げ

1. 現在のリポジトリ状態を確認。未初期化なら Vite vanilla-ts を作成する。
2. `three` をdependencies、`vite`と`typescript`をdevDependenciesに追加。必要なら `@types/three` も追加。
3. npm scripts: `dev`, `build`, `preview`, `test`、必要なら `typecheck` を作る。
4. `npm install`、`npm run build` を通す。
5. `vite.config.ts` の `base` を GitHub Actions用に設定。`GITHUB_REPOSITORY` からrepo名を使うか、`VITE_BASE_PATH`で設定可能にする。ユーザー/組織ページのルート公開にも対応できる設計にする。
6. `.github/workflows/deploy.yml` を用意。`main`へのpushと手動実行で `npm ci`→`npm run build`→Pages Artifactアップロード→デプロイ。必要権限 `contents: read`, `pages: write`, `id-token: write` を付与。
7. READMEにローカル起動、ビルド、Pages有効化（Settings → Pages → GitHub Actions）、公開URLの想定、操作説明を記載。

## 2. 推奨ディレクトリ

```text
.
├── GAME_DESIGN.md
├── CLAUDE_CODE_INSTRUCTIONS.md
├── README.md
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .github/workflows/deploy.yml
├── src/
│   ├── main.ts
│   ├── game/Game.ts
│   ├── game/GameState.ts
│   ├── game/GameConfig.ts
│   ├── game/RoundDirector.ts
│   ├── game/SeededRandom.ts
│   ├── game/DifficultyDirector.ts
│   ├── game/ScoreManager.ts
│   ├── input/InputManager.ts
│   ├── scene/RestroomScene.ts
│   ├── scene/UrinalSurface.ts
│   ├── scene/CameraDirector.ts
│   ├── entities/TargetPlayer.ts
│   ├── entities/EnemyProfiles.ts
│   ├── entities/QueueManager.ts
│   ├── attacks/AttackTypes.ts
│   ├── attacks/AttackDirector.ts
│   ├── attacks/Collision.ts
│   ├── ui/HUD.ts
│   ├── ui/Screens.ts
│   └── styles.css
└── tests/
    ├── Collision.test.ts
    ├── RoundDirector.test.ts
    └── DifficultyDirector.test.ts
```

分割は参考。実際に分かりやすくなるなら整理してよいが、描画、物理的判定、敵AI、難易度、UI、状態遷移は分離すること。

## 3. ゲーム状態遷移

`TITLE → INTRO → QUEUE_PAN → ROUND_READY → PLAYING → ROUND_CLEAR → (QUEUE_PAN / ROUND_READY) → ... → GAME_OVER → TITLE or RETRY`

- `PAUSED` はプレイ中の停止状態。時間計算を停止。
- INTROは初回短いテキスト演出。「あなたは的です。襲いかかってくる小便から逃げてください。」を正確に表示。
- キュー表示はプレイヤーに**次の人間を予告する機能**。実際の登場順との乖離がないよう同じキューデータを使う。
- プレイ中にゲーム状態を変えるときは、古い攻撃判定・タイマー・パーティクルを適切に破棄。
- 時間計算は `deltaTime` ベース、長いフレーム間隔では上限を設ける。可能なら固定ステップ更新で判定の安定性を担保。

## 4. 3Dシーンと表面座標

### 便器のモデリング
- Three.jsのMesh（曲面メッシュ生成）で陶器製の内壁と外形を用意。
- プレイヤーが動ける面を `(u,v) ∈ [0,1]²` とする。境界は `isInsidePlayableArea(u,v)` または `clampToPlayableArea` で制限。
- `surfacePoint(u,v) => Vector3` と `surfaceNormal(u,v) => Vector3` を実装し、的と着弾VFXを同一の面に貼り付ける。
- 曲面に沿った見た目にしつつ、当たり判定は2D表面座標で行う。横縦の物理スケール差を反映する `toMetricUV` を用意。
- 内壁の下部に排水口を表現。奥側を少し凹ませ、反射光・粗さ・影でリアルな陶器らしさを出す。

### 人物/行列
- 初期は着衣のローポリ人物4種（体格・服色・姿勢で判別可能）をThree.jsプリミティブで生成。
- 行列位置を固定し、先頭から順に並び、プレイ前または合間のカメラパンで列を見せる。
- キューは事前に生成した敵ID列を保持。人物をランダムに描くだけの実装は不可。

### カメラ
- INTRO: 便器全体→QUEUE_PAN: 行列へ振る→ROUND_READY: 便器アップ→PLAYING: 固定。
- カメラ制御中は的が意図せず被弾しないこと。
- 演出は初回に意味が通り、2周目以降のリトライでは短縮/スキップ可能。

## 5. 操作と判定

### Input
- WASD/矢印キーの入力を正規化し、斜め移動が速くならないようにする。
- 初期値として便器横幅を約0.7秒で横断する移動速度。調整値はGameConfigにまとめる。
- 窓フォーカスを失ったらポーズ。ゲーム中の矢印/Spaceでページスクロールしない。
- ダッシュはサブ機能として実装してもよいが、最初の完成を阻害しない。無敵化しない。

### 衝突判定
- 2D表面座標上で `playerRadius + projectileRadius` の円同士の距離比較。
- `toMetricUV`で縦横方向の長さを均一化し、曲面の歪みが大きい場所は必要に応じ距離を局所補正。
- 見た目の的の半径より判定半径を10〜20%小さく設定。
- 連続移動で判定をすり抜けないよう、弾/着弾の前フレーム座標からのswept判定またはサブステップ処理を検討。少なくとも高速移動と低FPSで検証。
- ニアミスは「入って出る」1イベントにつき1加点。攻撃IDと判定状態を保存。

### 照準と飛行時間
- キャラには `targetTrackingSpeed`, `reactionDelay`, `aimNoise`, `streamDuration`, `impactRadius`, `shotPattern` などの設定を持たせる。
- 人間の照準点は的を遅延追尾する。発射時の照準を**固定した弾/着弾イベント**を発生させる。
- `timeToImpact`経過後に命中判定を有効にする。発射後のプレイヤー移動を追尾して補正しない。
- 視覚上の尿の筋と内部の着弾イベントのタイミングが一致するようにする。

## 6. 攻撃を増やすための設計

### 必須型（概念）

```ts
type AttackKind = 'single' | 'twoWay' | 'threeWay' | 'shotgun' | 'combo';

type Impact = {
  id: number;
  attackId: number;
  u: number;
  v: number;
  radius: number;
  impactAt: number;
  endAt: number;
};

type EnemyKind = 'salaryman' | 'drunk' | 'elderly' | 'muscle';

type EnemyProfile = {
  kind: EnemyKind;
  durationSeconds: number;
  trackingSpeed: number;
  reactionDelaySeconds: number;
  aimNoise: number;
};
```

- `AttackDirector`が攻撃パターンから**複数のImpactを生成**する。Rendererはその配列を可視化するだけにする。
- `single`: 単一衝突円。
- `twoWay`: 左右に分かれた2本。センターの回避隙間を確保。
- `threeWay`: 三方向への着弾。
- `shotgun`: 扇状の着弾を5〜7粒程度で始める（調整可能）。粒はそれぞれ独立判定。弾道は発射時に確定。
- `combo`: 時間差で上記を組み合わせる。全方位を瞬時に塞がない。
- `DifficultyDirector`は**相手の通し番号**を入力し、使える攻撃セット・追尾倍率・発射間隔を返す。初期案: 1〜3 single、4〜7 twoWay、8〜12 threeWay、13〜17 shotgun、18以降 combo。ただしキャラごとの癖は維持する。
- 乱数はシード付きにし、行列順、攻撃の揺れ、ショットガン散布を再現可能にする。
- 敵が交代した時の弾/着弾を前ラウンドから引き継がない。

## 7. 4人の敵の仕様

- `salaryman`: 高精度な追尾。まずMVPとして完全実装。
- `drunk`: 追尾位置に時間連続的な左右揺れと遅れ。**フレームごとの完全乱数ワープは禁止**。
- `elderly`: 断続的な発射パルスと停止・再開の予兆。時間は長め。
- `muscle`: 着弾が大きい / 跳ね返り判定を二次Impactとして追加。発動予兆を示す。
- 全員に共通の `EnemyController` インターフェースを使い、データと挙動差分で拡張。
- MVPでは残り3人の実装を後回しにしてよいが、データ定義・TODOを残す。第2段階で4人全員と全攻撃を実装する。

## 8. UI・記録

- UI文言は日本語、デザインは清潔なトイレ案内表示風（無機質な文字）。
- HUD: `◯人抜き`, 現敵名、残り秒数（または進行バー）、スコア。
- リザルト: `GAME OVER`、`◯人抜き！`、スコア、ニアミス、ベスト更新、リトライ。
- メインランキングは人数。人数が同じ場合は副スコアで記録更新を判定。
- `localStorage` アクセス失敗時もゲームが継続するよう `try/catch` で保護。
- 重要なボタンはキーボードでもアクセス可能にする。

## 9. 実装順序 — 各フェーズの完了を必ず確認

**Phase 1: Playable Vertical Slice（最優先）**
1. Vite+Three.js起動。簡易3D小便器と動く的。
2. 表面座標とキーボード制御、移動境界。
3. サラリーマンAIが照準を追尾、一定の飛行時間を持つsingle尿攻撃。
4. 当たり判定、死亡、8秒生存で1人クリア、次ラウンド、人数カウント、リトライ。
5. 仮タイトル/HUD/簡易導入/行列（実順序と一致）。
6. buildと最小ユニットテストを通す。

**Phase 2: Full Core**
7. 残り3キャラを実装。列に4人を表示。
8. 2WAY/3WAY/shotgun/comboと人数解禁テーブル。
9. ニアミス・副スコア、自己ベスト、ポーズ。
10. 各攻撃に予告と安全な回避経路が存在するかを調整。

**Phase 3: Presentation / Release**
11. カメラパン、行列前進、実際の便器っぽいマテリアル、飛沫・効果音、汚れ（演出）。
12. パフォーマンス最適化、基本レスポンシブ、グラフィックス設定。
13. GitHub Pagesワークフロー、README、手順検証。

各フェーズで「何ができたか」「操作方法」「残課題」「テスト結果」を短く記録する。ツールからデプロイ権限を持たない場合、ワークフローと操作手順を完成させ、実際に公開できたと偽らないこと。

## 10. テスト要件

- 入力なしで的は動かない。移動境界を越えない。斜め移動の正規化。
- 距離が半径和より小さいと被弾、境界以上は被弾しない。
- 飛行中に的が動いても「発射済み弾の着弾予定位置」は変更されない。
- ニアミスは1攻撃の接近通過につき1回。
- 1人の排尿終了時にaliveなら人数+1、被弾したラウンドでは+0。
- RNGシードが同一なら待機列が同じ。表示キューと消費キューが一致する。
- 1〜3はsingleのみ、4人目でtwoWay解禁、13人目でshotgun解禁、18人目でcombo解禁。
- 全4キャラの設定値が有効。
- ローカルベストの保存/読み込み失敗でクラッシュしない。
- `npm run build` 成功、PagesサブパスでJS/CSS/アセットが404にならない。
- 開始→回避→1人抜き→次の敵→命中→リザルト→リトライのE2E手動確認をする。

## 11. 安定性・性能

- 中程度のPCで60fps目標。ローポリ/簡易ライティングで成立させる。
- 毎フレームのジオメトリ・マテリアル新規生成を避け、尿粒子や着弾VFXを再利用する。
- 派手な飛沫より当たり判定の明瞭さを優先。低設定モードでは粒子数と影を減らす。
- `devicePixelRatio`の上限を適切に設定。
- キーボードイベント、リサイズイベントをクリーンアップ。
- console errorがないこと、リトライでメモリリークしないこと。

## 12. 納品物と完了報告

- 実際に動くプロジェクト一式。
- `GAME_DESIGN.md`を維持、`README.md`を整備。
- `.github/workflows/deploy.yml`、必要な `vite.config.ts`、lockfile。
- 上記の自動テスト（実行手順込み）。
- 完了報告には「実装済み」「後回しにしたもの」「実行したテストと結果」「起動手順」「Pagesの手動設定項目」を書く。
- **最優先は遊べるプロトタイプ。説明資料や装飾だけ作って完了としない。**

## 13. GitHub Pages上の注意

- 通常のプロジェクトサイト `https://USER.github.io/REPO/` ではViteの `base` が `/REPO/`。ルートサイトは `/`。
- GitHub ActionsでViteをbuildして `dist` をデプロイ。PagesのSourceを「GitHub Actions」にするのはリポジトリ側の設定。
- GitHub PagesにNodeのサーバー処理を要求しない。記録はブラウザローカルのみ。
- 初期運用は公開リポジトリ想定。無料枠の利用規約と制限に従う。

## 14. 実装開始時の最初の応答

1. リポジトリ現状を短く確認。
2. Phase 1の実装へ直ちに着手。
3. 実装後は `npm run build` とテストを実行。
4. ローカル操作方法を示し、Phase 2以降のタスクを整理。
