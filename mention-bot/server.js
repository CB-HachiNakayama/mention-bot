import express from 'express';
import { verifySlackRequest } from './lib/slack-verify.js';
import { searchMentions } from './lib/search.js';
import { summarizeWithClaude } from './lib/claude.js';
import { parsePeriod } from './lib/parse-period.js';
import { getThreadMessages, resolveDisplayName } from './lib/imakita-search.js';
import { summarizeThreadWithClaude } from './lib/imakita-claude.js';
import { parseSlackThreadUrl } from './lib/parse-thread-url.js';

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
// 使い方: /imakita https://xxx.slack.com/archives/C123/p1234567890
// -----------------------------------------------
app.post('/api/imakita', async (req, res) => {
  if (req.body?.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  const isValid = await verifySlackRequest(req);
  if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

  const { user_id, text, response_url } = req.body;

  // URLが渡されていない場合
  const threadUrl = text?.trim();
  if (!threadUrl) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: '⚠️ スレッドのURLを指定してください。\n使い方: `/imakita https://xxx.slack.com/archives/C123/p1234567890`\n\nSlackでスレッドを開いて「リンクをコピー」したURLを貼り付けてください。',
    });
  }

  // URLをパース
  const parsed = parseSlackThreadUrl(threadUrl);
  if (!parsed) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: '⚠️ SlackのスレッドURLを正しく認識できませんでした。\nスレッドを開いて「・・・」→「リンクをコピー」で取得したURLを貼り付けてください。',
    });
  }

  // 即時レスポンス
  res.status(200).json({
    response_type: 'ephemeral',
    text: '🔍 スレッドを全部読んでいます...',
  });

  (async () => {
    try {
      const messages = await getThreadMessages(parsed.channelId, parsed.threadTs);

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
