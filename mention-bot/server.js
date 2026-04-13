import express from 'express';
import { verifySlackRequest } from './lib/slack-verify.js';
import { searchMentions } from './lib/search.js';
import { summarizeWithClaude } from './lib/claude.js';
import { parsePeriod } from './lib/parse-period.js';
import { getThreadMessages, resolveDisplayName } from './lib/imakita-search.js';
import { summarizeThreadWithClaude } from './lib/imakita-claude.js';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => res.send('mention-bot is running!'));

// -----------------------------------------------
// /matome コマンド（メンション要約）
// -----------------------------------------------
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

// -----------------------------------------------
// /imakita コマンド（今北産業：スレッド要件洗い出し）
// -----------------------------------------------
app.post('/api/imakita', async (req, res) => {
  if (req.body?.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  const isValid = await verifySlackRequest(req);
  if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

  const { user_id, channel_id, thread_ts, response_url } = req.body;

  // スレッド外から打たれた場合
  if (!thread_ts) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: '⚠️ スレッド内で打ってください！\n要約したいスレッドの返信欄で `/imakita` を打つと動きます。',
    });
  }

  // 即時レスポンス（3秒以内に返さないとタイムアウト）
  res.status(200).json({
    response_type: 'ephemeral',
    text: '🔍 スレッドを全部読んでいます...',
  });

  (async () => {
    try {
      const messages = await getThreadMessages(channel_id, thread_ts);

      if (!messages || messages.length === 0) {
        await postToSlack(response_url, {
          response_type: 'ephemeral',
          text: '⚠️ スレッドのメッセージが取得できませんでした。',
        });
        return;
      }

      const myDisplayName = await resolveDisplayName(user_id);
      const chunks = await summarizeThreadWithClaude(messages, myDisplayName);

      for (const chunk of chunks) {
        await postToSlack(response_url, {
          response_type: 'ephemeral',
          text: chunk,
        });
      }
    } catch (err) {
      console.error('imakita error:', err);
      await postToSlack(response_url, {
        response_type: 'ephemeral',
        text: `❌ エラーが発生しました: ${err.message}`,
      });
    }
  })();
});

// -----------------------------------------------
// 共通ユーティリティ
// -----------------------------------------------
async function postToSlack(responseUrl, payload) {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`mention-bot listening on port ${PORT}`));
