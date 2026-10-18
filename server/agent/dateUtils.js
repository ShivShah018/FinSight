/**
 * Centralized Date Range Resolution Utility for FinSight Finance Agent.
 * Ensures consistent date interpretation across tools and responses.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Formats a Date object to YYYY-MM-DD string.
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Computes the date string (YYYY-MM-DD) for the next calendar day.
 * Used for half-open SQL boundaries: transaction_date >= startDate AND transaction_date < nextDay.
 * @param {string} dateStr YYYY-MM-DD
 * @returns {string} YYYY-MM-DD
 */
function getNextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const nextDate = new Date(y, m - 1, d + 1);
  return formatDate(nextDate);
}

/**
 * Resolves input arguments into a structured, validated date range.
 * 
 * Supports:
 * - Explicit month & year: { year: 2026, month: 1 } -> 2026-01-01 to 2026-01-31
 * - Year only / YTD: { year: 2026 } or { period: 'ytd' } -> 2026-01-01 to today (or end of year)
 * - Period shortcuts: 'this_month', 'last_month', 'ytd', 'year_to_date', 'full_year'
 * - Custom bounds: { start_date: '2026-01-01', end_date: '2026-06-30' }
 * 
 * @param {object} args
 * @returns {object} { startDate, endDate, startTimestamp, endTimestamp, label, periodType, year, month }
 */
function resolveDateRange(args = {}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentDay = now.getDate();

  // If explicit custom date range provided
  if (args.start_date && args.end_date) {
    const sDate = new Date(args.start_date);
    const eDate = new Date(args.end_date);
    if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
      const startStr = formatDate(sDate);
      const endStr = formatDate(eDate);
      return {
        startDate: startStr,
        endDate: endStr,
        nextDay: getNextDay(endStr),
        startTimestamp: `${startStr} 00:00:00`,
        endTimestamp: `${endStr} 23:59:59`,
        label: `${startStr} to ${endStr}`,
        periodType: 'custom',
        year: sDate.getFullYear(),
        month: sDate.getMonth() + 1
      };
    }
  }

  const period = (args.period || '').toLowerCase().trim();
  const hasExplicitMonth = typeof args.month === 'number' && args.month >= 1 && args.month <= 12;
  const hasExplicitYear = typeof args.year === 'number' && args.year >= 2000 && args.year <= 2100;

  // 1. Explicit Month and Year (e.g. month: 1, year: 2026)
  if (hasExplicitMonth) {
    const targetYear = hasExplicitYear ? args.year : currentYear;
    const targetMonth = args.month;
    const startStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const monthName = MONTH_NAMES[targetMonth - 1];

    return {
      startDate: startStr,
      endDate: endStr,
      nextDay: getNextDay(endStr),
      startTimestamp: `${startStr} 00:00:00`,
      endTimestamp: `${endStr} 23:59:59`,
      label: `${monthName} ${targetYear}`,
      periodType: 'month',
      year: targetYear,
      month: targetMonth
    };
  }

  // 2. Year to Date (YTD) or Year-Only queries (e.g., "for 2026", "spending in 2026", period="ytd")
  if (period === 'ytd' || period === 'year_to_date' || (hasExplicitYear && !hasExplicitMonth)) {
    const targetYear = hasExplicitYear ? args.year : currentYear;
    const startStr = `${targetYear}-01-01`;
    let endStr;

    if (targetYear === currentYear) {
      endStr = formatDate(now);
    } else {
      endStr = `${targetYear}-12-31`;
    }

    return {
      startDate: startStr,
      endDate: endStr,
      nextDay: getNextDay(endStr),
      startTimestamp: `${startStr} 00:00:00`,
      endTimestamp: `${endStr} 23:59:59`,
      label: targetYear === currentYear ? `Year to Date ${targetYear} (Jan 1 – ${MONTH_NAMES[now.getMonth()]} ${currentDay}, ${targetYear})` : `Full Year ${targetYear}`,
      periodType: targetYear === currentYear ? 'ytd' : 'full_year',
      year: targetYear,
      month: null
    };
  }

  // 3. Last Month
  if (period === 'last_month') {
    let lastMonthYear = currentYear;
    let lastMonth = currentMonth - 1;
    if (lastMonth === 0) {
      lastMonth = 12;
      lastMonthYear = currentYear - 1;
    }
    const startStr = `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(lastMonthYear, lastMonth, 0).getDate();
    const endStr = `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const monthName = MONTH_NAMES[lastMonth - 1];

    return {
      startDate: startStr,
      endDate: endStr,
      nextDay: getNextDay(endStr),
      startTimestamp: `${startStr} 00:00:00`,
      endTimestamp: `${endStr} 23:59:59`,
      label: `Last Month (${monthName} ${lastMonthYear})`,
      periodType: 'last_month',
      year: lastMonthYear,
      month: lastMonth
    };
  }

  // 4. Default: This Month (1st of month to end of month)
  const startStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(currentYear, currentMonth, 0).getDate();
  const endStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[currentMonth - 1];

  return {
    startDate: startStr,
    endDate: endStr,
    nextDay: getNextDay(endStr),
    startTimestamp: `${startStr} 00:00:00`,
    endTimestamp: `${endStr} 23:59:59`,
    label: `This Month (${monthName} ${currentYear})`,
    periodType: 'this_month',
    year: currentYear,
    month: currentMonth
  };
}

module.exports = {
  resolveDateRange,
  formatDate,
  getNextDay,
  MONTH_NAMES
};
