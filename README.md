# Flow Chat for Holodex

YouTube Live Chatのコメントを画面上にフロー表示（ニコニコ動画風）するChrome拡張機能です。Holodex Multiview専用に設計されています。

## 機能

- **フロー表示**: ライブチャットメッセージを動画上に流れるように表示
- **マルチビュー対応**: Holodexの複数動画同時視聴に対応
- **カスタマイズ可能**:
  - メッセージの速度調整
  - フォントサイズ変更
  - 透明度調整
  - 表示レーン数の設定
  - 投稿者名・アバターの表示/非表示
- **メッセージタイプの区別**:
  - 通常メッセージ（白色）
  - スーパーチャット（金色）
  - メンバー（緑色）
  - モデレーター（青色）
  - 配信者（黄色）

## インストール

### 開発者モードでのインストール

1. このリポジトリをクローンまたはダウンロード
```bash
git clone https://github.com/shirota773/flow-chat-for-holodex.git
```

2. Chromeで `chrome://extensions/` を開く

3. 右上の「デベロッパーモード」を有効化

4. 「パッケージ化されていない拡張機能を読み込む」をクリック

5. ダウンロードしたフォルダを選択

## 使い方

1. [Holodex Multiview](https://holodex.net/multiview) にアクセス

2. 視聴したい配信を追加

3. 画面右下の💬ボタンをクリックして設定パネルを開く

4. 必要に応じて設定を調整:
   - **Speed**: メッセージが画面を横切る時間（秒）
   - **Size**: フォントサイズ（ピクセル）
   - **Opacity**: メッセージの透明度
   - **Lanes**: 縦方向のレーン数（重複防止）
   - **Show Author**: 投稿者名を表示
   - **Show Avatar**: アバター画像を表示

5. 設定を保存してお楽しみください

## 技術仕様

### アーキテクチャ

```
manifest.json (Manifest V3)
├── content_scripts/
│   ├── holodex.js      # Holodexページでのフロー表示管理
│   └── chat-observer.js # YouTube Live Chatの監視
├── background/
│   └── service-worker.js # バックグラウンド処理
├── popup/
│   ├── popup.html      # 設定UI
│   └── popup.js        # 設定ロジック
└── styles/
    └── flow.css        # フローアニメーション
```

### 動作原理

1. **チャット監視**: YouTube Live Chat iframe内でMutationObserverを使用してDOMの変更を監視
2. **メッセージ転送**: `postMessage` APIを使用してHolodexページにチャットデータを送信
3. **フロー表示**: CSS Animationを使用してメッセージを横スクロール表示
4. **レーン管理**: メッセージの重なりを防ぐためのレーンシステム

### 制限事項

- クロスオリジンの制限により、YouTube Live Chat iframeから直接DOMにアクセスできないため、Content Scriptを両方のページに注入する必要があります
- アーカイブ動画のチャットリプレイには対応していない可能性があります
- 大量のチャットが流れる配信では、パフォーマンスに影響が出る可能性があります

## 設定の保存

設定は `chrome.storage.sync` に保存されるため、Chromeアカウントでログインしている場合は他のデバイスと同期されます。

## トラブルシューティング

### メッセージが表示されない

1. 拡張機能が有効になっているか確認
2. Holodexページをリロード
3. ライブ配信のチャットが表示されているか確認
4. 開発者ツールのコンソールでエラーを確認

### パフォーマンスが悪い

- 同時表示メッセージ数を減らす（設定で調整）
- レーン数を減らす
- アバター表示をオフにする

## 開発

### 必要環境

- Chrome 88以上（Manifest V3対応）
- Node.js（アイコン生成用、オプション）

### ビルド

現在はビルドステップなしで直接使用可能です。TypeScriptやbundlerを使用する場合は、将来のバージョンで対応予定です。

### アイコン生成

SVGからPNGアイコンを生成する場合：

```bash
# ImageMagickを使用
convert -background none -resize 16x16 icons/icon.svg icons/icon16.png
convert -background none -resize 48x48 icons/icon.svg icons/icon48.png
convert -background none -resize 128x128 icons/icon.svg icons/icon128.png
```

## ライセンス

MIT License

## 謝辞

このプロジェクトは [youtube-live-chat-flow](https://github.com/tsukumijima/youtube-live-chat-flow) にインスパイアされています。

## 貢献

Issue報告やPull Requestを歓迎します。

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. Pull Requestを作成

---

Made with ❤️ for the VTuber community
