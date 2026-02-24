# Amazon 出産準備お試しBox 在庫監視ツール

Amazon らくらくベビーの「出産準備お試しBox」の在庫を定期的にチェックし、入荷したら LINE に通知するツールです。

## 仕組み

```
GitHub Actions (10分ごと)
  → Playwright で Amazon にログイン
  → お試しBox ページの在庫を確認
  → 在庫あり → LINE Messaging API で通知 🎉
  → 在庫なし → 何もしない
```

## セットアップ

### 1. LINE Messaging API の準備

1. [LINE Developers](https://developers.line.biz/ja/) にログイン
2. 新しいプロバイダーを作成
3. 「Messaging API チャネル」を作成
4. チャネル設定画面で以下を取得：
   - **チャネルアクセストークン**（長期）: 「Messaging API設定」タブの一番下で発行
   - **あなたのユーザーID**: 「チャネル基本設定」タブの一番下に表示
5. 作成した公式アカウントを **自分のLINEで友だち追加** する（QRコードが「Messaging API設定」タブにあります）

### 2. Amazon アカウントの準備

- 監視用のAmazonアカウントを用意（**2段階認証はオフ**にしておく）
- そのアカウントで「らくらくベビー」に登録しておく

### 3. GitHub リポジトリの設定

1. このリポジトリを GitHub に push する（**private リポジトリ推奨**）
2. リポジトリの Settings → Secrets and variables → Actions で以下の Secrets を追加：

| Secret 名 | 値 |
|---|---|
| `AMAZON_EMAIL` | Amazon のメールアドレス |
| `AMAZON_PASSWORD` | Amazon のパスワード |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE のチャネルアクセストークン |
| `LINE_USER_ID` | LINE のユーザーID（U から始まる文字列） |

### 4. 動作確認

1. リポジトリの Actions タブを開く
2. 「Amazon在庫チェック」ワークフローを選択
3. 「Run workflow」ボタンで手動実行
4. ログを確認して正常に動作しているか確認

## ローカルでのテスト

```bash
# 依存関係のインストール
npm install
npx playwright install chromium

# LINE通知のテスト
LINE_CHANNEL_ACCESS_TOKEN=xxx LINE_USER_ID=xxx node test-line.mjs

# 在庫チェックの実行
AMAZON_EMAIL=xxx AMAZON_PASSWORD=xxx \
LINE_CHANNEL_ACCESS_TOKEN=xxx LINE_USER_ID=xxx \
node index.mjs
```

## 注意事項

- Amazon の利用規約上、自動アクセスはグレーゾーンです。自己責任でご利用ください
- アクセス頻度は控えめに設定してください（デフォルトは10分間隔）
- CAPTCHA が表示される場合はアクセス頻度を下げてください
- GitHub Actions の private リポジトリ無料枠は月 2,000 分です
- Secrets には機密情報を保存するため、リポジトリは必ず **private** にしてください
