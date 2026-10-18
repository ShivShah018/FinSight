const { tool } = require('@langchain/core/tools');
const { pool: defaultPool } = require('../db');
const {
  getMonthlySpendingSchema,
  getCategoryBreakdownSchema,
  getBudgetStatusSchema,
  getSpendingComparisonSchema,
  getUnusualTransactionsSchema
} = require('./agentSchemas');
const { resolveDateRange, MONTH_NAMES } = require('./dateUtils');

/**
 * Pure functions executing parameterized, secure queries for authenticated user.
 */

async function getMonthlySpending(args, userId, db = defaultPool) {
  const validated = getMonthlySpendingSchema.parse(args || {});
  const range = resolveDateRange(validated);

  const [summaryRows] = await db.execute(`
    SELECT type, COALESCE(SUM(amount), 0) AS total, COUNT(id) AS count
    FROM transactions
    WHERE user_id = ? AND deleted_at IS NULL
      AND transaction_date >= ? AND transaction_date < ?
    GROUP BY type
  `, [userId, range.startDate, range.nextDay]);

  let totalIncome = 0;
  let totalExpense = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  summaryRows.forEach(row => {
    const total = parseFloat(row.total);
    const count = parseInt(row.count, 10);
    if (row.type === 'income') {
      totalIncome = total;
      incomeCount = count;
    } else if (row.type === 'expense') {
      totalExpense = total;
      expenseCount = count;
    }
  });

  const netSavings = Math.round((totalIncome - totalExpense) * 100) / 100;
  const savingsRate = totalIncome > 0
    ? Math.round(((totalIncome - totalExpense) / totalIncome) * 1000) / 10
    : 0;

  const msInDay = 24 * 60 * 60 * 1000;
  const sDate = new Date(range.startDate);
  const eDate = new Date(range.endDate);
  const totalDays = Math.max(1, Math.round(Math.abs((eDate - sDate) / msInDay)) + 1);
  const avgDailySpending = totalDays > 0 ? Math.round((totalExpense / totalDays) * 100) / 100 : 0;

  return {
    reporting_period: {
      start_date: range.startDate,
      end_date: range.endDate,
      label: range.label,
      period_type: range.periodType,
      total_days: totalDays
    },
    year: range.year,
    month: range.month,
    has_data: (incomeCount + expenseCount) > 0,
    total_income: totalIncome,
    total_expense: totalExpense,
    net_savings: netSavings,
    savings_rate_pct: savingsRate,
    avg_daily_spending: avgDailySpending,
    total_transactions: incomeCount + expenseCount,
    expense_count: expenseCount,
    income_count: incomeCount
  };
}

async function getCategoryBreakdown(args, userId, db = defaultPool) {
  const validated = getCategoryBreakdownSchema.parse(args || {});
  const range = resolveDateRange(validated);
  const type = validated.type || 'expense';

  const [rows] = await db.execute(`
    SELECT c.id AS category_id, c.name AS category_name, c.color, c.icon,
           COALESCE(SUM(t.amount), 0) AS total,
           COUNT(t.id) AS transaction_count
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ? AND t.type = ? AND t.deleted_at IS NULL
      AND t.transaction_date >= ? AND t.transaction_date < ?
    GROUP BY c.id, c.name, c.color, c.icon
    ORDER BY total DESC
  `, [userId, type, range.startDate, range.nextDay]);

  let overallTotal = 0;
  rows.forEach(r => {
    overallTotal += parseFloat(r.total);
  });
  overallTotal = Math.round(overallTotal * 100) / 100;

  const categories = rows.map(r => {
    const total = parseFloat(r.total);
    const pct = overallTotal > 0 ? Math.round((total / overallTotal) * 1000) / 10 : 0;
    return {
      category_id: r.category_id,
      category_name: r.category_name,
      icon: r.icon,
      color: r.color,
      total_amount: total,
      transaction_count: parseInt(r.transaction_count, 10),
      percentage_of_total: pct
    };
  });

  return {
    reporting_period: {
      start_date: range.startDate,
      end_date: range.endDate,
      label: range.label,
      period_type: range.periodType
    },
    year: range.year,
    month: range.month,
    type,
    has_data: categories.length > 0,
    overall_total: overallTotal,
    categories
  };
}

async function getBudgetStatus(args, userId, db = defaultPool) {
  const validated = getBudgetStatusSchema.parse(args || {});
  const range = resolveDateRange(validated);

  const [rows] = await db.execute(`
    SELECT b.id AS budget_id, b.category_id, c.name AS category_name, c.icon,
           b.monthly_limit,
           COALESCE(SUM(t.amount), 0) AS spent
    FROM budget_limits b
    JOIN categories c ON b.category_id = c.id
    LEFT JOIN transactions t ON t.category_id = c.id
      AND t.user_id = ? AND t.type = 'expense' AND t.deleted_at IS NULL
      AND t.transaction_date >= ? AND t.transaction_date < ?
    WHERE b.user_id = ?
    GROUP BY b.id, b.category_id, b.monthly_limit, c.name, c.icon
    ORDER BY c.name
  `, [userId, range.startDate, range.nextDay, userId]);

  let totalBudget = 0;
  let totalSpent = 0;
  const budgets = [];
  const exceededBudgets = [];
  const atRiskBudgets = [];

  rows.forEach(r => {
    const limit = parseFloat(r.monthly_limit);
    const spent = parseFloat(r.spent);
    const remaining = Math.round((limit - spent) * 100) / 100;
    const utilizationPct = limit > 0 ? Math.round((spent / limit) * 1000) / 10 : 0;

    totalBudget += limit;
    totalSpent += spent;

    let status = 'under_budget';
    if (spent > limit) {
      status = 'exceeded';
    } else if (utilizationPct >= 85) {
      status = 'at_risk';
    }

    const item = {
      budget_id: r.budget_id,
      category_id: r.category_id,
      category_name: r.category_name,
      icon: r.icon,
      monthly_limit: limit,
      spent,
      remaining,
      utilization_pct: utilizationPct,
      status
    };

    budgets.push(item);
    if (status === 'exceeded') exceededBudgets.push(item);
    if (status === 'at_risk') atRiskBudgets.push(item);
  });

  return {
    reporting_period: {
      start_date: range.startDate,
      end_date: range.endDate,
      label: range.label,
      period_type: range.periodType
    },
    year: range.year,
    month: range.month,
    has_budgets: budgets.length > 0,
    total_budget_limit: Math.round(totalBudget * 100) / 100,
    total_budget_spent: Math.round(totalSpent * 100) / 100,
    overall_utilization_pct: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 1000) / 10 : 0,
    budgets_count: budgets.length,
    exceeded_count: exceededBudgets.length,
    at_risk_count: atRiskBudgets.length,
    budgets,
    exceeded_budgets: exceededBudgets,
    at_risk_budgets: atRiskBudgets
  };
}

async function getSpendingComparison(args, userId, db = defaultPool) {
  const validated = getSpendingComparisonSchema.parse(args || {});
  const now = new Date();
  const currentYear = validated.current_year || now.getFullYear();
  const currentMonth = validated.current_month || (now.getMonth() + 1);

  let currentPeriodArgs;
  let previousPeriodArgs;

  if (validated.current_period === 'ytd' || validated.current_period === 'year_to_date') {
    currentPeriodArgs = { period: 'ytd', year: currentYear };
    previousPeriodArgs = { period: 'full_year', year: currentYear - 1 };
  } else {
    let prevMonth = validated.previous_month;
    let prevYear = validated.previous_year;

    if (!prevMonth) {
      if (currentMonth === 1) {
        prevMonth = 12;
        prevYear = currentYear - 1;
      } else {
        prevMonth = currentMonth - 1;
        prevYear = currentYear;
      }
    } else if (!prevYear) {
      prevYear = currentYear;
    }

    currentPeriodArgs = { year: currentYear, month: currentMonth };
    previousPeriodArgs = { year: prevYear, month: prevMonth };
  }

  // Fetch summaries
  const currentData = await getMonthlySpending(currentPeriodArgs, userId, db);
  const previousData = await getMonthlySpending(previousPeriodArgs, userId, db);

  // Fetch category breakdowns for both
  const currentCats = await getCategoryBreakdown({ ...currentPeriodArgs, type: 'expense' }, userId, db);
  const previousCats = await getCategoryBreakdown({ ...previousPeriodArgs, type: 'expense' }, userId, db);

  const prevCatMap = new Map();
  previousCats.categories.forEach(c => prevCatMap.set(c.category_name, c.total_amount));

  const categoryComparisons = currentCats.categories.map(c => {
    const prevAmount = prevCatMap.get(c.category_name) || 0;
    const diff = Math.round((c.total_amount - prevAmount) * 100) / 100;
    const pctChange = prevAmount > 0
      ? Math.round(((c.total_amount - prevAmount) / prevAmount) * 1000) / 10
      : null;
    return {
      category_name: c.category_name,
      current_amount: c.total_amount,
      previous_amount: prevAmount,
      difference: diff,
      pct_change: pctChange,
      trend: diff > 0 ? 'increased' : diff < 0 ? 'decreased' : 'unchanged'
    };
  });

  const expenseDiff = Math.round((currentData.total_expense - previousData.total_expense) * 100) / 100;
  const expensePctChange = previousData.total_expense > 0
    ? Math.round((expenseDiff / previousData.total_expense) * 1000) / 10
    : null;

  return {
    reporting_period: {
      current: currentData.reporting_period,
      previous: previousData.reporting_period
    },
    current_period: {
      label: currentData.reporting_period.label,
      total_expense: currentData.total_expense,
      total_income: currentData.total_income
    },
    previous_period: {
      label: previousData.reporting_period.label,
      total_expense: previousData.total_expense,
      total_income: previousData.total_income
    },
    has_sufficient_history: previousData.has_data,
    difference: expenseDiff,
    expense_difference: expenseDiff,
    expense_pct_change: expensePctChange,
    trend: expenseDiff > 0 ? 'increased' : expenseDiff < 0 ? 'decreased' : 'unchanged',
    category_comparisons: categoryComparisons
  };
}

async function getUnusualTransactions(args, userId, db = defaultPool) {
  const validated = getUnusualTransactionsSchema.parse(args || {});
  const range = resolveDateRange(validated);
  const multiplier = validated.threshold_multiplier || 2.0;

  // Get average expense in resolved date range (or 90 days if empty)
  let dateFilter = 'AND t.transaction_date >= ? AND t.transaction_date < ?';
  let dateParams = [range.startDate, range.nextDay];

  const [stats] = await db.execute(`
    SELECT AVG(t.amount) AS avg_amount, STDDEV(t.amount) AS std_amount, COUNT(t.id) AS total_count
    FROM transactions t
    WHERE t.user_id = ? AND t.type = 'expense' AND t.deleted_at IS NULL ${dateFilter}
  `, [userId, ...dateParams]);

  const avgAmount = stats[0]?.avg_amount ? parseFloat(stats[0].avg_amount) : 0;
  const count = stats[0]?.total_count ? parseInt(stats[0].total_count, 10) : 0;

  if (count < 3 || avgAmount === 0) {
    return {
      reporting_period: {
        start_date: range.startDate,
        end_date: range.endDate,
        label: range.label
      },
      has_unusual: false,
      message: `Not enough transaction history in ${range.label} to reliably detect unusual spending (minimum 3 expense transactions required).`,
      unusual_transactions: []
    };
  }

  const threshold = Math.round(avgAmount * multiplier * 100) / 100;

  const [unusualRows] = await db.execute(`
    SELECT t.id, t.amount, t.description, t.transaction_date, c.name AS category_name
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ? AND t.type = 'expense' AND t.deleted_at IS NULL
      AND t.amount >= ? ${dateFilter}
    ORDER BY t.amount DESC LIMIT 10
  `, [userId, threshold, ...dateParams]);

  const unusual = unusualRows.map(r => {
    const amount = parseFloat(r.amount);
    return {
      id: r.id,
      amount,
      category_name: r.category_name,
      description: r.description || 'No description',
      transaction_date: r.transaction_date,
      ratio_to_average: Math.round((amount / avgAmount) * 10) / 10
    };
  });

  return {
    reporting_period: {
      start_date: range.startDate,
      end_date: range.endDate,
      label: range.label
    },
    has_unusual: unusual.length > 0,
    average_transaction_amount: Math.round(avgAmount * 100) / 100,
    threshold_used: threshold,
    unusual_count: unusual.length,
    unusual_transactions: unusual
  };
}

/**
 * Creates LangChain tools bound to the authenticated userId.
 */
function createFinanceTools(userId, db = defaultPool) {
  return [
    tool(
      async (args) => {
        try {
          const res = await getMonthlySpending(args, userId, db);
          return JSON.stringify(res);
        } catch (err) {
          return JSON.stringify({ error: err.message });
        }
      },
      {
        name: 'get_monthly_spending',
        description: 'Get total income, expense, and net savings for a specific month, year-to-date (e.g. 2026 so far), full year, or custom range.',
        schema: getMonthlySpendingSchema
      }
    ),
    tool(
      async (args) => {
        try {
          const res = await getCategoryBreakdown(args, userId, db);
          return JSON.stringify(res);
        } catch (err) {
          return JSON.stringify({ error: err.message });
        }
      },
      {
        name: 'get_category_breakdown',
        description: 'Get spending or income broken down by category for a specific month, year-to-date (e.g. 2026 so far), or custom date range.',
        schema: getCategoryBreakdownSchema
      }
    ),
    tool(
      async (args) => {
        try {
          const res = await getBudgetStatus(args, userId, db);
          return JSON.stringify(res);
        } catch (err) {
          return JSON.stringify({ error: err.message });
        }
      },
      {
        name: 'get_budget_status',
        description: 'Get budget limits, actual spent amounts, utilization percentages, and status for a month or period.',
        schema: getBudgetStatusSchema
      }
    ),
    tool(
      async (args) => {
        try {
          const res = await getSpendingComparison(args, userId, db);
          return JSON.stringify(res);
        } catch (err) {
          return JSON.stringify({ error: err.message });
        }
      },
      {
        name: 'get_spending_comparison',
        description: 'Compare spending between two periods (defaults to current month vs previous month, or YTD).',
        schema: getSpendingComparisonSchema
      }
    ),
    tool(
      async (args) => {
        try {
          const res = await getUnusualTransactions(args, userId, db);
          return JSON.stringify(res);
        } catch (err) {
          return JSON.stringify({ error: err.message });
        }
      },
      {
        name: 'get_unusual_transactions',
        description: 'Detect unusually high expense transactions in a period compared to average spending.',
        schema: getUnusualTransactionsSchema
      }
    )
  ];
}

module.exports = {
  getMonthlySpending,
  getCategoryBreakdown,
  getBudgetStatus,
  getSpendingComparison,
  getUnusualTransactions,
  createFinanceTools
};
