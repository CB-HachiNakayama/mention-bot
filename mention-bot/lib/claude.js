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
          ? '\n  [スレッド全文]\n' +
            m.thread
              .slice(0, 8)
              .map((t) => `  ${t.user}: ${t.text.slice(0, 300)}`)
              .join('\n')
          : '';
      return `${i + 1}. チャンネル: #${m.channel} / 送信者: ${m.user} / ${formatTs(m.ts)}
メッセージ: ${m.text.slice(0, 400)}${threadSummary}
リンク: ${m.permalink}`;
    })
    .join('\n\n');

  const prompt = `あなたはSlackのメンション整理アシスタントです。
「${userName}」さんへの${label}のメンション一覧を整理してください。

## 要約のルール
- スレッドの内容をしっかり読み込んで、「${userName}さんに何が求められているか」を具体的に書く
- 「何かの相談」「確認をお願いされています」のような抽象的な表現は禁止
- 具体的なタスク・確認事項・対応内容を箇条書きで書く
- 例: 「ハドルで相談したい」ではなく「レースゲームのモチーフリストについて、企画確認前にハドルで共有したい（スプレッドシートのリンクあり）」のように詳しく
- 対応が不要な連絡（報告・情報共有のみ）はその旨を明記する

## 出力フォーマット（このフォーマット以外の文字は出力しない）

:bell: *${userName} さんへのメンション — ${label}*

番号. *#チャンネル名 / 送信者名｜日時*
:speech_balloon: *求められていること:*
• 具体的なタスクや確認事項1
• 具体的なタスクや確認事項2
→ リンク

---

## メンション一覧
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
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Claude API error: ${data.error.message}`);

  const fullText = data.content?.[0]?.text ?? '要約を生成できませんでした。';
  return splitMessage(fullText);
}

function splitMessage(text, limit = 2900) {
  if (text.length <= limit) return [text];

  const chunks = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    if ((current + '\n' + line).length > limit) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
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
