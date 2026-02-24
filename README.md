# 在庫監視ツール

商品の在庫を定期的にチェックし、入荷したら LINE に通知するツールです。

## 特徴

✅ **セッション保持**: PlaywrightのstorageStateで認証状態を保存
✅ **bot判定回避**: 毎回ログイン不要で自然なアクセス
✅ **2段階認証対応**: 一度ログインすればセッション再利用
✅ **完全無料**: GitHub Actionsで定期実行（publicリポジトリなら無料）
✅ **外部cron対応**: repository_dispatchで正確な定期実行

## 仕組み

```
外部cronサービス (5-10分ごと)
  → GitHub API (repository_dispatch)
  → GitHub Actions
  → storageStateから認証情報を復元（ログインスキップ）
  → Playwright でページの在庫を確認
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
5. 作成した公式アカウントを **自分のLINEで友だち追加** する（QRコードが「Messaging API設定」タブにあります）

### 2. ローカルでログイン情報を保存

```bash
# 依存関係のインストール
npm install
npx playwright install chromium

# ログイン情報を保存（ブラウザが開きます）
npm run save-auth
```

ブラウザが開くので、手動でログインしてください。
ログイン後、60秒待つと自動で `auth-state.json` が保存されます。

### 3. 認証情報をBase64エンコード

**macOS / Linux:**
```bash
base64 -i auth-state.json | pbcopy
```

**Windows PowerShell:**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("auth-state.json")) | Set-Clipboard
```

### 4. GitHub リポジトリの設定

1. このリポジトリを GitHub に push する
2. リポジトリの Settings → Secrets and variables → Actions で以下の Secrets を追加：

| Secret 名 | 値 |
|---|---|
| `AUTH_STATE_BASE64` | Base64エンコードした認証情報（数万文字の1行） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE のチャネルアクセストークン |

### 5. 外部cronサービスの設定（オプション）

GitHub Actionsのschedule実行は遅延するため、正確な定期実行には外部cronサービスを推奨します。

**cron-job.org の設定例:**

1. https://cron-job.org にアクセス・ログイン
2. 「Create cronjob」をクリック
3. 以下を設定：

- **Title**: `Stock Checker`
- **URL**: `https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO/dispatches`
- **Request method**: `POST`
- **Schedule**: `Every 10 minutes` (または `*/10 * * * *`)
- **Request body**:
  - Content-Type: `application/json`
  - Body: `{"event_type":"check-stock"}`
- **Custom headers**:
  ```
  Accept: application/vnd.github+json
  Authorization: Bearer YOUR_GITHUB_TOKEN
  X-GitHub-Api-Version: 2022-11-28
  ```

**GitHub Personal Access Token (PAT) の作成:**
- https://github.com/settings/tokens
- 「Generate new token (classic)」
- Scopes: `repo` にチェック
- トークンをコピーして上記の `Authorization` ヘッダーに設定

### 6. 動作確認

1. リポジトリの Actions タブを開く
2. ワークフローを選択
3. 「Run workflow」ボタンで手動実行
4. ログを確認して正常に動作しているか確認

## ローカルでのテスト

```bash
# 在庫チェックの実行（auth-state.json が必要）
npm run check
```

## メンテナンス

### 認証情報の更新

Cookieには有効期限があります（通常30〜90日）。
定期的に認証情報を更新してください：

```bash
# 1. 再度ログイン
npm run save-auth

# 2. Base64エンコード
base64 -i auth-state.json | pbcopy

# 3. GitHub Secretsを更新
# Settings → Secrets → AUTH_STATE_BASE64 を編集
```

## 注意事項

- Webサイトの利用規約を確認し、自己責任でご利用ください
- アクセス頻度は控えめに設定してください（推奨: 10分間隔）
- CAPTCHA が表示される場合はアクセス頻度を下げてください
- GitHub Actions の private リポジトリ無料枠は月 2,000 分です
- Secrets には機密情報を保存するため、リポジトリは **private** 推奨です
- `auth-state.json` はGitにコミットしないでください（.gitignoreに追加済み）

## トラブルシューティング

### ログインエラーが発生する

→ 認証情報の有効期限が切れている可能性があります。`npm run save-auth` で再度ログイン情報を保存してください。

### GitHub Actionsが実行されない

→ repository_dispatchトリガーが正しく設定されているか確認してください。手動実行（workflow_dispatch）は常に利用可能です。

### LINE通知が届かない

→ LINE_CHANNEL_ACCESS_TOKEN が正しいか、公式アカウントを友だち追加しているか確認してください。
