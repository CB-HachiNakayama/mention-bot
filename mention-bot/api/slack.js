import { verifySlackRequest } from '../lib/slack.js';
import { searchMentions } from '../lib/search.js';
import { summarizeWithClaude } from '../lib/claude.js';
import { postDigest } from '../lib/slack.js';
import { parseRange } from '../lib/dateParser.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Slack URL verification challenge
  if (req.body?.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Verify the request is from Slack
  const isValid = await verifySlackRequest(req);
  if (!isValid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Respond immediately to Slack (must respond within 3s)
  res.status(200).json({ response_type: 'ephemeral', text: ':hourglass: メンションを検索中です...' });

  // Process in background
  processRequest(req.body).catch(console.error);
}

async function processRequest(body) {
  const { user_id, text, channel_id } = body;

  try {
    // Parse date range from user input (e.g. "今週", "今日", "4/7〜4/13")
    const { after, before, label } = parseRange(text || '今週');

    // 1. Search mentions for this user
    const mentions = await searchMentions(user_id, after, before);

    if (mentions.length === 0) {
      await postDigest(user_id, `:bell: *${label}のメンション*\n\nメンションは見つかりませんでした。`);
      return;
    }

    // 2. Summarize each thread with Claude
    const summarized = await summarizeWithClaude(mentions);

    // 3. Format and DM the result to the user
    const message = formatDigest(summarized, label);
    await postDigest(user_id, message);

  } catch (err) {
    console.error('Error processing request:', err);
    await postDigest(user_id, ':warning: エラーが発生しました。もう一度お試しください。');
  }
}

function formatDigest(mentions, label) {
  const lines = [`:bell: *メンション要約 — ${label}*\n`];

  mentions.forEach((m, i) => {
    lines.push(`*${i + 1}. ${m.channel} / ${m.from}｜${m.datetime}*`);
    lines.push(`:speech_balloon: *求められていること:* ${m.summary}`);
    lines.push(`→ ${m.permalink}\n`);
  });

  return lines.join('\n');
}
