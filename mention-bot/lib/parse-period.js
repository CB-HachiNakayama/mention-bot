/**
 * 自然言語の期間指定をUnixタイムスタンプに変換する
 * タイムゾーン: JST (UTC+9)
 */

const JST = 9 * 60 * 60 * 1000;

function jstDayStart(offsetDays = 0) {
  const now = new Date();
  const jstNow = new Date(now.getTime() + JST);
  const y = jstNow.getUTCFullYear();
  const m = jstNow.getUTCMonth();
  const d = jstNow.getUTCDate() + offsetDays;
  const jstMidnight = new Date(Date.UTC(y, m, d, 0, 0, 0) - JST);
  return Math.floor(jstMidnight.getTime() / 1000);
}

function jstDateStart(year, month, day) {
  const jstMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - JST);
  return Math.floor(jstMidnight.getTime() / 1000);
}

function currentJstYear() {
  return new Date(new Date().getTime() + JST).getUTCFullYear();
}

function currentJstDayOfWeek() {
  return new Date(new Date().getTime() + JST).getUTCDay();
}

export function parsePeriod(text) {
  if (!text || text === '') return getThisWeek();

  if (/今日|きょう|today/i.test(text)) {
    return { since: jstDayStart(0), until: null, label: '今日' };
  }

  if (/昨日|きのう|yesterday/i.test(text)) {
    return { since: jstDayStart(-1), until: jstDayStart(0), label: '昨日' };
  }

  if (/今週|こんしゅう|this\s*week/i.test(text)) return getThisWeek();
  if (/先週|せんしゅう|last\s*week/i.test(text)) return getLastWeek();

  const daysMatch = text.match(/過去\s*(\d+)\s*日/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    return { since: jstDayStart(-days), until: null, label: `過去${days}日` };
  }

  const rangeMatch = text.match(/(\d{1,2})\/(\d{1,2})\s*[-〜~]\s*(\d{1,2})\/(\d{1,2})/);
  if (rangeMatch) {
    const year = currentJstYear();
    return {
      since: jstDateStart(year, parseInt(rangeMatch[1]), parseInt(rangeMatch[2])),
      until: jstDateStart(year, parseInt(rangeMatch[3]), parseInt(rangeMatch[4]) + 1),
      label: `${rangeMatch[1]}/${rangeMatch[2]}〜${rangeMatch[3]}/${rangeMatch[4]}`,
    };
  }

  const singleMatch = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (singleMatch) {
    const year = currentJstYear();
    const m = parseInt(singleMatch[1]);
    const d = parseInt(singleMatch[2]);
    return {
      since: jstDateStart(year, m, d),
      until: jstDateStart(year, m, d + 1),
      label: `${singleMatch[1]}/${singleMatch[2]}`,
    };
  }

  return getThisWeek();
}

function getThisWeek() {
  const dow = currentJstDayOfWeek();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  return { since: jstDayStart(-daysFromMonday), until: null, label: '今週' };
}

function getLastWeek() {
  const dow = currentJstDayOfWeek();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  return {
    since: jstDayStart(-daysFromMonday - 7),
    until: jstDayStart(-daysFromMonday),
    label: '先週',
  };
}
