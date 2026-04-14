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
    count: '50',
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

  // ユーザーIDキャッシュ（同じIDを何度も叩かないように）
  const nameCache = {};
  const resolveName = async (uid) => {
    if (!uid) return uid;
    if (nameCache[uid]) return nameCache[uid];
    const name = await fetchDisplayName(uid, token);
    nameCache[uid] = name;
    return name;
  };

  // スレッドの内容を取得＋送信者の表示名を解決
  const enriched = await Promise.all(
    messages.map(async (msg) => {
      const thread = await fetchThreadContext(msg, token, resolveName);
      const displayName = await resolveName(msg.user);
      return {
        channel: msg.channel?.name ?? 'DM',
        channelId: msg.channel?.id,
        user: displayName || msg.username || msg.user,
        text: msg.text,
        ts: msg.ts,
        permalink: msg.permalink,
        threadTs: msg.thread_ts || msg.ts,
        replyCount: msg.reply_count ?? 0,
        thread,
      };
    })
  );

  // 同一スレッドをまとめる
  return groupByThread(enriched);
}

/**
 * ユーザーIDからSlack表示名を取得
 */
async function fetchDisplayName(userId, token) {
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
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
 * スレッドのコンテキストを取得（返信も表示名で）
 */
async function fetchThreadContext(msg, token, resolveName) {
  if (!msg.thread_ts || !msg.channel?.id) return [];

  try {
    const params = new URLSearchParams({
      channel: msg.channel.id,
      ts: msg.thread_ts,
      limit: '20',
    });

    const res = await fetch(
      `https://slack.com/api/conversations.replies?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (!data.ok) return [];

    return await Promise.all(
      (data.messages ?? []).map(async (m) => ({
        user: (await resolveName(m.user)) || m.username || m.user,
        text: m.text,
        ts: m.ts,
      }))
    );
  } catch {
    return [];
  }
}

/**
 * 同一スレッドのメンションをまとめる
 * thread_tsが同じものは1件に集約し、関係者を全員リストアップ
 */
function groupByThread(messages) {
  const threadMap = new Map();

  for (const msg of messages) {
    const key = msg.threadTs;

    if (!threadMap.has(key)) {
      threadMap.set(key, {
        ...msg,
        participants: new Set([msg.user]),
      });
    } else {
      const existing = threadMap.get(key);
      existing.participants.add(msg.user);
      // より古いメッセージ（スレッドの起点）を優先
      if (parseFloat(msg.ts) < parseFloat(existing.ts)) {
        threadMap.set(key, {
          ...msg,
          participants: existing.participants,
          thread: existing.thread,
        });
      }
    }
  }

  return Array.from(threadMap.values()).map((m) => ({
    ...m,
    participants: Array.from(m.participants),
  }));
}
