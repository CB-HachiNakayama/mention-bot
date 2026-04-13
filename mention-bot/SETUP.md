# メンションBot セットアップガイド

Slackのスラッシュコマンド `/mention-check` で自分へのメンションを要約してDMに通知するBotです。

---

## 使い方（セットアップ後）

Slackの任意のチャンネルで入力するだけ：

```
/mention-check          → 今週のメンションを表示
/mention-check 今日     → 今日のメンションを表示
/mention-check 昨日     → 昨日のメンションを表示
/mention-check 先週     → 先週のメンションを表示
/mention-check 4/7-4/13 → 指定期間のメンションを表示
/mention-check 過去3日  → 過去3日のメンションを表示
```

結果は **自分にだけ見える形**（ephemeral）で表示されます。

---

## セットアップ手順

### ステップ1: Slack App を作成する

1. https://api.slack.com/apps を開く
2. 「Create New App」→「From scratch」をクリック
3. App Name に `メンションBot`（任意）、ワークスペースを選択して「Create App」

#### Slash Command を追加
4. 左メニュー「Slash Commands」→「Create New Command」
   - Command: `/mention-check`
   - Request URL: `https://あなたのVercelURL/api/slack`（ステップ3で取得）
   - Short Description: `メンションを要約して表示`
5. 「Save」をクリック

#### User Token Scopes を設定
6. 左メニュー「OAuth & Permissions」
7. 「User Token Scopes」セクションで以下を追加：
   - `search:read`（メンション検索に必要）
8. 「Bot Token Scopes」セクションで以下を追加：
   - `commands`

#### トークンを取得
9. 「OAuth & Permissions」→「Install to Workspace」→「許可する」
10. 「Bot User OAuth Token」(`xoxb-...`) をコピー → `SLACK_BOT_TOKEN` に使用
11. 「User OAuth Token」(`xoxp-...`) をコピー → `SLACK_USER_TOKEN` に使用
12. 左メニュー「Basic Information」→「Signing Secret」をコピー → `SLACK_SIGNING_SECRET` に使用

> ⚠️ **重要**: `search:read` はユーザートークン（xoxp-）でないと動きません。
> DM・プライベートチャンネルも検索するためにユーザートークンが必要です。
> 各メンバーが自分のユーザートークンを環境変数にセットする必要があります。

---

### ステップ2: Anthropic API キーを取得する

1. https://console.anthropic.com を開く
2. アカウント作成 → 「API Keys」→「Create Key」
3. キーをコピー → `ANTHROPIC_API_KEY` に使用

料金の目安: メンション20件の要約で約0.01〜0.03ドル程度

---

### ステップ3: Render にデプロイする

1. https://github.com にアクセスし、このフォルダをリポジトリとしてプッシュ
   - GitHubアカウントがなければ無料で作成できます
   - リポジトリ名は `mention-bot` など任意でOK
2. https://render.com にアクセス、GitHubアカウントでサインアップ
3. 「New +」→「Web Service」をクリック
4. GitHubリポジトリを選択して「Connect」
5. 以下の設定を入力：
   - **Name**: `mention-bot`（任意）
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Starter`（有料プラン $7/月）
6. 「Environment Variables」に以下を追加：

| 変数名 | 値 |
|--------|-----|
| `SLACK_SIGNING_SECRET` | Slack Basic Information のSigning Secret |
| `SLACK_USER_TOKEN` | `xoxp-` から始まるユーザートークン |
| `ANTHROPIC_API_KEY` | Anthropic のAPIキー |

7. 「Create Web Service」をクリック
8. デプロイ完了後、URLをコピー（例: `https://mention-bot-xxxx.onrender.com`）

---

### ステップ4: Slack App の Request URL を更新

1. https://api.slack.com/apps に戻る
2. 「Slash Commands」→ `/mention-check` を編集
3. Request URL に `https://あなたのRenderURL/api/slack` を入力して保存

---

### ステップ5: 動作確認

Slackで `/mention-check 今日` と入力してみましょう！

---

## チームで使う場合

**各メンバーが自分のユーザートークンを使う必要があります。**

方法A（推奨・手軽）: 各自がVercelプロジェクトを自分でデプロイし、自分のトークンを設定する。

方法B（管理者が一括管理）: 管理者がすべてのメンバーのトークンをDB等に保存し、`user_id` に応じて使い分ける構成に拡張する（要エンジニア対応）。

---

## ファイル構成

```
mention-bot/
├── api/
│   └── slack.js          # Slack イベントを受け取るエンドポイント
├── lib/
│   ├── claude.js         # Claude API で要約生成
│   ├── parse-period.js   # 「今日」「今週」などの期間パース
│   ├── search.js         # Slack Search API でメンション検索
│   ├── slack-post.js     # Slack に結果を返信
│   └── slack-verify.js   # Slack リクエスト署名の検証
├── package.json
├── vercel.json
└── SETUP.md              # このファイル
```
