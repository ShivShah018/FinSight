const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { pool } = require('../db');
const agentController = require('../controllers/agentController');
const {
  isFixedCategory,
  extractTargetReduction,
  generateAlternativesForDeclinedProposal
} = require('../agent/proposalAlternatives');

describe('Proposal Decline & Intelligent Alternatives Test Suite', () => {
  let userAId;
  let userBId;
  let catFoodId;
  let catShopId;
  let catRentId;
  let catEntId;
  let budgetAId;
  let proposalAId;

  before(async () => {
    // 1. Setup isolated test users
    const [uARes] = await pool.execute(`
      INSERT INTO users (full_name, email, password_hash)
      VALUES ('Decline User A', 'decline_user_a_${Date.now()}@example.com', 'test_hash')
    `);
    userAId = uARes.insertId;

    const [uBRes] = await pool.execute(`
      INSERT INTO users (full_name, email, password_hash)
      VALUES ('Decline User B', 'decline_user_b_${Date.now()}@example.com', 'test_hash')
    `);
    userBId = uBRes.insertId;

    // 2. Setup standard test categories for User A
    const [catFood] = await pool.execute(
      'INSERT INTO categories (user_id, name, type, icon) VALUES (?, "Food & Dining", "expense", "🍔")',
      [userAId]
    );
    catFoodId = catFood.insertId;

    const [catShop] = await pool.execute(
      'INSERT INTO categories (user_id, name, type, icon) VALUES (?, "Shopping", "expense", "🛍️")',
      [userAId]
    );
    catShopId = catShop.insertId;

    const [catRent] = await pool.execute(
      'INSERT INTO categories (user_id, name, type, icon) VALUES (?, "Rent", "expense", "🏠")',
      [userAId]
    );
    catRentId = catRent.insertId;

    const [catEnt] = await pool.execute(
      'INSERT INTO categories (user_id, name, type, icon) VALUES (?, "Entertainment", "expense", "🎬")',
      [userAId]
    );
    catEntId = catEnt.insertId;

    // 3. Insert User A transactions:
    // Rent: ₹30,000 (Fixed)
    await pool.execute(
      'INSERT INTO transactions (user_id, category_id, amount, type, transaction_date) VALUES (?, ?, 30000, "expense", "2026-10-01")',
      [userAId, catRentId]
    );
    // Food & Dining: 3 transactions totaling ₹3,500 (Flexible)
    await pool.execute(
      'INSERT INTO transactions (user_id, category_id, amount, type, transaction_date) VALUES (?, ?, 1200, "expense", "2026-10-02")',
      [userAId, catFoodId]
    );
    await pool.execute(
      'INSERT INTO transactions (user_id, category_id, amount, type, transaction_date) VALUES (?, ?, 1500, "expense", "2026-10-05")',
      [userAId, catFoodId]
    );
    await pool.execute(
      'INSERT INTO transactions (user_id, category_id, amount, type, transaction_date) VALUES (?, ?, 800, "expense", "2026-10-10")',
      [userAId, catFoodId]
    );
    // Shopping: 2 transactions totaling ₹2,200 (Flexible)
    await pool.execute(
      'INSERT INTO transactions (user_id, category_id, amount, type, transaction_date) VALUES (?, ?, 1400, "expense", "2026-10-08")',
      [userAId, catShopId]
    );
    await pool.execute(
      'INSERT INTO transactions (user_id, category_id, amount, type, transaction_date) VALUES (?, ?, 800, "expense", "2026-10-12")',
      [userAId, catShopId]
    );

    // 4. Create budget limit for Entertainment (Limit: ₹1,500)
    const [bRes] = await pool.execute(
      'INSERT INTO budget_limits (user_id, category_id, monthly_limit) VALUES (?, ?, 1500.00)',
      [userAId, catEntId]
    );
    budgetAId = bRes.insertId;

    // 5. Create a pending proposal on Entertainment: from ₹1,500 to ₹800
    const [pRes] = await pool.execute(`
      INSERT INTO agent_proposals
        (user_id, action_type, target_budget_id, current_amount, proposed_amount, reason, supporting_evidence, status, expires_at)
      VALUES
        (?, 'UPDATE_BUDGET', ?, 1500.00, 800.00, 'Reducing Entertainment cap to help save ₹2,000 monthly.', ?, 'pending', DATE_ADD(NOW(), INTERVAL 24 HOUR))
    `, [
      userAId,
      budgetAId,
      JSON.stringify({
        user_query: 'Help me reduce my monthly spending by ₹2,000',
        target_reduction: 2000,
        reporting_period: { label: 'Monthly Target' }
      })
    ]);
    proposalAId = pRes.insertId;
  });

  after(async () => {
    // Clean up
    if (userAId) {
      await pool.execute('DELETE FROM agent_proposals WHERE user_id = ?', [userAId]);
      await pool.execute('DELETE FROM budget_limits WHERE user_id = ?', [userAId]);
      await pool.execute('DELETE FROM transactions WHERE user_id = ?', [userAId]);
      await pool.execute('DELETE FROM categories WHERE user_id = ?', [userAId]);
      await pool.execute('DELETE FROM users WHERE id = ?', [userAId]);
    }
    if (userBId) {
      await pool.execute('DELETE FROM agent_proposals WHERE user_id = ?', [userBId]);
      await pool.execute('DELETE FROM users WHERE id = ?', [userBId]);
    }
    await pool.end();
  });

  test('Fixed vs Flexible category classifier distinguishes essential costs accurately', () => {
    assert.strictEqual(isFixedCategory('Rent'), true);
    assert.strictEqual(isFixedCategory('Electricity & Utilities'), true);
    assert.strictEqual(isFixedCategory('Health Insurance'), true);
    assert.strictEqual(isFixedCategory('Education / Tuition'), true);
    assert.strictEqual(isFixedCategory('Food & Dining'), false);
    assert.strictEqual(isFixedCategory('Shopping'), false);
    assert.strictEqual(isFixedCategory('Entertainment'), false);
  });

  test('Target reduction extractor captures intended goal from query and reason', () => {
    const target1 = extractTargetReduction('Help me reduce my monthly spending by ₹2,000', '', 500);
    assert.strictEqual(target1, 2000);

    const target2 = extractTargetReduction('', 'Save ₹1,500 every month', 700);
    assert.strictEqual(target2, 1500);

    const target3 = extractTargetReduction('General spending check', 'Optimization', 600);
    assert.strictEqual(target3, 600);
  });

  test('Declining a proposal leaves the active budget limit completely unchanged', async () => {
    const req = {
      user: { id: userAId },
      params: { proposal_id: proposalAId }
    };
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (body) => { responseBody = body; }
        };
      }
    };

    await agentController.rejectProposal(req, res);

    assert.strictEqual(responseStatus, 200);
    assert.strictEqual(responseBody.success, true);
    assert.strictEqual(responseBody.status, 'rejected');

    // Verify budget_limits in database is STILL ₹1,500
    const [bRows] = await pool.execute('SELECT monthly_limit FROM budget_limits WHERE id = ?', [budgetAId]);
    assert.strictEqual(parseFloat(bRows[0].monthly_limit), 1500.00);

    // Verify proposal status in agent_proposals is 'rejected'
    const [pRows] = await pool.execute('SELECT status FROM agent_proposals WHERE id = ?', [proposalAId]);
    assert.strictEqual(pRows[0].status, 'rejected');
  });

  test('Declined proposal provides natural acknowledgement and data-grounded alternatives', async () => {
    const req = {
      user: { id: userAId },
      params: { proposal_id: proposalAId }
    };
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (body) => { responseBody = body; }
        };
      }
    };

    await agentController.rejectProposal(req, res);

    assert.strictEqual(responseStatus, 200);
    assert.ok(responseBody.acknowledgement.includes('Entertainment'));
    assert.ok(responseBody.acknowledgement.includes('unchanged'));

    // Check alternatives data
    const altData = responseBody.alternatives_data;
    assert.strictEqual(altData.has_alternatives, true);
    assert.strictEqual(altData.original_goal.target_reduction, 2000);
    assert.strictEqual(altData.original_goal.declined_category, 'Entertainment');

    // Must recommend Food & Dining and Shopping (flexible categories with actual spend)
    const categoryNames = altData.alternatives.map(a => a.category_name);
    assert.ok(categoryNames.includes('Food & Dining'), 'Should include Food & Dining alternative');
    assert.ok(categoryNames.includes('Shopping'), 'Should include Shopping alternative');

    // Must NOT recommend Rent (which is a fixed cost)
    assert.ok(!categoryNames.includes('Rent'), 'Should not suggest cutting Rent as a flexible alternative');

    // Each alternative must have a suggested prompt and explanation
    altData.alternatives.forEach(alt => {
      assert.ok(alt.title);
      assert.ok(alt.explanation);
      assert.ok(alt.suggested_prompt);
      assert.strictEqual(alt.is_fixed_cost, false);
    });
  });

  test('Duplicate decline request is idempotent and does not create duplicate proposals', async () => {
    // Check proposal count before second decline
    const [countBefore] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM agent_proposals WHERE user_id = ?',
      [userAId]
    );

    const req = {
      user: { id: userAId },
      params: { proposal_id: proposalAId }
    };
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (body) => { responseBody = body; }
        };
      }
    };

    // Replay decline
    await agentController.rejectProposal(req, res);

    assert.strictEqual(responseStatus, 200);
    assert.strictEqual(responseBody.already_declined, true);

    // Verify NO new proposal was inserted
    const [countAfter] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM agent_proposals WHERE user_id = ?',
      [userAId]
    );
    assert.strictEqual(countBefore[0].cnt, countAfter[0].cnt);
  });

  test('User B cannot decline User A proposal (ownership protection)', async () => {
    const req = {
      user: { id: userBId }, // Different user
      params: { proposal_id: proposalAId }
    };
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (body) => { responseBody = body; }
        };
      }
    };

    await agentController.rejectProposal(req, res);

    assert.strictEqual(responseStatus, 403);
    assert.ok(responseBody.detail.includes('Access denied'));
  });

  test('Another user financial data cannot leak into alternative recommendations', async () => {
    // Create a proposal for User B who has NO transactions
    const [catEntB] = await pool.execute(
      'INSERT INTO categories (user_id, name, type, icon) VALUES (?, "Entertainment", "expense", "🎬")',
      [userBId]
    );
    const [bBRes] = await pool.execute(
      'INSERT INTO budget_limits (user_id, category_id, monthly_limit) VALUES (?, ?, 2000.00)',
      [userBId, catEntB.insertId]
    );
    const [pBRes] = await pool.execute(`
      INSERT INTO agent_proposals
        (user_id, action_type, target_budget_id, current_amount, proposed_amount, reason, status, expires_at)
      VALUES
        (?, 'UPDATE_BUDGET', ?, 2000.00, 1000.00, 'Test proposal for User B', 'pending', DATE_ADD(NOW(), INTERVAL 24 HOUR))
    `, [userBId, bBRes.insertId]);

    const req = {
      user: { id: userBId },
      params: { proposal_id: pBRes.insertId }
    };
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (body) => { responseBody = body; }
        };
      }
    };

    await agentController.rejectProposal(req, res);

    assert.strictEqual(responseStatus, 200);
    // User B has no transactions; User A's Food & Dining or Shopping must NOT leak!
    const altData = responseBody.alternatives_data;
    assert.strictEqual(altData.has_alternatives, false);
    assert.strictEqual(altData.alternatives.length, 0);
    assert.ok(responseBody.assistant_reply.includes('Follow-up Question'));
  });

  test('Keeping current spending leaves all budget limits unchanged and creates no rogue proposals', async () => {
    // 1. Verify budget limits for User A before
    const [budgetsBefore] = await pool.execute(
      'SELECT id, category_id, monthly_limit FROM budget_limits WHERE user_id = ? ORDER BY id',
      [userAId]
    );

    // 2. Count proposals for User A before
    const [proposalsBefore] = await pool.execute(
      'SELECT COUNT(*) as count FROM agent_proposals WHERE user_id = ?',
      [userAId]
    );

    // 3. User chooses "No thanks, keep it as it is"
    // Verify database state remains strictly identical with zero mutations
    const [budgetsAfter] = await pool.execute(
      'SELECT id, category_id, monthly_limit FROM budget_limits WHERE user_id = ? ORDER BY id',
      [userAId]
    );

    const [proposalsAfter] = await pool.execute(
      'SELECT COUNT(*) as count FROM agent_proposals WHERE user_id = ?',
      [userAId]
    );

    assert.deepStrictEqual(budgetsBefore, budgetsAfter, 'Budget limits must remain 100% identical');
    assert.strictEqual(proposalsBefore[0].count, proposalsAfter[0].count, 'No rogue proposals created');
  });
});
