const { pool } = require('../db');
const { chatRequestSchema } = require('../agent/agentSchemas');
const { runFinanceAgent } = require('../agent/financeAgent');
const { generateAlternativesForDeclinedProposal } = require('../agent/proposalAlternatives');

const PROPOSAL_EXPIRY_HOURS = parseInt(process.env.AGENT_PROPOSAL_EXPIRY_HOURS || '24', 10);

function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return 'An error occurred while communicating with the AI Assistant.';
  return msg
    .replace(/(key|apiKey|token|secret|password)=[a-zA-Z0-9_\-]+/gi, '$1=***')
    .replace(/AIza[a-zA-Z0-9_\-]{35}/g, 'AIza***')
    .replace(/AQ\.[a-zA-Z0-9_\-]{40,}/g, 'AQ.***');
}

/**
 * Accurately classifies agent and provider errors into structured status codes and user-friendly diagnostics.
 * Distinguishes daily quota exhaustion from transient rate limits, 503 overloads, auth errors, and timeouts.
 */
function classifyAgentApiError(error) {
  const status = error.status || error.statusCode;
  const msg = (error.message || '').toLowerCase();
  const code = error.code || '';
  const errorDetails = error.errorDetails || [];

  // Check for daily quota exhaustion
  const isDailyQuota = 
    msg.includes('generate_content_free_tier_requests') ||
    msg.includes('quota exceeded') ||
    msg.includes('perday') ||
    errorDetails.some(d => 
      d['@type']?.includes('QuotaFailure') && 
      d.violations?.some(v => v.quotaId?.includes('PerDay') || v.quotaMetric?.includes('free_tier_requests'))
    );

  // Extract retry-after if available
  let retryAfterSeconds = null;
  const retryInfo = errorDetails.find(d => d['@type']?.includes('RetryInfo'));
  if (retryInfo && retryInfo.retryDelay) {
    const parsed = parseInt(String(retryInfo.retryDelay).replace('s', ''), 10);
    if (!isNaN(parsed)) retryAfterSeconds = parsed;
  }

  if (isDailyQuota) {
    return {
      httpStatus: 429,
      errorCode: 'QUOTA_EXHAUSTED',
      retryAfterSeconds,
      detail: 'The Gemini API daily free-tier request quota has been reached for this project (limit 20 requests/day for preview models). Please configure a new API key in server/.env or try again after the daily quota resets.'
    };
  }

  if (status === 429 || msg.includes('429') || msg.includes('too many requests') || msg.includes('rate limit')) {
    return {
      httpStatus: 429,
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfterSeconds: retryAfterSeconds && retryAfterSeconds < 3600 ? retryAfterSeconds : 30,
      detail: 'The AI service rate limit was briefly reached (requests per minute). Please wait 30 seconds before sending another message.'
    };
  }

  if (status === 503 || msg.includes('503') || msg.includes('service unavailable') || msg.includes('high demand') || msg.includes('spikes in demand')) {
    return {
      httpStatus: 503,
      errorCode: 'SERVICE_OVERLOADED',
      retryAfterSeconds: 10,
      detail: 'The Gemini AI model is currently experiencing high demand. Please try again in a few moments.'
    };
  }

  if (status === 401 || status === 403 || msg.includes('api_key_invalid') || msg.includes('api key not valid') || msg.includes('permission denied')) {
    return {
      httpStatus: 401,
      errorCode: 'AUTH_ERROR',
      retryAfterSeconds: null,
      detail: 'The Gemini API key is invalid or unauthorized. Please verify GEMINI_API_KEY in your server configuration.'
    };
  }

  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || status === 504 || msg.includes('timeout')) {
    return {
      httpStatus: 504,
      errorCode: 'TIMEOUT',
      retryAfterSeconds: 5,
      detail: 'The AI Assistant took longer than expected to process your request. Please try asking a more specific question.'
    };
  }

  return {
    httpStatus: 500,
    errorCode: 'INTERNAL_ERROR',
    retryAfterSeconds: null,
    detail: sanitizeErrorMessage(error.message)
  };
}

const agentController = {
  /**
   * Handles user chat messages with the agent.
   */
  chat: async (req, res) => {
    try {
      const userId = req.user.id;
      const parseResult = chatRequestSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          detail: 'Invalid request body',
          errors: parseResult.error.format()
        });
      }

      const { message, history, reporting_period } = parseResult.data;

      // Check if Gemini API key is configured
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim() === '') {
        return res.status(503).json({
          detail: 'Gemini API key is not configured. Please set GEMINI_API_KEY in the server environment (.env) to enable the AI Finance Assistant.'
        });
      }

      const reqStart = Date.now();
      console.log(`[HTTP Agent] Chat request started for user_id=${userId}`);

      // Execute bounded agent workflow with date-range intelligence
      const agentResult = await runFinanceAgent({
        userId,
        message,
        history,
        reportingPeriod: reporting_period,
        db: pool
      });

      console.log(`[HTTP Agent] Chat request completed in ${Date.now() - reqStart}ms for user_id=${userId}`);

      let savedProposal = null;

      // If a budget change action was proposed by the agent, persist as 'pending'
      if (agentResult.proposed_action && agentResult.proposed_action.target_budget_id) {
        const action = agentResult.proposed_action;
        const expiresAt = new Date(Date.now() + PROPOSAL_EXPIRY_HOURS * 60 * 60 * 1000);

        // Verify that target budget still exists and belongs to the user
        const [budgets] = await pool.execute(`
          SELECT b.id, b.category_id, b.monthly_limit, c.name AS category_name
          FROM budget_limits b
          JOIN categories c ON b.category_id = c.id
          WHERE b.id = ? AND b.user_id = ?
        `, [action.target_budget_id, userId]);

        if (budgets.length > 0) {
          const budget = budgets[0];
          const currentLimit = parseFloat(budget.monthly_limit);
          const proposedLimit = parseFloat(action.proposed_amount);

          if (proposedLimit > 0 && proposedLimit !== currentLimit) {
            const [insertRes] = await pool.execute(`
              INSERT INTO agent_proposals 
                (user_id, action_type, target_budget_id, current_amount, proposed_amount, reason, supporting_evidence, status, expires_at)
              VALUES 
                (?, 'UPDATE_BUDGET', ?, ?, ?, ?, ?, 'pending', ?)
            `, [
              userId,
              budget.id,
              currentLimit,
              proposedLimit,
              action.reason || 'FinSight AI budget optimization',
              JSON.stringify({
                tool_results: agentResult.tool_results || {},
                user_query: message,
                reporting_period: reporting_period || null,
                target_reduction: Math.abs(currentLimit - proposedLimit)
              }),
              expiresAt
            ]);

            savedProposal = {
              id: insertRes.insertId,
              target_budget_id: budget.id,
              category_id: budget.category_id,
              category_name: budget.category_name,
              current_amount: currentLimit,
              proposed_amount: proposedLimit,
              difference: Math.round((proposedLimit - currentLimit) * 100) / 100,
              reason: action.reason,
              status: 'pending',
              expires_at: expiresAt.toISOString()
            };
          }
        }
      }

      return res.status(200).json({
        response: agentResult.response,
        proposed_action: savedProposal,
        tool_results: agentResult.tool_results,
        evaluation_notes: agentResult.evaluation_notes
      });
    } catch (error) {
      const classified = classifyAgentApiError(error);
      const sanitizedError = sanitizeErrorMessage(error.message);
      console.warn(`[HTTP Agent] Chat error [${classified.errorCode}]:`, sanitizedError);

      return res.status(classified.httpStatus).json({
        error_code: classified.errorCode,
        retry_after_seconds: classified.retryAfterSeconds,
        detail: classified.detail
      });
    }
  },

  /**
   * Lists proposals for authenticated user.
   */
  listProposals: async (req, res) => {
    try {
      const userId = req.user.id;

      // Automatically mark expired proposals
      await pool.execute(`
        UPDATE agent_proposals
        SET status = 'expired'
        WHERE user_id = ? AND status = 'pending' AND expires_at < NOW()
      `, [userId]);

      const [rows] = await pool.execute(`
        SELECT p.id, p.user_id, p.action_type, p.target_budget_id, p.current_amount,
               p.proposed_amount, p.reason, p.supporting_evidence, p.status,
               p.created_at, p.expires_at, p.updated_at,
               b.category_id, c.name AS category_name, c.icon AS category_icon,
               b.monthly_limit AS live_current_limit
        FROM agent_proposals p
        JOIN budget_limits b ON p.target_budget_id = b.id
        JOIN categories c ON b.category_id = c.id
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC
        LIMIT 50
      `, [userId]);

      const proposals = rows.map(r => {
        const currentAmount = parseFloat(r.current_amount);
        const proposedAmount = parseFloat(r.proposed_amount);
        const liveCurrentLimit = parseFloat(r.live_current_limit);
        const isStale = r.status === 'pending' && currentAmount !== liveCurrentLimit;

        return {
          id: r.id,
          action_type: r.action_type,
          target_budget_id: r.target_budget_id,
          category_id: r.category_id,
          category_name: r.category_name,
          category_icon: r.category_icon,
          current_amount: currentAmount,
          proposed_amount: proposedAmount,
          difference: Math.round((proposedAmount - currentAmount) * 100) / 100,
          reason: r.reason,
          status: r.status,
          is_stale: isStale,
          live_current_limit: liveCurrentLimit,
          created_at: r.created_at,
          expires_at: r.expires_at
        };
      });

      return res.status(200).json(proposals);
    } catch (error) {
      console.error('List proposals error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  /**
   * Retrieves single proposal for authenticated user.
   */
  getProposal: async (req, res) => {
    try {
      const userId = req.user.id;
      const proposalId = parseInt(req.params.proposal_id, 10);

      if (isNaN(proposalId)) {
        return res.status(400).json({ detail: 'Invalid proposal ID' });
      }

      const [rows] = await pool.execute(`
        SELECT p.id, p.user_id, p.action_type, p.target_budget_id, p.current_amount,
               p.proposed_amount, p.reason, p.supporting_evidence, p.status,
               p.created_at, p.expires_at, p.updated_at,
               b.category_id, c.name AS category_name, c.icon AS category_icon,
               b.monthly_limit AS live_current_limit
        FROM agent_proposals p
        JOIN budget_limits b ON p.target_budget_id = b.id
        JOIN categories c ON b.category_id = c.id
        WHERE p.id = ? AND p.user_id = ?
      `, [proposalId, userId]);

      if (rows.length === 0) {
        return res.status(404).json({ detail: 'Proposal not found' });
      }

      const r = rows[0];
      const isExpired = r.status === 'pending' && new Date(r.expires_at) < new Date();
      if (isExpired) {
        await pool.execute('UPDATE agent_proposals SET status = "expired" WHERE id = ?', [proposalId]);
        r.status = 'expired';
      }

      const currentAmount = parseFloat(r.current_amount);
      const proposedAmount = parseFloat(r.proposed_amount);
      const liveCurrentLimit = parseFloat(r.live_current_limit);
      const isStale = r.status === 'pending' && currentAmount !== liveCurrentLimit;

      return res.status(200).json({
        id: r.id,
        action_type: r.action_type,
        target_budget_id: r.target_budget_id,
        category_id: r.category_id,
        category_name: r.category_name,
        category_icon: r.category_icon,
        current_amount: currentAmount,
        proposed_amount: proposedAmount,
        difference: Math.round((proposedAmount - currentAmount) * 100) / 100,
        reason: r.reason,
        status: r.status,
        is_stale: isStale,
        live_current_limit: liveCurrentLimit,
        created_at: r.created_at,
        expires_at: r.expires_at
      });
    } catch (error) {
      console.error('Get proposal error:', error);
      return res.status(500).json({ detail: 'Internal server error' });
    }
  },

  /**
   * Approves a pending budget proposal atomically.
   */
  approveProposal: async (req, res) => {
    let connection;
    try {
      const userId = req.user.id;
      const proposalId = parseInt(req.params.proposal_id, 10);

      if (isNaN(proposalId)) {
        return res.status(400).json({ detail: 'Invalid proposal ID' });
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();

      // 1. Fetch proposal row with lock
      const [proposals] = await connection.execute(`
        SELECT id, user_id, action_type, target_budget_id, current_amount,
               proposed_amount, status, expires_at
        FROM agent_proposals
        WHERE id = ? FOR UPDATE
      `, [proposalId]);

      if (proposals.length === 0) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({ detail: 'Proposal not found' });
      }

      const proposal = proposals[0];

      // 2. Ownership verification
      if (proposal.user_id !== userId) {
        await connection.rollback();
        connection.release();
        return res.status(403).json({ detail: 'Access denied: You do not own this proposal' });
      }

      // 3. Status verification (prevent replay / repeated approval)
      if (proposal.status !== 'pending') {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          detail: `Proposal cannot be approved: current status is '${proposal.status}'`
        });
      }

      // 4. Expiry verification
      const now = new Date();
      if (new Date(proposal.expires_at) < now) {
        await connection.execute(`
          UPDATE agent_proposals SET status = 'expired', updated_at = NOW() WHERE id = ?
        `, [proposalId]);
        await connection.commit();
        connection.release();
        return res.status(400).json({ detail: 'Proposal has expired and can no longer be approved' });
      }

      // 5. Verify target budget exists and belongs to user
      const [budgets] = await connection.execute(`
        SELECT id, user_id, category_id, monthly_limit
        FROM budget_limits
        WHERE id = ? AND user_id = ? FOR UPDATE
      `, [proposal.target_budget_id, userId]);

      if (budgets.length === 0) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({ detail: 'Target budget limit not found or has been deleted' });
      }

      const budget = budgets[0];
      const liveLimit = parseFloat(budget.monthly_limit);
      const snapshotCurrent = parseFloat(proposal.current_amount);
      const proposedLimit = parseFloat(proposal.proposed_amount);

      // 6. Stale proposal protection: Detect if budget has changed since proposal creation
      if (liveLimit !== snapshotCurrent) {
        await connection.rollback();
        connection.release();
        return res.status(409).json({
          detail: `Proposal is stale: The current budget limit is ₹${liveLimit}, but this proposal was based on ₹${snapshotCurrent}. Please ask the assistant for a refreshed proposal.`
        });
      }

      // 7. Validate proposed amount
      if (isNaN(proposedLimit) || proposedLimit <= 0 || proposedLimit > 100000000) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ detail: 'Invalid proposed budget amount' });
      }

      // 8. Atomic execution: Update budget limit and proposal status
      await connection.execute(`
        UPDATE budget_limits
        SET monthly_limit = ?, updated_at = NOW()
        WHERE id = ? AND user_id = ?
      `, [proposedLimit, budget.id, userId]);

      await connection.execute(`
        UPDATE agent_proposals
        SET status = 'approved', updated_at = NOW()
        WHERE id = ? AND status = 'pending'
      `, [proposalId]);

      await connection.commit();
      connection.release();

      return res.status(200).json({
        success: true,
        message: `Budget successfully updated to ₹${proposedLimit}.`,
        proposal_id: proposalId,
        target_budget_id: budget.id,
        previous_amount: snapshotCurrent,
        new_amount: proposedLimit
      });
    } catch (error) {
      if (connection) {
        try { await connection.rollback(); } catch {}
        try { connection.release(); } catch {}
      }
      console.error('Approve proposal error:', error);
      return res.status(500).json({ detail: 'Internal server error during proposal approval' });
    }
  },

  /**
   * Rejects a pending budget proposal without modifying the budget.
   */
  rejectProposal: async (req, res) => {
    try {
      const userId = req.user.id;
      const proposalId = parseInt(req.params.proposal_id, 10);

      if (isNaN(proposalId)) {
        return res.status(400).json({ detail: 'Invalid proposal ID' });
      }

      // 1. Fetch proposal row with category details
      const [proposals] = await pool.execute(`
        SELECT p.id, p.user_id, p.action_type, p.target_budget_id, p.current_amount,
               p.proposed_amount, p.reason, p.supporting_evidence, p.status,
               b.category_id, c.name AS category_name, c.icon AS category_icon
        FROM agent_proposals p
        LEFT JOIN budget_limits b ON p.target_budget_id = b.id
        LEFT JOIN categories c ON b.category_id = c.id
        WHERE p.id = ?
      `, [proposalId]);

      if (proposals.length === 0) {
        return res.status(404).json({ detail: 'Proposal not found' });
      }

      const proposal = proposals[0];

      // 2. Ownership verification
      if (proposal.user_id !== userId) {
        return res.status(403).json({ detail: 'Access denied: You do not own this proposal' });
      }

      // 3. Status checks: cannot reject approved or expired proposals
      if (proposal.status === 'approved') {
        return res.status(400).json({
          detail: `Proposal cannot be rejected: current status is 'approved'`
        });
      }

      if (proposal.status === 'expired') {
        return res.status(400).json({
          detail: `Proposal cannot be rejected: current status is 'expired'`
        });
      }

      const isReplay = proposal.status === 'rejected';

      // 4. Update status to 'rejected' atomically if pending
      if (!isReplay) {
        await pool.execute(`
          UPDATE agent_proposals
          SET status = 'rejected', updated_at = NOW()
          WHERE id = ? AND user_id = ?
        `, [proposalId, userId]);
        proposal.status = 'rejected';
      }

      // 5. Generate intelligent, data-grounded alternatives for the user's financial goal
      const alternativesResult = await generateAlternativesForDeclinedProposal({
        userId,
        proposal,
        db: pool
      });

      return res.status(200).json({
        success: true,
        message: 'Proposal rejected. Budget limits remain unchanged.',
        proposal_id: proposalId,
        status: 'rejected',
        already_declined: isReplay,
        category_name: proposal.category_name,
        current_amount: parseFloat(proposal.current_amount),
        proposed_amount: parseFloat(proposal.proposed_amount),
        acknowledgement: alternativesResult.acknowledgement,
        alternatives_data: alternativesResult,
        assistant_reply: alternativesResult.assistant_content
      });
    } catch (error) {
      console.error('Reject proposal error:', error);
      return res.status(500).json({ detail: 'Internal server error during proposal rejection' });
    }
  },
  classifyAgentApiError
};

module.exports = agentController;
