# Flow Chat for Holodex 要件定義書

## 1. 概要

[Holodex](https://holodex.net)（[GitHub](https://github.com/HolodexNet/Holodex)）上で動画再生中にYouTubeライブチャットコメントをニコニコ動画風にフロー（横スクロール）表示するChrome拡張機能。

### 1.1 対象ページ

| ページ | URL パターン | 説明 |
|--------|-------------|------|
| **Multiview** | `https://holodex.net/multiview*` | 複数のcellを配置し、動画・チャット欄を自由に割り当て可能なマルチビューページ |
| **Watch** | `https://holodex.net/watch/*` | 単一の動画をチャット欄とセットで表示するページ |

### 1.2 対象動画種別

| 種別 | 説明 | チャット取得方式 |
|------|------|-----------------|
| **ライブストリーム** | 現在配信中の動画 | YouTube Live Chat API（`/live_chat`） |
| **アーカイブ** | 配信済み録画動画 | YouTube Live Chat Replay API（`/live_chat_replay`）。[Holodex-Plus](https://github.com/HolodexNet/Holodex-Plus) 拡張機能に依存 |

### 1.3 基本方針

- **Watchページ**: ページ上に表示されているチャット欄（iframe）をフロー表示のソースとする
- **Multiviewページ**: チャット欄はユーザーが手動で設置しないと存在しない。使い勝手を考慮し、設置された動画cell毎にバックグラウンドでチャットiframeを自動生成・保持し、それをソースとする。ユーザーが手動設置したチャット欄はメッセージ重複防止のためソースとしない

---

## 2. 要件

### 2.1 機能要件

#### 2.1.1 外部要件（ユーザー向け機能）

##### FR-01: フロー表示
- チャットメッセージを動画プレーヤー上に右から左へ横スクロール表示する
- Watchページ・Multiviewページの両方で動作する
- ライブストリーム・アーカイブの両方で動作する

##### FR-02: メッセージ種別の識別
- 以下のユーザータイプを識別し、タイプ別に色分け表示する
  - **配信者（Owner）**: デフォルト金色
  - **モデレーター（Moderator）**: デフォルト青色
  - **メンバー（Member）**: デフォルト緑色
  - **通常ユーザー（Normal）**: デフォルト白色
  - **スーパーチャット（SuperChat）**: 金色・太字

##### FR-03: 絵文字・スタンプ対応
- チャットメッセージ中の絵文字画像を保持し、テキストと合わせてフロー表示する

##### FR-04: 表示カスタマイズ
- 以下の設定をユーザーが変更可能にする
  - 有効/無効の切り替え
  - 表示速度（画面横断時間: 4〜15秒）
  - フォントサイズ（16〜48px）
  - 透明度（30%〜100%）
  - 同時表示メッセージ数上限（20〜200）
  - 表示エリア（画面高さの30%〜100%）
  - ユーザータイプ別の表示ON/OFF
  - ユーザータイプ別のアバター表示ON/OFF
  - ユーザータイプ別のカラー設定（RGBカラーピッカー + プリセットパレット）

##### FR-05: 設定UIの提供
- **ポップアップ**: 拡張機能アイコンクリックで設定パネルを表示
- **ページ内ボタン**: 任意でページ上に設定ボタンを表示（位置選択可能: 四隅）

##### FR-06: Multiview 個別制御
- Multiview上の各動画cellごとにフロー表示のON/OFFを切り替えられるトグルボタン（ホバー時に表示）

##### FR-07: 設定の同期
- 設定は`chrome.storage.sync`に保存し、Chrome同一アカウント間で同期する

#### 2.1.2 内部要件（技術要件）

##### IR-01: バックグラウンドチャットiframe管理（Multiview）
- Multiview上で検出された各動画cellに対し、非表示のYouTube Live Chat iframeをバックグラウンドで自動作成する
- ライブストリーム: `/live_chat?v={videoId}&embed_domain={host}&flow_chat_bg=true`
- アーカイブ: `/live_chat_replay?v={videoId}&embed_domain={host}&flow_chat_bg=true`
- ライブ/アーカイブの自動判定を行い、適切なURLでiframeを作成する

##### IR-02: メッセージ重複防止
- `chat-observer.js`は`flow_chat_bg=true`パラメータの有無で背景iframeを識別する
- Multiviewではバックグラウンドiframeからのみメッセージを親ウィンドウに送信する（ユーザー設置のチャットcellからは送信しない）
- Watchページでは既存のチャットiframeから全メッセージを送信する
- メッセージIDベースの重複排除（処理済みメッセージSetで管理、上限1000件で古い順削除）

##### IR-03: 衝突回避アルゴリズム
- 各メッセージの速度（幅 + コンテナ幅 / 表示時間）を計算し、既存メッセージとの水平・垂直衝突を予測する
- 衝突しないY座標を上から順に探索し、配置可能な位置がなければメッセージをスキップする

##### IR-04: クロスオリジン通信
- YouTube iframe → Holodexページ間は`window.postMessage` APIで通信する
- 送信先オリジン: `https://holodex.net`
- 受信時オリジン検証: `https://www.youtube.com`のみ許可

##### IR-05: DOM変更の監視
- `MutationObserver`で以下を監視する
  - YouTube Chat iframe内: `#items`コンテナへのメッセージ追加
  - Holodexページ: 新しいiframe/動画cellの追加、チャットiframeのsrc変更
- 定期的な再スキャン（10秒間隔）で動的な変更にも対応する

##### IR-06: 動画の自動検出
- 以下のパターンで動画を検出する
  1. `iframe[src*="youtube.com/embed"]` からvideoId抽出
  2. `[data-video-id]`属性を持つ要素
  3. スタンドアロンのチャットiframe（`live_chat` / `live_chat_replay`）

##### IR-07: ライブ/アーカイブ判定
- 既存チャットiframeのURLに`live_chat_replay`が含まれるか確認
- 動画iframeのURLに`/live/`が含まれるか確認
- `data-status`属性やライブバッジCSSクラスの存在を確認
- 初回アーカイブ判定でも5秒後にライブ再判定を行う

##### IR-08: CSSアニメーション
- `@keyframes flowAnimation`で`translateX`による横移動を実現する
- `--flow-distance` CSS変数でメッセージ幅に応じた移動距離を動的設定する
- アニメーション完了後にDOM要素を自動削除する

---

## 3. 構成

### 3.1 ファイル構成

```
flow-chat-for-holodex/
├── manifest.json                    # Chrome Extension Manifest V3
├── package.json
├── README.md
├── docs/
│   └── requirements.md             # 本ドキュメント
├── src/
│   ├── background/
│   │   └── service-worker.js       # バックグラウンドサービスワーカー
│   ├── content/
│   │   ├── shared.js               # 共通モジュール（FlowChatCore）
│   │   ├── holodex.js              # Multiviewページ用コンテンツスクリプト
│   │   ├── watch.js                # Watchページ用コンテンツスクリプト
│   │   └── chat-observer.js        # YouTube Chat iframe内監視スクリプト
│   ├── popup/
│   │   ├── popup.html              # 設定ポップアップUI
│   │   └── popup.js                # 設定ポップアップロジック
│   └── styles/
│       └── flow.css                # フロー表示・UIスタイル
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 3.2 コンポーネント構成

```
┌─────────────────────────────────────────────────────────┐
│ Holodex Page (holodex.net)                              │
│                                                         │
│  ┌──────────────────────────────────────────┐            │
│  │ shared.js (FlowChatCore)                │            │
│  │ - defaultSettings / 設定管理            │            │
│  │ - renderFlowMessage / 衝突回避          │            │
│  │ - 設定パネル / トグルボタン             │            │
│  └────────────────────┬─────────────────────┘            │
│                       │                                  │
│  ┌──────────────────┐ │ ┌──────────────────┐            │
│  │ holodex.js       │ │ │ watch.js         │            │
│  │ (Multiview)      │ │ │ (Watch)          │            │
│  │                  │ │ │                  │            │
│  │ - 動画検出       │ │ │ - 動画検出       │            │
│  │ - BG iframe管理  │ │ │ - 既存iframe利用 │            │
│  │ - 個別ON/OFF     │ │ │ - メッセージ処理 │            │
│  └────────┬─────────┘ │ └────────┬─────────┘            │
│           │ postMessage          │ postMessage           │
│  ┌────────┴──────────────────────┴─────────┐            │
│  │ YouTube Chat iframes                     │            │
│  │                                          │            │
│  │  ┌────────────────────────┐              │            │
│  │  │ chat-observer.js       │              │            │
│  │  │                        │              │            │
│  │  │ - DOM監視              │              │            │
│  │  │ - メッセージパース     │              │            │
│  │  │ - 重複排除             │              │            │
│  │  │ - 親ウィンドウへ送信   │              │            │
│  │  └────────────────────────┘              │            │
│  └──────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────┐  ┌─────────────────────────┐
│ service-worker.js       │  │ popup.js + popup.html   │
│                         │  │                         │
│ - 初期設定              │  │ - 設定UI                │
│ - メッセージ中継        │  │ - カラーピッカー        │
│ - タブ監視              │  │ - 保存/リセット         │
└─────────────────────────┘  └─────────────────────────┘
```

### 3.3 データフロー

```
YouTube Chat DOM (iframe内)
    │
    ▼ MutationObserver (chat-observer.js)
メッセージパース (author, avatar, type, fragments)
    │
    ▼ window.postMessage → https://holodex.net
Holodexページ (holodex.js / watch.js)
    │
    ▼ フィルタリング (ユーザータイプ、有効/無効)
    │
    ▼ 衝突回避 (Y座標探索)
    │
    ▼ DOM要素生成 + CSSアニメーション適用
フロー表示（右→左スクロール）
    │
    ▼ animationend イベント
DOM要素削除 + activeMessages配列から除去
```

---

## 4. 課題管理

| # | 重要度 | 課題 | 状態 | ブランチ |
|---|--------|------|------|----------|
| 4.1 | Critical | コードの重複 | **対策済** | `refactor/shared-module` |
| 4.2 | Bug | Multiviewアーカイブ対応不足 | **対策済** | `fix/archive-bg-iframe` |
| 4.3 | Bug | ライブ/アーカイブ判定の信頼性 | 未着手 | - |
| 4.4 | Minor | defaultSettingsの不一致 | **対策済** | `fix/settings-mismatch` |

### 4.1 コードの重複 (Critical) - 対策済

**問題**: `holodex.js`と`watch.js`で以下の処理が完全に重複していた（約1000行）
- `defaultSettings`定義
- `createFlowMessage()`（約80行）
- `wouldCollide()`（約45行）
- `findAvailablePosition()`（約30行）
- コントロールパネル生成・イベントリスナー（約200行）
- 設定の読み込み/保存/同期処理

**対策**: `src/content/shared.js`として共通モジュールを新規作成
- `window.FlowChatCore`名前空間で共有APIを提供
- `manifest.json`で`shared.js`を両content_scriptsの前に読み込むよう設定
- `holodex.js`: 1097行 → 約240行（ページ固有ロジックのみ）
- `watch.js`: 910行 → 約170行（ページ固有ロジックのみ）
- 共通モジュール: 約330行（新規）
- **総削減**: 約1000行

### 4.2 Multiviewでのアーカイブ対応不足 (Bug) - 対策済

**問題**: ライブストリームではバックグラウンドiframeを自動作成するが、アーカイブでは既存チャットiframeがある場合のみ動作。ユーザーがチャットcellを手動設置していないアーカイブ動画ではフローが機能しなかった。

**対策**: `detectAndRegisterVideos()`のPattern 1/2/3すべてで、ライブ/アーカイブの区別なく`createBackgroundChatIframe()`を呼び出すよう統一。`createBackgroundChatIframe()`内部で`checkIfVideoIsLive()`の結果に応じて`/live_chat`または`/live_chat_replay`のURLを自動選択するため、呼び出し側での分岐が不要になった。不要になった`findChatIframeForVideo()`と`enableChatObservationOnIframe()`を削除。

### 4.3 ライブ/アーカイブ判定の信頼性 (Bug) - 未着手

**問題**: `checkIfVideoIsLive()`の判定がDOM要素に強く依存しており、Holodexのレイアウト変更で壊れやすい。ライブバッジの有無で判定している部分は、ページ上に複数動画がある場合に誤判定する可能性がある。

**改善案**: まず`live_chat`で試し、エラー/空の場合に`live_chat_replay`にフォールバックする方式を検討。

### 4.4 `defaultSettings`の不一致 (Minor) - 対策済

**問題**: `service-worker.js`の初期設定で`maxMessages: 50`だが、他ファイルでは`maxMessages: 100`。また`showSettingsButton`と`settingsButtonPosition`が`service-worker.js`に存在しなかった。

**対策**: `service-worker.js`の`maxMessages`を`100`に統一し、欠落していた`showSettingsButton: false`と`settingsButtonPosition: 'bottom-right'`を追加。
