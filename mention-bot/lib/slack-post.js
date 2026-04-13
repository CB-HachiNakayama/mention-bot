/**
 * Slack の response_url に結果を送信する
 */
export async function postToSlack(responseUrl, payload) {
  const res = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Failed to post to Slack: ${res.status}`);
  }
}
