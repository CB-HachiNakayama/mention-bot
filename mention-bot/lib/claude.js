/**
 * Claude API でメンション一覧を要約する
 */
export async function summarizeWithClaude(mentions, userName, label) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const mentionsText = mentions
    .map((m, i) => {
      const threadSummary =
        m.thread && m.thread.length > 1
          ? '\n  [スレッド内容]\n' +
            m.thread
              .slice(0, 6)
              .map((t) => `  ${t.user}: ${t.text.slice(0, 200)}`)
              .join('\n')
          : '';

      return `${i + 1}. チャンネル: #${m.channel} / 送信者: ${m.user} / ${formatTs(m.ts)}
メッセージ: ${m.text.slice(0, 300)}${threadSummary}
リンク: ${m.permalink}`;
    })
    .join('\n\n');

  const prompt = `あなたはSlackのメンション整理アシスタントです。
以下は「${userName}」さんへの${label}のメンション一覧です。
各メンションについて「何を求められているか」を1〜2文で日本語要約し、リンク付きでまとめてください。

フォーマット:
:bell: *${userName} さんへのメンション — ${label}*

1. *#チャンネル名 / 送信者名｜日時*
:speech_balloon: *求められていること:* （要約）
→ リンク

---

メンション一覧:
${mentionsText}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Claude API error: ${data.error.message}`);

  return data.content?.[0]?.text ?? '要約を生成できませんでした。';
}

function formatTs(ts) {
  if (!ts) return '';
  const d = new Date(parseFloat(ts) * 1000);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
}
