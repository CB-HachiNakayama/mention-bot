const { summarizeThread } = require('../lib/imakita-claude');
const { getThreadMessages, getUserInfo } = require('../lib/imakita-search');

/**
 * /imakita コマンドのハンドラ
 * スレッド内で打つと、そのスレッドを全部読んで
 * 自分とCanBeeメンバー(CB_*)に関わる要件を洗い出す
 */
async function handleImakita(req, res) {
  // Slackにはまず200を返す（3秒以内に返さないとタイムアウトする）
  res.status(200).send('');

  const { user_id, channel_id, thread_ts, text } = req.body;

  // スレッド外から打たれた場合
  const targetThreadTs = thread_ts || null;
  if (!targetThreadTs) {
    await postEphemeral(
      channel_id,
      user_id,
      '⚠️ スレッド内で打ってください！\n要約したいスレッドの返信欄で `/imakita` を打つと動きます。'
    );
    return;
  }

  try {
    await postEphemeral(channel_id, user_id, '🔍 スレッドを読み込んでいます...');

    // スレッドのメッセージを全件取得
    const messages = await getThreadMessages(channel_id, targetThreadTs);

    if (!messages || messages.length === 0) {
      await postEphemeral(channel_id, user_id, '⚠️ スレッドのメッセージが取得できませんでした。');
      return;
    }

    // 自分の情報を取得
    const myInfo = await getUserInfo(user_id);
    const myDisplayName = myInfo?.profile?.display_name || myInfo?.name || user_id;

    // Claudeで要約
    const summary = await summarizeThread(messages, myDisplayName, user_id);

    // 結果をephemeralで返す（自分にしか見えない）
    const chunks = splitMessage(summary);
    for (const chunk of chunks) {
      await postEphemeral(channel_id, user_id, chunk);
    }
  } catch (err) {
    console.error('imakita error:', err);
    await postEphemeral(channel_id, user_id, `❌ エラーが発生しました: ${err.message}`);
  }
}

// Slackのephemeral message（自分にしか見えない）を送信
async function postEphemeral(channel, user, text) {
  const fetch = (await import('node-fetch')).default;
  await fetch('https://slack.com/api/chat.postEphemeral', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SLACK_USER_TOKEN}`,
    },
    body: JSON.stringify({ channel, user, text }),
  });
}

// Slackの3000文字制限でメッセージを分割
function splitMessage(text, maxLen = 2900) {
  const chunks = [];
  let current = text;
  while (current.length > maxLen) {
    const splitAt = current.lastIndexOf('\n', maxLen);
    const pos = splitAt > 0 ? splitAt : maxLen;
    chunks.push(current.slice(0, pos));
    current = current.slice(pos + 1);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

module.exports = { handleImakita };
