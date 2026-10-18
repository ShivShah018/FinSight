/**
 * Intelligent alternatives generator for declined budget proposals.
 * Provides data-grounded, privacy-preserving recommendations when a user declines a proposal.
 */

const FIXED_CATEGORIES = new Set([
  'rent',
  'mortgage',
  'utilities',
  'electricity',
  'water',
  'gas',
  'healthcare',
  'medical',
  'health',
  'insurance',
  'education',
  'tuition',
  'loan',
  'emi',
  'taxes',
  'debt'
]);

/**
 * Checks if a category is generally a fixed or essential cost.
 */
function isFixedCategory(categoryName) {
  if (!categoryName) return false;
  const normalized = categoryName.trim().toLowerCase();
  for (const fixed of FIXED_CATEGORIES) {
    if (normalized.includes(fixed)) return true;
  }
  return false;
}

/**
 * Extracts numeric target reduction from user query or proposal reason.
 * E.g. "Help me reduce my monthly spending by ₹2,000" -> 2000
 */
function extractTargetReduction(userQuery, proposalReason, difference) {
  const queryStr = `${userQuery || ''} ${proposalReason || ''}`;
  const match = queryStr.match(/(?:reduce|save|cut|less|lower)(?:[^\d₹]+)?(?:₹|rs\.?|inr)?\s*([\d,]+)/i);
  if (match) {
    const parsed = parseInt(match[1].replace(/,/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 10000000) {
      return parsed;
    }
  }

  if (typeof difference === 'number' && Math.abs(difference) > 0) {
    return Math.abs(difference);
  }

  return 2000; // Default fallback target
}

/**
 * Generates structured, evidence-based alternatives when a user declines a budget proposal.
 *
 * @param {object} params
 * @param {number} params.userId Authenticated user ID
 * @param {object} params.proposal Proposal object from database
 * @param {object} params.db Database connection/pool
 * @returns {Promise<object>} Structured alternatives and natural assistant message
 */
async function generateAlternativesForDeclinedProposal({ userId, proposal, db }) {
  const declinedCategory = proposal.category_name || 'Budget';
  const currentLimit = parseFloat(proposal.current_amount || '0');
  const proposedLimit = parseFloat(proposal.proposed_amount || '0');
  const difference = Math.round((proposedLimit - currentLimit) * 100) / 100;

  // 1. Recover original goal and context safely
  let userQuery = '';
  let reportingPeriod = null;
  if (proposal.supporting_evidence) {
    try {
      const evidence = typeof proposal.supporting_evidence === 'string'
        ? JSON.parse(proposal.supporting_evidence)
        : proposal.supporting_evidence;
      userQuery = evidence.user_query || '';
      reportingPeriod = evidence.reporting_period || null;
    } catch {
      // Legacy or unparseable JSON
    }
  }

  const targetReduction = extractTargetReduction(userQuery, proposal.reason, difference);

  // 2. Query user's actual spending grouped by category (excluding declined category)
  // Strictly user-scoped to prevent data leaks
  const [spendingRows] = await db.execute(`
    SELECT 
      c.id AS category_id,
      c.name AS category_name,
      c.icon AS category_icon,
      COALESCE(SUM(t.amount), 0) AS total_expense,
      COUNT(t.id) AS transaction_count,
      COALESCE(AVG(t.amount), 0) AS avg_transaction_amount
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ?
      AND t.type = 'expense'
      AND t.deleted_at IS NULL
      AND LOWER(c.name) != LOWER(?)
    GROUP BY c.id, c.name, c.icon
    ORDER BY total_expense DESC
  `, [userId, declinedCategory]);

  // 3. Query existing budget limits for context
  const [budgetRows] = await db.execute(`
    SELECT b.id AS budget_id, b.category_id, c.name AS category_name, b.monthly_limit
    FROM budget_limits b
    JOIN categories c ON b.category_id = c.id
    WHERE b.user_id = ?
  `, [userId]);

  const budgetMap = new Map();
  budgetRows.forEach(b => {
    budgetMap.set(b.category_name.toLowerCase(), parseFloat(b.monthly_limit));
  });

  // 4. Distinguish fixed costs from flexible expenses
  const fixedCategories = [];
  const flexibleCategories = [];

  for (const row of spendingRows) {
    const total = parseFloat(row.total_expense);
    if (total <= 0) continue;

    const catInfo = {
      id: row.category_id,
      name: row.category_name,
      icon: row.category_icon || '📁',
      total: total,
      count: parseInt(row.transaction_count, 10),
      avg: Math.round(parseFloat(row.avg_transaction_amount)),
      existingBudget: budgetMap.get(row.category_name.toLowerCase()) || null
    };

    if (isFixedCategory(row.category_name)) {
      fixedCategories.push(catInfo);
    } else {
      flexibleCategories.push(catInfo);
    }
  }

  // 5. Build acknowledgement
  const currentLimitStr = currentLimit > 0 ? `₹${currentLimit.toLocaleString('en-IN')}` : 'current level';
  const acknowledgement = `Understood! I've kept your **${declinedCategory}** budget limit at **${currentLimitStr}** completely unchanged. No financial changes have been made to your account.`;

  // 6. Handle case where insufficient flexible data exists
  if (flexibleCategories.length === 0) {
    const fixedNames = fixedCategories.map(f => f.name).slice(0, 3).join(', ');
    const honestMessage = `${acknowledgement}\n\n` +
      `Looking at your account, your remaining recorded expenses are primarily in essential or fixed categories (${fixedNames || 'Rent and Utilities'}), ` +
      `which cannot easily be adjusted month-to-month. ` +
      `Because of this, I won't recommend artificial budget cuts that might be unrealistic.\n\n` +
      `**Follow-up Question:** Would you like to review recurring subscriptions or explore ways to increase your monthly income targets instead?`;

    return {
      acknowledgement,
      original_goal: {
        target_reduction: targetReduction,
        declined_category: declinedCategory,
        reporting_period: reportingPeriod?.label || 'Monthly'
      },
      has_alternatives: false,
      alternatives: [],
      fixed_costs_note: fixedNames ? `Essential fixed expenses: ${fixedNames}` : null,
      follow_up_question: 'Would you like to review recurring subscriptions or explore ways to increase your monthly income targets instead?',
      assistant_content: honestMessage
    };
  }

  // 7. Formulate 2-3 data-grounded alternatives
  const alternatives = [];

  // Top flexible category (e.g. Food & Dining or Shopping)
  const topFlexible = flexibleCategories[0];
  if (topFlexible) {
    const monthlyEstimate = Math.min(topFlexible.total, Math.round(targetReduction * 0.6));
    const targetPct = Math.min(100, Math.round((monthlyEstimate / targetReduction) * 100));
    const isBudgeted = topFlexible.existingBudget !== null;

    alternatives.push({
      id: `alt_${topFlexible.id}_flexible`,
      title: `Optimize ${topFlexible.name} Spending`,
      category_id: topFlexible.id,
      category_name: topFlexible.name,
      category_icon: topFlexible.icon,
      type: 'flexible_spending',
      is_fixed_cost: false,
      potential_impact: `Up to ₹${monthlyEstimate.toLocaleString('en-IN')}/mo`,
      contribution_pct: targetPct,
      contribution_text: `Covers ~${targetPct}% of your ₹${targetReduction.toLocaleString('en-IN')} goal`,
      explanation: `${topFlexible.name} is your largest variable category (₹${topFlexible.total.toLocaleString('en-IN')} recorded across ${topFlexible.count} transactions). ` +
        `Unlike fixed obligations like Rent, dining and variable purchases can be reduced incrementally without changing your living essentials.`,
      suggested_prompt: isBudgeted
        ? `Help me adjust my ${topFlexible.name} budget to save ₹${monthlyEstimate.toLocaleString('en-IN')}`
        : `Help me create a budget for ${topFlexible.name} to save ₹${monthlyEstimate.toLocaleString('en-IN')}`
    });
  }

  // Second flexible category (e.g. Shopping or Transport)
  const secondFlexible = flexibleCategories[1];
  if (secondFlexible && secondFlexible.total >= 500) {
    const monthlyEstimate = Math.min(secondFlexible.total, Math.round(targetReduction * 0.4));
    const targetPct = Math.min(100, Math.round((monthlyEstimate / targetReduction) * 100));
    const isBudgeted = secondFlexible.existingBudget !== null;

    alternatives.push({
      id: `alt_${secondFlexible.id}_cap`,
      title: `Set a Target Cap on ${secondFlexible.name}`,
      category_id: secondFlexible.id,
      category_name: secondFlexible.name,
      category_icon: secondFlexible.icon,
      type: 'budget_cap',
      is_fixed_cost: false,
      potential_impact: `Up to ₹${monthlyEstimate.toLocaleString('en-IN')}/mo`,
      contribution_pct: targetPct,
      contribution_text: `Covers ~${targetPct}% of your ₹${targetReduction.toLocaleString('en-IN')} goal`,
      explanation: `${secondFlexible.name} accounts for ₹${secondFlexible.total.toLocaleString('en-IN')} across ${secondFlexible.count} transactions (avg ₹${secondFlexible.avg}/transaction). ` +
        `Establishing a spending cap here targets discretionary purchases directly.`,
      suggested_prompt: isBudgeted
        ? `Review my ${secondFlexible.name} spending and suggest a reasonable monthly limit`
        : `Help me set a monthly limit for ${secondFlexible.name}`
    });
  }

  // Recurring / Habit-based alternative
  alternatives.push({
    id: 'alt_recurring_habits',
    title: 'Audit Recurring Charges & Small Discretionary Habits',
    category_name: 'Subscriptions & Habits',
    category_icon: '🔄',
    type: 'recurring_subscription',
    is_fixed_cost: false,
    potential_impact: `₹300 – ₹600/mo`,
    contribution_pct: Math.round((450 / targetReduction) * 100),
    contribution_text: `Covers ~${Math.round((450 / targetReduction) * 100)}% of your ₹${targetReduction.toLocaleString('en-IN')} goal`,
    explanation: `Small frequent expenses and digital subscriptions accumulate quietly. ` +
      `Auditing recurring charges can free up monthly cash flow without noticeable lifestyle disruption.`,
    suggested_prompt: 'Detect any unusual or recurring transactions across all categories'
  });

  // 8. Compose full conversational markdown response
  const fixedNames = fixedCategories.map(f => f.name).slice(0, 3).join(', ');
  const fixedNote = fixedNames 
    ? `*(Note: Essential costs like ${fixedNames} were kept intact as they have little short-term flexibility.)*`
    : '';

  const bulletPoints = alternatives.map(alt => {
    return `* **${alt.title}** (${alt.potential_impact}): ${alt.contribution_text}. ${alt.explanation}`;
  }).join('\n\n');

  const assistantContent = `${acknowledgement}\n\n` +
    `Since your target is to **reduce monthly spending by ₹${targetReduction.toLocaleString('en-IN')}**, here are alternative, data-backed ways to approach this goal based on your actual spending patterns:\n\n` +
    `${bulletPoints}\n\n` +
    `${fixedNote}\n\n` +
    `You can explore any of these options below, request further breakdown, or decline all suggestions without modifying anything.`;

  return {
    acknowledgement,
    original_goal: {
      target_reduction: targetReduction,
      declined_category: declinedCategory,
      reporting_period: reportingPeriod?.label || 'Monthly'
    },
    has_alternatives: true,
    alternatives,
    fixed_costs_note: fixedNames ? `Essential fixed expenses: ${fixedNames}` : null,
    follow_up_question: 'Would you like to explore any of these alternatives, or would you prefer to focus on a different category?',
    assistant_content: assistantContent
  };
}

module.exports = {
  isFixedCategory,
  extractTargetReduction,
  generateAlternativesForDeclinedProposal
};
