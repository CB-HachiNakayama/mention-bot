/**
 * SlackのスレッドURLからchannel_idとthread_tsを取得する
 *
 * URL形式の例：
 * https://xxx.slack.com/archives/C09HXTGTVV1/p1775813263927379
 * https://xxx.slack.com/archives/C09HXTGTVV1/p1775813263927379?thread_ts=1775813263.927379&cid=C09HXTGTVV1
 */
export function parseSlackThreadUrl(url) {
  if (!url) return null;

  // /archives/CHANNEL_ID/pTIMESTAMP 形式
  const match = url.match(/\/archives\/([A-Z0-9]+)\/p(\d+)/);
  if (!match) return null;

  const channelId = match[1];

  // pの後の数字（16桁）を "1234567890.123456" 形式に変換
  const raw = match[2];
  const threadTs = raw.slice(0, -6) + '.' + raw.slice(-6);

  return { channelId, threadTs };
}
