import crypto from 'crypto';
import getRawBody from 'raw-body';

export async function verifySlackRequest(req) {
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
  if (!slackSigningSecret) throw new Error('SLACK_SIGNING_SECRET is not set');

  const timestamp = req.headers['x-slack-request-timestamp'];
  const slackSignature = req.headers['x-slack-signature'];

  // 5分以上古いリクエストは拒否（リプレイアタック対策）
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  // raw body を取得（Vercel では req.body がパース済みのため再構築）
  let rawBody;
  try {
    rawBody = await getRawBody(req, { encoding: 'utf-8' });
  } catch {
    // すでに読み取り済みの場合は body を文字列化
    rawBody = new URLSearchParams(req.body).toString();
  }

  const sigBaseString = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto
    .createHmac('sha256', slackSigningSecret)
    .update(sigBaseString)
    .digest('hex');
  const computedSig = `v0=${hmac}`;

  return crypto.timingSafeEqual(
    Buffer.from(computedSig),
    Buffer.from(slackSignature)
  );
}
