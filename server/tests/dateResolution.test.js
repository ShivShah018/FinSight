const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolveDateRange, getNextDay } = require('../agent/dateUtils');
const { getMonthlySpending, getCategoryBreakdown } = require('../agent/financeTools');

describe('Date Range Resolution & Tool Integration', () => {
  test('Explicit month and year resolves to start and end of that month with nextDay boundary', () => {
    const range = resolveDateRange({ year: 2026, month: 1 });
    assert.equal(range.startDate, '2026-01-01');
    assert.equal(range.endDate, '2026-01-31');
    assert.equal(range.nextDay, '2026-02-01');
    assert.equal(range.label, 'January 2026');
    assert.equal(range.periodType, 'month');
  });

  test('getNextDay handles month transitions and leap year boundaries correctly', () => {
    assert.equal(getNextDay('2026-01-31'), '2026-02-01');
    assert.equal(getNextDay('2026-02-28'), '2026-03-01');
    assert.equal(getNextDay('2024-02-28'), '2024-02-29'); // Leap year
    assert.equal(getNextDay('2024-02-29'), '2024-03-01');
    assert.equal(getNextDay('2026-12-31'), '2027-01-01'); // Year transition
  });

  test('Year to date (YTD) query resolves from Jan 1 through today', () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const range = resolveDateRange({ year: currentYear });
    assert.equal(range.startDate, `${currentYear}-01-01`);
    assert.equal(range.periodType, 'ytd');
    assert.ok(range.label.includes('Year to Date'));
    assert.ok(range.nextDay > range.endDate);
  });

  test('Explicit "last_month" resolves to the entire previous calendar month', () => {
    const range = resolveDateRange({ period: 'last_month' });
    assert.equal(range.periodType, 'last_month');
    assert.ok(range.startDate.endsWith('-01'));
    assert.ok(range.label.includes('Last Month'));
    assert.ok(range.nextDay);
  });

  test('Custom date range resolves to exact provided bounds with nextDay', () => {
    const range = resolveDateRange({ start_date: '2026-02-01', end_date: '2026-05-31' });
    assert.equal(range.startDate, '2026-02-01');
    assert.equal(range.endDate, '2026-05-31');
    assert.equal(range.nextDay, '2026-06-01');
    assert.equal(range.periodType, 'custom');
  });

  test('getMonthlySpending includes reporting_period in response with mock db', async () => {
    const mockDb = {
      execute: async () => [
        [
          { type: 'income', total: '10000.00', count: 1 },
          { type: 'expense', total: '3500.00', count: 2 }
        ]
      ]
    };

    const res = await getMonthlySpending({ year: 2026, month: 1 }, 1, mockDb);
    assert.equal(res.has_data, true);
    assert.equal(res.total_income, 10000);
    assert.equal(res.total_expense, 3500);
    assert.equal(res.net_savings, 6500);
    assert.ok(res.reporting_period);
    assert.equal(res.reporting_period.label, 'January 2026');
  });

  test('Empty period correctly returns has_data: false without fabrication', async () => {
    const mockDb = {
      execute: async () => [[]]
    };

    const res = await getMonthlySpending({ year: 2026, month: 10 }, 1, mockDb);
    assert.equal(res.has_data, false);
    assert.equal(res.total_income, 0);
    assert.equal(res.total_expense, 0);
    assert.equal(res.net_savings, 0);
    assert.equal(res.total_transactions, 0);
    assert.equal(res.reporting_period.label, 'October 2026');
  });

  test('Deterministic Figure Verification: User 1 YTD 2026 matches exact verified MySQL figures', async () => {
    const verifiedDb = {
      execute: async () => [
        [
          { type: 'expense', total: '60090.00', count: 78 },
          { type: 'income', total: '155146.00', count: 17 }
        ]
      ]
    };
    const res = await getMonthlySpending({ year: 2026 }, 1, verifiedDb);
    assert.equal(res.has_data, true);
    assert.equal(res.total_expense, 60090);
    assert.equal(res.total_income, 155146);
    assert.equal(res.net_savings, 95056);
    assert.equal(res.expense_count, 78);
    assert.equal(res.income_count, 17);
    assert.equal(res.total_transactions, 95);
    assert.ok(res.reporting_period.label.includes('2026'));
  });

  test('getCategoryBreakdown calculates percentages over date range', async () => {
    const mockDb = {
      execute: async () => [
        [
          { category_id: 1, category_name: 'Food', color: '#ff0000', icon: 'utensils', total: '1500.00', transaction_count: 3 },
          { category_id: 2, category_name: 'Rent', color: '#00ff00', icon: 'home', total: '3500.00', transaction_count: 1 }
        ]
      ]
    };

    const res = await getCategoryBreakdown({ period: 'ytd', year: 2026 }, 1, mockDb);
    assert.equal(res.has_data, true);
    assert.equal(res.overall_total, 5000);
    assert.equal(res.categories[0].category_name, 'Food');
    assert.equal(res.categories[0].percentage_of_total, 30);
    assert.equal(res.categories[1].percentage_of_total, 70);
    assert.ok(res.reporting_period);
  });
});
