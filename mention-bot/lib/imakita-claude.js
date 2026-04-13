/**
 * /imakita コマンド用
 * スレッド全文を読んでCanBeeメンバーへの要件を洗い出す
 * Overloadedエラー時は自動リトライ（最大3回）
 */

import { resolveDisplayName, resolveMessageMentions } from './imakita-search.js';

export async function summarizeThreadWithClaude(messages, myDisplayName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const formatted = await Promise.all(
    messages.map(async (msg, i) => {
      const senderName = await resolveDisplayName(msg.user ?? '不明');
      const text = await resolveMessageMentions(msg.text ?? '');
      const label = i === 0 ? '最初の投稿' : `返信${i}`;
      const timeStr = formatTs(msg.ts);
      return `[${label} / ${timeStr} / ${senderName}]\n${text}`;
    })
  );

  const threadText = formatted.join('\n\n---\n\n');

  const prompt = `以下はSlackのスレッド全文です。

あなたのタスクは、このスレッドを読んで **CanBeeメンバー（デザイナー）への要件・依頼・確認事項・アクションアイテム** をすべて洗い出すことです。

【CanBeeメンバーの識別方法】
- 表示名が「CB_」から始まる人（例：CB_Hachi、CB_Nakayama）
- または @canbee.co.jp のメールアドレスを持つ人

【コマンドを打った人】
- 表示名：${myDisplayName}
- この人への要件は特に見落とさないよう注意してください

【出力フォーマット】

📌 *スレッド概要*
（スレッド全体の話題を2〜3文で説明）

---

🎯 *CanBeeメンバーへの要件・アクションアイテム*

*【担当：@表示名】*
• 具体的な要件・タスク（「何かの確認」「対応をお願い」などの抽象表現は絶対に禁止）
• 期限や優先度があれば記載
• 判断が必要な場合はその選択肢も記載

---

📎 *未解決・要確認事項*
（返答がない・方向性が決まっていない事項があれば列挙。なければ省略）

【重要ルール】
- 要件は必ず具体的に書く
  良い例：「◇の重複表示の修正対応」「戻るボタンがエンジニア側かデザイン側の修正かを北村さんに回答する」
  悪い例：「修正対応をお願いされています」「何かの確認が必要です」
- CanBeeメンバー以外への要件はスキップしてよい
- 要件が見当たらない場合は「CanBeeメンバーへの要件は見当たりませんでした」と書く
- 日本語で出力する

---

【スレッド全文（${messages.length}件）】
${threadText}`;

  // Overloaded時は自動リトライ（最大3回、待機時間を徐々に増やす）
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();

    // Overloadedなら待ってリトライ
    if (data.error?.type === 'overloaded_error') {
      if (attempt < maxRetries) {
        const waitMs = attempt * 5000; // 5秒 → 10秒 → 15秒
        console.log(`Claude overloaded, retry ${attempt}/${maxRetries} after ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }
      throw new Error('Claude APIが混雑しています。しばらく待ってから再度お試しください🙏');
    }

    if (data.error) throw new Error(`Claude API error: ${data.error.message}`);

    const fullText = data.content?.[0]?.text ?? '要約を生成できませんでした。';
    return splitMessage(fullText);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const m = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mm = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
}
