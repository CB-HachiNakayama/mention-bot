/**
 * Slack Search API でユーザーへのメンションを検索する
 * DM・プライベート・コネクトチャンネルも含む
 */
export async function searchMentions({ userId, since, until }) {
  const token = process.env.SLACK_USER_TOKEN;
  if (!token) throw new Error('SLACK_USER_TOKEN is not set');

  const query = `<@${userId}>`;
  const params = new URLSearchParams({
    query,
    sort: 'timestamp',
    sort_dir: 'desc',
    count: '20',
  });

  if (since) params.set('oldest', String(since));
  if (until) params.set('latest', String(until));

  const res = await fetch(
    `https://slack.com/api/search.messages?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const data = await res.json();
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`);

  const messages = data.messages?.matches ?? [];

  // ユーザー表示名のキャッシュ
  const userCache = {};

  const enriched = await Promise.all(
    messages.map(async (msg) => {
      const thread = await fetchThreadContext(msg, token);
      const displayName = await getUserDisplayName(msg.user, token, userCache);
      return {
        channel: msg.channel?.name ?? 'DM',
        channelId: msg.channel?.id,
        user: displayName,
        userId: msg.user,
        text: msg.text,
        ts: msg.ts,
        permalink: msg.permalink,
        threadTs: msg.thread_ts,
        replyCount: msg.reply_count ?? 0,
        thread,
      };
    })
  );

  const grouped = groupByThread(enriched);
  return grouped;
}

// ユーザーIDからSlackの表示名を取得する
async function getUserDisplayName(userId, token, cache) {
  if (!userId) return 'unknown';
  if (cache[userId]) return cache[userId];

  try {
    const res = await fetch(
      `https://slack.com/api/users.info?user=${userId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (!data.ok) return userId;

    const profile = data.user?.profile;
    // 表示名の優先順位: display_name > real_name > name
    const name =
      profile?.display_name ||
      profile?.real_name ||
      data.user?.name ||
      userId;

    cache[userId] = name;
    return name;
  } catch {
    return userId;
  }
}

async function fetchThreadContext(msg, token) {
  if (!msg.thread_ts || !msg.channel?.id) return [];

  try {
    const params = new URLSearchParams({
      channel: msg.channel.id,
      ts: msg.thread_ts,
      limit: '10',
    });

    const res = await fetch(
      `https://slack.com/api/conversations.replies?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (!data.ok) return [];

    return (data.messages ?? []).map((m) => ({
      user: m.username ?? m.user,
      text: m.text,
      ts: m.ts,
    }));
  } catch {
    return [];
  }
}

function groupByThread(messages) {
  const seen = new Set();
  const result = [];

  for (const msg of messages) {
    const key = msg.threadTs ?? msg.ts;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(msg);
  }

  return result;
}
