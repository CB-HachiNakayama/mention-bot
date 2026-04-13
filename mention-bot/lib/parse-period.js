/**
 * 自然言語の期間指定をUnixタイムスタンプに変換する
 * 例: "今日" "今週" "昨日" "4/7-4/13" "4/10〜4/12"
 */
export function parsePeriod(text) {
  const now = new Date();
  // JST に調整
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);

  const todayStart = new Date(jstNow);
  todayStart.setUTCHours(0, 0, 0, 0);

  // デフォルト: 今週 (月曜始まり)
  if (!text || text === '') {
    return getThisWeek(jstNow, todayStart);
  }

  // 今日
  if (/今日|きょう|today/i.test(text)) {
    return {
      since: toUnix(todayStart),
      until: null,
      label: '今日',
    };
  }

  // 昨日
  if (/昨日|きのう|yesterday/i.test(text)) {
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
    return {
      since: toUnix(yesterdayStart),
      until: toUnix(todayStart),
      label: '昨日',
    };
  }

  // 今週
  if (/今週|こんしゅう|this\s*week/i.test(text)) {
    return getThisWeek(jstNow, todayStart);
  }

  // 先週
  if (/先週|せんしゅう|last\s*week/i.test(text)) {
    return getLastWeek(todayStart);
  }

  // 過去N日
  const daysMatch = text.match(/過去\s*(\d+)\s*日/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    const since = new Date(todayStart);
    since.setUTCDate(since.getUTCDate() - days);
    return {
      since: toUnix(since),
      until: null,
      label: `過去${days}日`,
    };
  }

  // 日付範囲: 4/7-4/13, 4/7〜4/13, 4/7~4/13
  const rangeMatch = text.match(
    /(\d{1,2})\/(\d{1,2})\s*[-〜~]\s*(\d{1,2})\/(\d{1,2})/
  );
  if (rangeMatch) {
    const year = jstNow.getUTCFullYear();
    const since = dateToUnix(year, parseInt(rangeMatch[1]), parseInt(rangeMatch[2]));
    // until は終日含めるため翌日の0時
    const untilDate = new Date(
      Date.UTC(year, parseInt(rangeMatch[3]) - 1, parseInt(rangeMatch[4]) + 1)
    );
    return {
      since,
      until: toUnix(untilDate),
      label: `${rangeMatch[1]}/${rangeMatch[2]}〜${rangeMatch[3]}/${rangeMatch[4]}`,
    };
  }

  // 単一日付: 4/10
  const singleMatch = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (singleMatch) {
    const year = jstNow.getUTCFullYear();
    const since = dateToUnix(year, parseInt(singleMatch[1]), parseInt(singleMatch[2]));
    const untilDate = new Date(since * 1000);
    untilDate.setUTCDate(untilDate.getUTCDate() + 1);
    return {
      since,
      until: toUnix(untilDate),
      label: `${singleMatch[1]}/${singleMatch[2]}`,
    };
  }

  // 解釈できない場合は今週
  return getThisWeek(jstNow, todayStart);
}

function getThisWeek(jstNow, todayStart) {
  const dayOfWeek = jstNow.getUTCDay(); // 0=日, 1=月...
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(todayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - daysFromMonday);
  return {
    since: toUnix(weekStart),
    until: null,
    label: '今週',
  };
}

function getLastWeek(todayStart) {
  const dayOfWeek = todayStart.getUTCDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisWeekStart = new Date(todayStart);
  thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - daysFromMonday);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  return {
    since: toUnix(lastWeekStart),
    until: toUnix(thisWeekStart),
    label: '先週',
  };
}

function toUnix(date) {
  return Math.floor(date.getTime() / 1000);
}

function dateToUnix(year, month, day) {
  return toUnix(new Date(Date.UTC(year, month - 1, day)));
}
