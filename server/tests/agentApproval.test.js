const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const agentController = require('../controllers/agentController');
const { pool } = require('../db');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

describe('Agent Proposal & Approval Security Suite', () => {
  let userAId = null;
  let userBId = null;
  let categoryAId = null;
  let budgetAId = null;
  let proposalAId = null;

  before(async () => {
    // 1. Create User A
    const [uARes] = await pool.execute(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      ['User A', `user_a_${Date.now()}@example.com`, 'hash_a']
    );
    userAId = uARes.insertId;

    // 2. Create User B
    const [uBRes] = await pool.execute(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      ['User B', `user_b_${Date.now()}@example.com`, 'hash_b']
    );
    userBId = uBRes.insertId;

    // 3. Create category for User A
    const [catRes] = await pool.execute(
      'INSERT INTO categories (user_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)',
      [userAId, 'Groceries', 'expense', '🛒', '#3b82f6']
    );
    categoryAId = catRes.insertId;

    // 4. Create budget limit of 5,000 for User A
    const [bRes] = await pool.execute(
      'INSERT INTO budget_limits (user_id, category_id, monthly_limit) VALUES (?, ?, 5000.00)',
      [userAId, categoryAId]
    );
    budgetAId = bRes.insertId;

    // 5. Create active pending proposal for User A (proposing 4,000)
    const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [pRes] = await pool.execute(`
      INSERT INTO agent_proposals 
        (user_id, action_type, target_budget_id, current_amount, proposed_amount, reason, status, expires_at)
      VALUES 
        (?, 'UPDATE_BUDGET', ?, 5000.00, 4000.00, 'Reduce grocery spend based on trends', 'pending', ?)
    `, [userAId, budgetAId, futureExpiry]);
    proposalAId = pRes.insertId;
  });

  after(async () => {
    // Clean up created records
    if (userAId) {
      await pool.execute('DELETE FROM agent_proposals WHERE user_id = ?', [userAId]);
      await pool.execute('DELETE FROM budget_limits WHERE user_id = ?', [userAId]);
      await pool.execute('DELETE FROM categories WHERE user_id = ?', [userAId]);
      await pool.execute('DELETE FROM users WHERE id = ?', [userAId]);
    }
    if (userBId) {
      await pool.execute('DELETE FROM agent_proposals WHERE user_id = ?', [userBId]);
      await pool.execute('DELETE FROM budget_limits WHERE user_id = ?', [userBId]);
      await pool.execute('DELETE FROM categories WHERE user_id = ?', [userBId]);
      await pool.execute('DELETE FROM users WHERE id = ?', [userBId]);
    }
    await pool.end();
  });

  test('User B cannot view User A proposal', async () => {
    const req = {
      user: { id: userBId },
      params: { proposal_id: proposalAId }
    };
    const res = mockRes();

    await agentController.getProposal(req, res);
    assert.equal(res.statusCode, 404, 'User B must not see User A proposal');
  });

  test('User B cannot approve User A proposal (ownership protection)', async () => {
    const req = {
      user: { id: userBId },
      params: { proposal_id: proposalAId }
    };
    const res = mockRes();

    await agentController.approveProposal(req, res);
    assert.equal(res.statusCode, 403, 'Must return 403 Forbidden when approving another user proposal');
  });

  test('User B cannot reject User A proposal (ownership protection)', async () => {
    const req = {
      user: { id: userBId },
      params: { proposal_id: proposalAId }
    };
    const res = mockRes();

    await agentController.rejectProposal(req, res);
    assert.equal(res.statusCode, 403, 'Must return 403 Forbidden when rejecting another user proposal');
  });

  test('Expired proposal cannot be approved', async () => {
    // Create an expired proposal for User A
    const pastExpiry = new Date(Date.now() - 3600 * 1000);
    const [pRes] = await pool.execute(`
      INSERT INTO agent_proposals 
        (user_id, action_type, target_budget_id, current_amount, proposed_amount, reason, status, expires_at)
      VALUES 
        (?, 'UPDATE_BUDGET', ?, 5000.00, 3500.00, 'Expired test proposal', 'pending', ?)
    `, [userAId, budgetAId, pastExpiry]);
    const expiredProposalId = pRes.insertId;

    const req = {
      user: { id: userAId },
      params: { proposal_id: expiredProposalId }
    };
    const res = mockRes();

    await agentController.approveProposal(req, res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.detail.includes('expired'), 'Must reject approval of expired proposal');

    // Verify budget was not modified
    const [bRows] = await pool.execute('SELECT monthly_limit FROM budget_limits WHERE id = ?', [budgetAId]);
    assert.equal(parseFloat(bRows[0].monthly_limit), 5000.00);
  });

  test('Rejecting a proposal updates status to rejected and leaves budget limit untouched', async () => {
    // Create a proposal to reject
    const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [pRes] = await pool.execute(`
      INSERT INTO agent_proposals 
        (user_id, action_type, target_budget_id, current_amount, proposed_amount, reason, status, expires_at)
      VALUES 
        (?, 'UPDATE_BUDGET', ?, 5000.00, 4200.00, 'Rejection test', 'pending', ?)
    `, [userAId, budgetAId, futureExpiry]);
    const toRejectId = pRes.insertId;

    const req = {
      user: { id: userAId },
      params: { proposal_id: toRejectId }
    };
    const res = mockRes();

    await agentController.rejectProposal(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    // Verify proposal status in DB
    const [pRows] = await pool.execute('SELECT status FROM agent_proposals WHERE id = ?', [toRejectId]);
    assert.equal(pRows[0].status, 'rejected');

    // Verify budget untouched
    const [bRows] = await pool.execute('SELECT monthly_limit FROM budget_limits WHERE id = ?', [budgetAId]);
    assert.equal(parseFloat(bRows[0].monthly_limit), 5000.00);

    // Attempting to approve a rejected proposal must fail
    const approveReq = {
      user: { id: userAId },
      params: { proposal_id: toRejectId }
    };
    const approveRes = mockRes();
    await agentController.approveProposal(approveReq, approveRes);
    assert.equal(approveRes.statusCode, 400);
    assert.ok(approveRes.body.detail.includes('rejected'));
  });

  test('Stale proposal protection prevents overwriting budget if limit was changed out-of-band', async () => {
    // Create a proposal based on current limit = 5000
    const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [pRes] = await pool.execute(`
      INSERT INTO agent_proposals 
        (user_id, action_type, target_budget_id, current_amount, proposed_amount, reason, status, expires_at)
      VALUES 
        (?, 'UPDATE_BUDGET', ?, 5000.00, 4500.00, 'Stale test', 'pending', ?)
    `, [userAId, budgetAId, futureExpiry]);
    const staleProposalId = pRes.insertId;

    // Simulate User updating budget manually to 6000 before approving proposal
    await pool.execute('UPDATE budget_limits SET monthly_limit = 6000.00 WHERE id = ?', [budgetAId]);

    const req = {
      user: { id: userAId },
      params: { proposal_id: staleProposalId }
    };
    const res = mockRes();

    await agentController.approveProposal(req, res);
    assert.equal(res.statusCode, 409, 'Must return 409 Conflict when proposal is stale');
    assert.ok(res.body.detail.includes('stale'), 'Must state that proposal is stale');

    // Verify budget remains 6000 and was not overwritten by stale proposal
    const [bRows] = await pool.execute('SELECT monthly_limit FROM budget_limits WHERE id = ?', [budgetAId]);
    assert.equal(parseFloat(bRows[0].monthly_limit), 6000.00);

    // Revert budget to 5000 for next test
    await pool.execute('UPDATE budget_limits SET monthly_limit = 5000.00 WHERE id = ?', [budgetAId]);
  });

  test('Successful approval updates budget and proposal status atomically and prevents duplicate approval', async () => {
    const req = {
      user: { id: userAId },
      params: { proposal_id: proposalAId }
    };
    const res = mockRes();

    await agentController.approveProposal(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.new_amount, 4000.00);

    // Verify budget updated in database
    const [bRows] = await pool.execute('SELECT monthly_limit FROM budget_limits WHERE id = ?', [budgetAId]);
    assert.equal(parseFloat(bRows[0].monthly_limit), 4000.00);

    // Verify proposal status is 'approved'
    const [pRows] = await pool.execute('SELECT status FROM agent_proposals WHERE id = ?', [proposalAId]);
    assert.equal(pRows[0].status, 'approved');

    // Replay attack / double approval test: attempting to approve again must be rejected
    const replayRes = mockRes();
    await agentController.approveProposal(req, replayRes);
    assert.equal(replayRes.statusCode, 400, 'Must reject double approval');
    assert.ok(replayRes.body.detail.includes('approved'));
  });
});
