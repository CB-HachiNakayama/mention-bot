import express from 'express';
import { verifySlackRequest } from './lib/slack-verify.js';
import { searchMentions } from './lib/search.js';
import { summarizeWithClaude } from './lib/claude.js';
import { parsePeriod } from './lib/parse-period.js';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('mention-bot is running!');
});

app.post('/api/slack', async (req, res) => {
  // Slack の URL verification challenge
  if (req.body?.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Slack リクエスト署名の検証
  const isValid = await verifySlackRequest(req);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { user_id, user_name, text, response_url } = req.body;

  // 即時 200 を返す（Slack は 3 秒以内のレスポンスを要求）
  res.status(200).json({
    response_type: 'ephemeral',
    text: `⏳ <@${user_id}> さんのメンションを検索中です... しばらくお待ちください`,
  });

  // 非同期で処理を続行
  (async () => {
    try {
      const { since, until, label } = parsePeriod(text?.trim());
      const mentions = await searchMentions({ userId: user_id, since, until });

      if (mentions.length === 0) {
        await postToSlack(response_url, {
          response_type: 'ephemeral',
          text: `✅ ${label}のメンションは見つかりませんでした。`,
        });
        return;
      }

      const summary = await summarizeWithClaude(mentions, user_name, label);

      await postToSlack(response_url, {
        response_type: 'ephemeral',
        text: summary,
      });
    } catch (err) {
      console.error(err);
      await postToSlack(response_url, {
        response_type: 'ephemeral',
        text: `❌ エラーが発生しました: ${err.message}`,
      });
    }
  })();
});

async function postToSlack(responseUrl, payload) {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`mention-bot listening on port ${PORT}`);
});
