const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { AIMessage, ToolMessage } = require('@langchain/core/messages');

const {
  getMonthlySpending,
  getCategoryBreakdown,
  getBudgetStatus,
  getSpendingComparison,
  getUnusualTransactions
} = require('../agent/financeTools');
const {
  getMonthlySpendingSchema,
  getCategoryBreakdownSchema,
  getBudgetStatusSchema,
  getSpendingComparisonSchema
} = require('../agent/agentSchemas');
const { createFinanceAgentGraph } = require('../agent/financeAgent');
const { pool } = require('../db');

describe('Agent Financial Tools & Schemas', () => {
  let testUserId = null;
  let testCategoryId = null;

  before(async () => {
    // Insert a transient test user for deterministic testing
    const [uRes] = await pool.execute(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      ['Agent Test User', `agent_test_${Date.now()}@example.com`, 'test_hash']
    );
    testUserId = uRes.insertId;

    // Insert a test category
    const [cRes] = await pool.execute(
      'INSERT INTO categories (user_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)',
      [testUserId, 'Dining & Food', 'expense', '🍔', '#ef4444']
    );
    testCategoryId = cRes.insertId;
  });

  after(async () => {
    if (testUserId) {
      await pool.execute('DELETE FROM transactions WHERE user_id = ?', [testUserId]);
      await pool.execute('DELETE FROM users WHERE id = ?', [testUserId]);
    }
  });

  test('Schema validation rejects invalid arguments', () => {
    assert.throws(() => {
      getMonthlySpendingSchema.parse({ month: 13 });
    }, /Month must be between 1 and 12/);

    assert.throws(() => {
      getMonthlySpendingSchema.parse({ year: 1990 });
    });

    assert.throws(() => {
      getCategoryBreakdownSchema.parse({ type: 'invalid_type' });
    });

    assert.throws(() => {
      getSpendingComparisonSchema.parse({ current_month: 0 });
    });
  });

  test('Empty dataset handling returns zeroed totals without hallucination', async () => {
    // Test user has zero transactions initially
    const spending = await getMonthlySpending({ year: 2026, month: 7 }, testUserId, pool);
    assert.equal(spending.has_data, false);
    assert.equal(spending.total_income, 0);
    assert.equal(spending.total_expense, 0);
    assert.equal(spending.net_savings, 0);
    assert.equal(spending.total_transactions, 0);

    const breakdown = await getCategoryBreakdown({ year: 2026, month: 7 }, testUserId, pool);
    assert.equal(breakdown.has_data, false);
    assert.equal(breakdown.overall_total, 0);
    assert.deepEqual(breakdown.categories, []);

    const budgets = await getBudgetStatus({ year: 2026, month: 7 }, testUserId, pool);
    assert.equal(budgets.has_budgets, false);
    assert.equal(budgets.total_budget_limit, 0);
    assert.deepEqual(budgets.budgets, []);
  });

  test('Insufficient historical data handles comparisons honestly', async () => {
    // Current period has no transactions, previous period has none
    const comp = await getSpendingComparison(
      { current_year: 2026, current_month: 7, previous_year: 2026, previous_month: 6 },
      testUserId,
      pool
    );
    assert.equal(comp.has_sufficient_history, false);
    assert.equal(comp.current_period.total_expense, 0);
    assert.equal(comp.previous_period.total_expense, 0);
    assert.equal(comp.difference, 0);
  });

  test('Tools accurately calculate totals and percentages when data exists', async () => {
    // Insert test transactions
    await pool.execute(`
      INSERT INTO transactions (user_id, category_id, amount, type, transaction_date)
      VALUES (?, ?, 2500.00, 'expense', '2026-07-10'),
             (?, ?, 1500.00, 'expense', '2026-07-15')
    `, [testUserId, testCategoryId, testUserId, testCategoryId]);

    // Insert budget limit
    await pool.execute(`
      INSERT INTO budget_limits (user_id, category_id, monthly_limit)
      VALUES (?, ?, 5000.00)
    `, [testUserId, testCategoryId]);

    const spending = await getMonthlySpending({ year: 2026, month: 7 }, testUserId, pool);
    assert.equal(spending.has_data, true);
    assert.equal(spending.total_expense, 4000.00);
    assert.equal(spending.expense_count, 2);

    const breakdown = await getCategoryBreakdown({ year: 2026, month: 7 }, testUserId, pool);
    assert.equal(breakdown.has_data, true);
    assert.equal(breakdown.overall_total, 4000.00);
    assert.equal(breakdown.categories.length, 1);
    assert.equal(breakdown.categories[0].category_name, 'Dining & Food');
    assert.equal(breakdown.categories[0].total_amount, 4000.00);
    assert.equal(breakdown.categories[0].percentage_of_total, 100);

    const budgetStatus = await getBudgetStatus({ year: 2026, month: 7 }, testUserId, pool);
    assert.equal(budgetStatus.has_budgets, true);
    assert.equal(budgetStatus.budgets.length, 1);
    assert.equal(budgetStatus.budgets[0].spent, 4000.00);
    assert.equal(budgetStatus.budgets[0].monthly_limit, 5000.00);
    assert.equal(budgetStatus.budgets[0].remaining, 1000.00);
    assert.equal(budgetStatus.budgets[0].utilization_pct, 80);
    assert.equal(budgetStatus.budgets[0].status, 'under_budget');
  });

  test('Unusual transactions detects high expenses based on threshold multiplier', async () => {
    // Add small and huge transactions
    await pool.execute(`
      INSERT INTO transactions (user_id, category_id, amount, type, transaction_date)
      VALUES (?, ?, 100.00, 'expense', '2026-07-16'),
             (?, ?, 120.00, 'expense', '2026-07-17'),
             (?, ?, 25000.00, 'expense', '2026-07-18')
    `, [testUserId, testCategoryId, testUserId, testCategoryId, testUserId, testCategoryId]);

    const unusual = await getUnusualTransactions({ year: 2026, month: 7, threshold_multiplier: 2.0 }, testUserId, pool);
    assert.equal(unusual.has_unusual, true);
    assert.ok(unusual.unusual_transactions.some(tx => tx.amount === 25000.00));
  });
});

describe('LangGraph Agent Workflow (with Mocked Model)', () => {
  let testUserId = null;
  let testCategoryId = null;

  before(async () => {
    const [uRes] = await pool.execute(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      ['Graph Test User', `graph_test_${Date.now()}@example.com`, 'test_hash']
    );
    testUserId = uRes.insertId;

    const [cRes] = await pool.execute(
      'INSERT INTO categories (user_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)',
      [testUserId, 'Groceries', 'expense', '🛒', '#3b82f6']
    );
    testCategoryId = cRes.insertId;

    await pool.execute(`
      INSERT INTO transactions (user_id, category_id, amount, type, transaction_date)
      VALUES (?, ?, 3500.00, 'expense', '2026-07-05')
    `, [testUserId, testCategoryId]);

    await pool.execute(`
      INSERT INTO budget_limits (user_id, category_id, monthly_limit)
      VALUES (?, ?, 3000.00)
    `, [testUserId, testCategoryId]);
  });

  after(async () => {
    if (testUserId) {
      await pool.execute('DELETE FROM transactions WHERE user_id = ?', [testUserId]);
      await pool.execute('DELETE FROM users WHERE id = ?', [testUserId]);
    }
    await pool.end();
  });

  test('Agent workflow selects tool, executes tool, evaluates evidence, and generates grounded response', async () => {
    // Create a mock model that simulates Gemini native function calling:
    // Turn 1: model returns tool_calls for get_budget_status
    // Turn 2: model returns final grounded message
    let callCount = 0;
    const mockModel = {
      bindTools: function() {
        return this;
      },
      invoke: async (messages) => {
        callCount++;
        if (callCount === 1) {
          return new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'call_mock_1',
                name: 'get_budget_status',
                args: { year: 2026, month: 7 }
              }
            ]
          });
        } else {
          return new AIMessage({
            content: 'In July 2026, you spent ₹3,500 on Groceries against a budget limit of ₹3,000, exceeding your budget by ₹500.'
          });
        }
      }
    };

    const graph = createFinanceAgentGraph({ model: mockModel, db: pool });
    const result = await graph.invoke({
      messages: [{ role: 'user', content: 'Which categories are exceeding their budgets?' }],
      userId: testUserId,
      userQuery: 'Which categories are exceeding their budgets?',
      iterationCount: 0
    });

    assert.ok(result.finalResponse, 'Must produce a final response');
    assert.ok(result.finalResponse.message.includes('Groceries'));
    assert.ok(result.toolResults.get_budget_status, 'Must have recorded get_budget_status results');
    assert.equal(result.toolResults.get_budget_status.exceeded_count, 1);
    assert.equal(result.toolResults.get_budget_status.exceeded_budgets[0].category_name, 'Groceries');
  });

  test('Agent stops execution when iteration limit is reached', async () => {
    // Model that loops infinitely trying to call tools
    const loopingModel = {
      bindTools: function() {
        return this;
      },
      invoke: async () => {
        return new AIMessage({
          content: '',
          tool_calls: [
            {
              id: `call_${Date.now()}`,
              name: 'get_monthly_spending',
              args: { year: 2026, month: 7 }
            }
          ]
        });
      }
    };

    const graph = createFinanceAgentGraph({ model: loopingModel, db: pool });
    const result = await graph.invoke({
      messages: [{ role: 'user', content: 'Loop test' }],
      userId: testUserId,
      userQuery: 'Loop test',
      iterationCount: 0
    });

    // Should gracefully terminate and not crash or loop infinitely
    assert.ok(result.iterationCount <= 4, `Must stop at bounded iteration limit, got ${result.iterationCount}`);
  });

  test('Agent controller rejects missing message payload with 400', async () => {
    const agentController = require('../controllers/agentController');
    const req = {
      user: { id: testUserId },
      body: {}
    };
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; }
    };

    await agentController.chat(req, res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.errors);
  });
});
