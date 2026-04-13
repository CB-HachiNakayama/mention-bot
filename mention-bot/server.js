import express from 'express';
import { verifySlackRequest } from './lib/slack-verify.js';
import { searchMentions } from './lib/search.js';
import { summarizeWithClaude } from './lib/claude.js';
import { parsePeriod } from './lib/parse-period.js';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => res.send('mention-bot is running!'));

app.post('/api/slack', async (req, res) => {
  if (req.body?.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  const isValid = await verifySlackRequest(req);
  if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

  const { user_id, user_name, text, response_url } = req.body;

  res.status(200).json({
    response_type: 'ephemeral',
    text: `⏳ <@${user_id}> さんのメンションを検索中です...`,
  });

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

      const chunks = await summarizeWithClaude(mentions, user_name, label);

      // 複数チャンクを順番に送信
      for (const chunk of chunks) {
        await postToSlack(response_url, {
          response_type: 'ephemeral',
          text: chunk,
        });
      }
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
app.listen(PORT, () => console.log(`mention-bot listening on port ${PORT}`));
