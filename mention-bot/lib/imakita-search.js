/**
 * /imakita コマンド用
 * スレッドのメッセージを全件取得 + ユーザー表示名解決
 */

const token = () => {
  if (!process.env.SLACK_USER_TOKEN) throw new Error('SLACK_USER_TOKEN is not set');
  return process.env.SLACK_USER_TOKEN;
};

/**
 * スレッドのメッセージを全件取得（ページネーション対応）
 */
export async function getThreadMessages(channelId, threadTs) {
  let allMessages = [];
  let cursor = undefined;

  do {
    const params = new URLSearchParams({
      channel: channelId,
      ts: threadTs,
      limit: '200',
      ...(cursor ? { cursor } : {}),
    });

    const res = await fetch(`https://slack.com/api/conversations.replies?${params}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Slack API error: ${data.error}`);

    allMessages = allMessages.concat(data.messages ?? []);
    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return allMessages;
}

/**
 * ユーザーIDから表示名を取得
 */
export async function resolveDisplayName(userId) {
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    const data = await res.json();
    if (!data.ok) return userId;
    const profile = data.user?.profile;
    return profile?.display_name || profile?.real_name || data.user?.name || userId;
  } catch {
    return userId;
  }
}

/**
 * メッセージ内の <@UXXXXX> をSlack表示名に変換
 */
export async function resolveMessageMentions(text) {
  if (!text) return '';
  const mentionRegex = /<@(U[A-Z0-9]+)>/g;
  const userIds = [...new Set([...text.matchAll(mentionRegex)].map((m) => m[1]))];
  const nameMap = {};
  await Promise.all(
    userIds.map(async (uid) => {
      nameMap[uid] = await resolveDisplayName(uid);
    })
  );
  return text.replace(mentionRegex, (_, uid) => `@${nameMap[uid] ?? uid}`);
}
