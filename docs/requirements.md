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
- `chat-observer.js`はenable/disableハンドシェイクでメッセージ送信を制御する
- BG iframe（`flow_chat_bg=true`）: 自動的にenabled状態で起動し、即座にメッセージを送信する
- 非BG iframe（ユーザー設置チャット等）: disabled状態で起動し、親ウィンドウから明示的に`FLOW_CHAT_CONTROL enable`を受信した場合のみ送信する
- Watchページでは`FLOW_CHAT_READY`ハンドシェイクでチャットiframeをenableする
- メッセージIDベースの重複排除（処理済みメッセージSetで管理、上限1000件で古い順削除）

##### IR-03: 衝突回避アルゴリズム
- 各メッセージの速度（幅 + コンテナ幅 / 表示時間）を計算し、既存メッセージとの水平・垂直衝突を予測する
- 衝突しないY座標を上から順に探索し、配置可能な位置がなければメッセージをスキップする

##### IR-04: クロスオリジン通信
- YouTube iframe → Holodexページ間は`window.postMessage` APIで通信する
- 送信先オリジン: `https://holodex.net`
- 受信時オリジン検証: `https://www.youtube.com`のみ許可
- YouTube live_chatページ内の内部フレームでも動作するため、`window.parent`で送信失敗時は`window.top`にフォールバックする
- トップレベルウィンドウ（iframe外）で実行された場合は早期リターンする

##### IR-05: DOM変更の監視と動的ビデオ検出
- `MutationObserver`で以下を監視する
  - YouTube Chat iframe内: `#items`コンテナへのメッセージ追加
  - Holodexページ: 新しいiframe/動画cellの追加、チャットiframeのsrc変更
- 定期的な再スキャン（10秒間隔）で動的な変更にも対応する
- **Multiview動的ビデオ対応**: ユーザーは以下の操作をページ遷移なしに行えるため、拡張機能はこれらの変更をリアルタイムに検出し対応する
  - 動画cellの追加・削除
  - cell内で再生する動画の変更（別のvideoIdへの切り替え）
  - チャットcellの追加・削除
  - 動画の切り替え時は旧videoIdのバックグラウンドiframeを破棄し、新videoIdで再作成する

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
| 4.18 | Critical | SPA遷移時にスクリプト間干渉・history.pushState未検知 | **対策済** | `fix/critical-bugs` |
| 4.17 | Bug | postMessage DOMExceptionコンソールエラー継続 | **対策済** | `fix/critical-bugs` |
| 4.16 | Bug | フローメッセージの垂直方向ジッター | **対策済** | `fix/critical-bugs` |
| 4.19 | Bug | メッセージが動画上端に詰まっていない | **対策済** | `fix/critical-bugs` |
| 4.14 | Critical | ページ種別間のSPAナビゲーション未対応 | **対策済** | `fix/critical-bugs` |
| 4.15 | Critical | BG iframe小サイズ+低opacityでChromeスロットリング | **対策済** | `fix/critical-bugs` |
| 4.11 | Critical | document.referrerによるMultiview判定が不正確 | **対策済** | `fix/critical-bugs` |
| 4.12 | Critical | BG iframeオフスクリーン配置でブラウザがレンダリング抑制 | **対策済** | `fix/critical-bugs` |
| 4.13 | Critical | WatchページのSPAナビゲーション未対応 | **対策済** | `fix/critical-bugs` |
| 4.7 | Critical | BG iframeがdisplay:noneでチャット取得不能 | **対策済** | `fix/critical-bugs` |
| 4.8 | Critical | Watchページのフローコンテナ配置位置の誤り | **対策済** | `fix/critical-bugs` |
| 4.9 | Bug | Multiviewのセレクタ不一致（Holodex DOM構造） | **対策済** | `fix/critical-bugs` |
| 4.10 | Bug | ウィンドウ非アクティブ時にフロー停止 | **対策済** | `fix/critical-bugs` |
| 4.5 | Critical | postMessageオリジン不一致エラー | **対策済** | `fix/critical-bugs` |
| 4.6 | Critical | Watchページでフローチャット非動作 | **対策済** | `fix/critical-bugs` |
| 4.1 | Critical | コードの重複 | **対策済** | `refactor/shared-module` |
| 4.2 | Bug | Multiviewアーカイブ対応不足 | **対策済** | `fix/critical-bugs` |
| 4.3 | Bug | ライブ/アーカイブ判定の信頼性 | 未着手 | - |
| 4.4 | Minor | defaultSettingsの不一致 | **対策済** | `fix/settings-mismatch` |

### 4.18 SPA遷移時にスクリプト間干渉・history.pushState未検知 (Critical) - 対策済

**問題**: 4.14の対策（URLポーリングによるページ種別切り替え）を実装したが、依然としてSPA遷移後にフローチャットが動作しなかった。複数の原因が重なっていた:

1. **handleChatMessage干渉**: holodex.jsとwatch.jsの両方が`window.addEventListener('message')`でメッセージを受信するが、deactivate時にリスナーを解除していなかった。deactivated状態のholodex.jsがwatchページのFLOW_CHAT_READYを受信し、`setupVideoCell()`で誤った場所にコンテナを生成
2. **storage変更リスナー干渉**: `chrome.storage.onChanged`リスナーがモジュールレベルで登録されており、deactivated状態でもUI要素（トグルボタン等）を生成・操作しようとする
3. **history.pushState未検知**: vue-routerは`history.pushState()`で遷移するが、URLポーリング（setInterval）のみでは1.5秒の遅延が生じ、ユーザー体験が劣化
4. **MutationObserver未解放**: watchForNewCells/watchForChatIframeのMutationObserverがdeactivate時にdisconnectされず、リークおよび重複検出の原因

**対策**:
- `handleChatMessage()`の先頭に`if (!isActive) return;`ガードを追加（両スクリプト）
- `chrome.storage.onChanged`リスナーにも`if (!isActive) return;`ガードを追加（UI更新をスキップ）
- `history.pushState`/`history.replaceState`をmonkey-patchし、`flowchat-urlchange`カスタムイベントを発火。`popstate`も同様にリスン。URLポーリングはフォールバックとして維持
- MutationObserver参照を変数に保持し、deactivate時に`disconnect()`を呼び出し
- グローバルフラグ`window.__flowChatHistoryPatched`で二重パッチを防止

### 4.17 postMessage DOMExceptionコンソールエラー継続 (Bug) - 対策済

**問題**: 4.5で`postMessageToHolodex()`にtry/catchフォールバックを実装したが、コンソールにDOMExceptionエラーが引き続き表示されていた。Watchページでのiframe階層は `holodex.net > youtube.com/embed > youtube.com/live_chat` であり、`window.parent.postMessage(msg, 'https://holodex.net')`が最初に実行されると、parentがyoutube.com/embedであるためDOMExceptionが発生する。try/catchで機能的には問題ないが、Chromeがエラーをコンソールに出力していた。

**対策**: `postMessageToHolodex()`を簡素化。Holodexは常にトップレベルページであるため、`window.top.postMessage(msg, 'https://holodex.net')`のみを使用。`window.parent`への試行を完全に削除。`window.top`は常にholodex.netを指すためDOMExceptionが発生しない。

### 4.16 フローメッセージの垂直方向ジッター (Bug) - 対策済

**問題**: フロー表示中のコメントが上下に揺れる現象が報告された。原因:
1. CSSアニメーションが要素のDOM追加時（測定フェーズ）に開始され、位置設定前にアニメーションが進行
2. 絵文字/アバター画像の非同期読み込みにより要素の高さが変動し、`display: inline-flex; align-items: center`によるコンテンツの垂直方向再配置が発生

**対策**:
- 測定フェーズで`animationName = 'none'`を設定してアニメーション開始を抑制
- 位置設定後に`animationName = ''`で復元し、アニメーションを0%から開始
- 測定後に`height`を明示的にロック（`messageEl.style.height = messageHeight + 'px'`）し、`overflow: hidden`で高さ変動を防止
- CSSに`line-height: 1.1`を追加して一貫した行高さを保証
- `animation-play-state: running !important`の`!important`を削除（JS制御との干渉を防止）

### 4.19 メッセージが動画上端に詰まっていない (Bug) - 対策済

**問題**: フローメッセージが動画の一番上から表示されず、視覚的に上部に余白がある印象を受ける。

**対策**:
- `minVerticalGap`デフォルトを4pxから2pxに縮小し、メッセージ間の垂直間隔を最小化
- `line-height: 1.1`をCSSに追加し、デフォルトline-height（~1.2）による上部余白を削減
- これにより1行目のメッセージがy=0ピクセル（動画上端）に配置され、後続メッセージもより密に詰められる

### 4.14 ページ種別間のSPAナビゲーション未対応 (Critical) - 対策済

**問題**: `manifest.json`でholodex.jsは`/multiview*`、watch.jsは`/watch/*`にのみマッチするURLパターンで注入されていた。HolodexはSPA（vue-router）のため、multiviewページからwatchページ（またはその逆）への遷移時にページリロードが発生せず、content scriptが再注入されない。結果として、遷移先のページでフローチャットが動作しなかった。

**対策**:
- `manifest.json`を変更: 両スクリプトを`https://holodex.net/*`全体にマッチさせ、1つの`content_scripts`エントリに統合
- 各スクリプトに`isMultiviewPage()`/`isWatchPage()`によるページタイプ判定を追加
- `activate()`/`deactivate()`ライフサイクル関数を追加: 適切なページでのみUI・iframe・イベント処理を有効化
- 1.5秒間隔のURLポーリングで`window.location.pathname`の変化を監視し、ページ種別遷移時に自動切り替え
- イベントリスナー（postMessage, click等）は一度だけ登録し、UI要素・状態はactivate/deactivateで管理

### 4.15 BG iframe小サイズ+低opacityでChromeスロットリング (Critical) - 対策済

**問題**: 4.12の対策としてBG iframeコンテナを`width: 1px; height: 1px; opacity: 0.01`で配置したが、Chromeはこのような小サイズ・低opacity のクロスオリジンiframeを「トラッキングピクセル」相当と判定し、ウィンドウが非アクティブになるとタイマー/レンダリングをスロットリングする。これによりYouTubeのチャットポーリングが停止し、新しいメッセージが到達しなくなっていた。

**影響**: タブは表示されているが別アプリケーションがアクティブな状態（動画視聴の一般的な形態）でフローが完全に停止するため、致命的な問題であった。

**対策**: BG iframeコンテナを動画の背後にフルサイズで配置する方式に変更:
- `position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1`
- `opacity`指定なし（デフォルト1.0）
- 動画要素（z-indexがより高い）が視覚的にBGコンテナを隠蔽
- Chromeから見ると「完全に可視のフルサイズiframe」であり、スロットリング対象外
- iframeサイズもCSS classで`width: 100%; height: 100%`に変更（inline style削除）

### 4.11 document.referrerによるMultiview判定が不正確 (Critical) - 対策済

**問題**: `chat-observer.js`が`document.referrer`のURLパスを解析してMultiviewページか否かを判定し、Multiview上のユーザー設置チャットcellからのメッセージ送信を抑制していた。しかしYouTubeの`Referrer-Policy: strict-origin-when-cross-origin`により、`document.referrer`は`"https://holodex.net"`のみ返り、パス（`/multiview`等）が取れないため、`isMultiview`が常に`false`になっていた。

**影響**: ユーザーが手動設置したチャットcellからもメッセージが送信され、BG iframeと重複。逆に、手動設置チャットcellがある場合のみフローが動作するように見える原因ともなっていた。

**対策**: `document.referrer`ベースの判定を完全撤廃。代わりにenable/disableハンドシェイク方式に変更:
- BG iframe（`flow_chat_bg=true`パラメータ付き）: `isEnabled`デフォルト`true`、即座にメッセージ送信開始
- 非BG iframe（ユーザー設置チャットcell等）: `isEnabled`デフォルト`false`、親ウィンドウから`FLOW_CHAT_CONTROL enable`を受信した場合のみ送信
- Watchページ: `FLOW_CHAT_READY`受信時に`event.source.postMessage()`で`enable`を返送し、既存チャットiframeにプロアクティブに`enable`も送信

### 4.12 BG iframeオフスクリーン配置でブラウザがレンダリング抑制 (Critical) - 対策済

**問題**: 4.7の対策として`display: none`を`position: fixed; left: -9999px`（オフスクリーン配置）に変更したが、ブラウザはビューポート外のコンテンツに対してタイマー/レンダリングをスロットリングする。これによりYouTubeのチャットポーリングが停止し、最初の数件のメッセージだけ取得した後にメッセージ送信が止まっていた。

**対策**: BG iframeコンテナをビューポート内に配置する方式に変更:
- `position: absolute; bottom: 0; right: 0; width: 1px; height: 1px; overflow: hidden; opacity: 0.01; z-index: -1`
- コンテナは動画cell内に配置（`videoCell.appendChild()`）
- 内部iframeは十分なサイズ（400x500px）を維持
- ビューポート内に存在するためブラウザのスロットリングを回避しつつ、視覚的には不可視

### 4.13 WatchページのSPAナビゲーション未対応 (Critical) - 対策済

**問題**: HolodexはVue.js/vue-routerを使用したSPAであり、動画の切り替え時にページリロードが発生しない。content scriptは最初のページロード時のみ`init()`を実行するため、SPAナビゲーションで動画が切り替わってもフローチャットが初期化されず、後から選択した動画にフローが表示されなかった。

**対策**:
- `startNavigationWatcher()`を追加: 2秒間隔でURL内のvideoIdをポーリングし、変更を検出
- `cleanup()`関数を追加: フローコンテナ、トグルボタン、アクティブメッセージをクリーンアップ
- `reinitializeForNewVideo()`関数を追加: cleanup後に新しいvideoIdで`setupForCurrentVideo()`を再実行
- `setupForCurrentVideo()`関数に動画コンテナ探索・フロー初期化・チャットiframeセットアップを分離

### 4.7 BG iframeがdisplay:noneでチャット取得不能 (Critical) - 対策済

**問題**: バックグラウンドチャットiframeのコンテナに`display: none`を設定していたが、これによりYouTubeのlive_chatページ内のJavaScriptがチャットメッセージDOMを生成しなくなり、`MutationObserver`がメッセージを検出できなかった。結果としてバックグラウンドiframeは存在するが一切メッセージを送信しない状態であった。

**対策**: `display: none`を廃止し、ビューポート内の不可視コンテナに変更（4.12参照）。

### 4.8 Watchページのフローコンテナ配置位置の誤り (Critical) - 対策済

**問題**: `findVideoContainer()`が`.v-responsive`セレクタを最初に検索していたが、Holodex WatchページではVuetifyの`.v-responsive`クラスがアバターアイコン等の画像要素にも使用されており、動画プレーヤーではなくアイコン要素にフローコンテナが配置されていた。

**対策**: Holodexの実際のDOM構造を調査し、Watchページの動画プレーヤーが`.video`クラスを持つことを確認。セレクタの優先順位を`.video`（動画コンテナ）→ iframe親要素のフォールバック に変更。

### 4.9 Multiviewのセレクタ不一致 (Bug) - 対策済

**問題**: Multiviewの動画セル検索に`.video-cell, [class*="cell"]`セレクタを使用していたが、Holodex MultiviewページのDOM構造は`.vue-grid-item > .mv-cell > .cell-content > .mv-frame > div > iframe`であり、適切な要素にフローコンテナが配置されていなかった。

**対策**: Holodex MultiviewのDOM構造に合わせた`findVideoCell()`関数を新規作成。`.mv-frame`（動画フレームラッパー、`position: relative`）→ `.mv-cell` → `.vue-grid-item` → `[class*="cell"]` の優先順でフォールバック検索する。

### 4.10 ウィンドウ非アクティブ時にフロー停止 (Bug) - 対策済

**問題**: ブラウザ以外のウィンドウをアクティブにするとCSSアニメーションが停止し、フロー表示が止まっていた。

**対策**:
- CSSに`animation-play-state: running`と`will-change: transform`を追加
- `backface-visibility: hidden`でGPUコンポジティングを促進
- `resumeAnimations()`関数でフォーカス復帰時にstaleメッセージ除去・アニメーション再開
- `visibilitychange`/`focus`イベントリスナーで検出
- BG iframeのスロットリング対策は4.15で別途対応

### 4.5 postMessageオリジン不一致エラー (Critical) - 対策済

**問題**: `chat-observer.js`が`window.parent.postMessage(data, 'https://holodex.net')`でHolodexページにメッセージを送信するが、YouTube live_chatページ内の内部フレームでもcontent scriptが実行される（`all_frames: true`）。内部フレームの`window.parent`はyoutube.comであり、holodex.netではないため`DOMException: Failed to execute 'postMessage' on 'DOMWindow'`が発生。メッセージが一切Holodexページに到達しなかった。

**対策**: `postMessageToHolodex()`ヘルパー関数を新規作成。`window.parent.postMessage()`を試行し、DOMExceptionが発生した場合は`window.top.postMessage()`にフォールバックする。`window.top`は常にHolodexページを指すため、iframe階層の深さに関係なくメッセージが到達する。また、トップレベルウィンドウ（iframe外）で実行された場合の早期リターンも追加。

### 4.6 Watchページでフローチャット非動作 (Critical) - 対策済

**問題**: Watchページでフローチャットが全く表示されなかった。原因は4.5のpostMessageエラーと同一。加えて、`init()`関数のリトライ時にイベントリスナーが重複登録される問題があった。

**対策**: 4.5のpostMessage修正により通信問題を解決。`init()`に`initialized`フラグを追加し、イベントリスナーとUI要素の重複生成を防止。チャットiframe検索のリトライロジックも簡潔化。

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
