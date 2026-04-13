/**
 * Slack Search API でユーザーへのメンションを検索する
 * DM・プライベート・コネクトチャンネルも含む
 *
 * 注意: search.messages はユーザートークンが必要（Bot トークン不可）
 * → Slack App で "User Token Scopes" に search:read を追加すること
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

  // スレッドの内容を取得して要約に使う
  const enriched = await Promise.all(
    messages.map(async (msg) => {
      const thread = await fetchThreadContext(msg, token);
      return {
        channel: msg.channel?.name ?? 'DM',
        channelId: msg.channel?.id,
        user: msg.username ?? msg.user,
        text: msg.text,
        ts: msg.ts,
        permalink: msg.permalink,
        threadTs: msg.thread_ts,
        replyCount: msg.reply_count ?? 0,
        thread,
      };
    })
  );

  // 同一スレッドをまとめる（thread_ts が同じものを1件に集約）
  const grouped = groupByThread(enriched);
  return grouped;
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
      {
        headers: { Authorization: `Bearer ${token}` },
      }
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
