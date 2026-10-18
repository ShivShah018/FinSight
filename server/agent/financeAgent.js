const { StateGraph, Annotation, START, END } = require('@langchain/langgraph');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { SystemMessage, HumanMessage, AIMessage, ToolMessage } = require('@langchain/core/messages');
const { createFinanceTools } = require('./financeTools');
const { pool: defaultPool } = require('../db');

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const MAX_ITERATIONS = parseInt(process.env.AGENT_MAX_ITERATIONS || '2', 10);

/**
 * Safely extracts plain text content from model responses,
 * preventing stringified JSON arrays of text parts from leaking.
 */
function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && part.type === 'text') return part.text;
        if (part && part.text) return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * Deterministically formats verified tool results into structured markdown.
 * Used when database evidence is sufficient and avoids redundant model calls or formatting failures.
 */
function formatDeterministicResponse(userQuery, toolResults) {
  const parts = [];

  if (toolResults.get_monthly_spending) {
    const ms = toolResults.get_monthly_spending;
    const label = ms.reporting_period?.label || 'the requested period';

    if (!ms.has_data) {
      parts.push(`For **${label}**, there are **no recorded transactions** in your account (₹0 in income and ₹0 in expenses).`);
    } else {
      parts.push(`For **${label}**, here is your verified financial summary:\n`);
      parts.push(`* **Total Expenses:** ₹${Number(ms.total_expense).toLocaleString('en-IN')}`);
      parts.push(`* **Total Income:** ₹${Number(ms.total_income).toLocaleString('en-IN')}`);
      parts.push(`* **Net Savings:** ₹${Number(ms.net_savings).toLocaleString('en-IN')}`);
      if (ms.savings_rate_pct !== undefined && ms.savings_rate_pct > 0) {
        parts.push(`* **Savings Rate:** ${ms.savings_rate_pct}%`);
      }
      if (ms.expense_count !== undefined) {
        parts.push(`* **Recorded Expense Transactions:** ${ms.expense_count}`);
      }
    }
  }

  if (toolResults.get_category_breakdown) {
    const cb = toolResults.get_category_breakdown;
    if (cb.has_data && cb.categories && cb.categories.length > 0) {
      parts.push(`\n### Spending by Category:\n`);
      parts.push(`| Category | Amount | Share |`);
      parts.push(`| :--- | :--- | :--- |`);
      cb.categories.slice(0, 5).forEach(c => {
        parts.push(`| ${c.icon || '📁'} ${c.category_name} | ₹${Number(c.total_amount).toLocaleString('en-IN')} | ${c.percentage_of_total}% |`);
      });
    }
  }

  if (toolResults.get_budget_status) {
    const bs = toolResults.get_budget_status;
    if (bs.has_budgets && bs.budgets && bs.budgets.length > 0) {
      parts.push(`\n### Budget Utilization:\n`);
      parts.push(`| Category | Monthly Limit | Spent | Remaining | Status |`);
      parts.push(`| :--- | :--- | :--- | :--- | :--- |`);
      bs.budgets.forEach(b => {
        parts.push(`| ${b.icon || '🎬'} ${b.category_name} | ₹${Number(b.monthly_limit).toLocaleString('en-IN')} | ₹${Number(b.spent).toLocaleString('en-IN')} | ₹${Number(b.remaining).toLocaleString('en-IN')} | ${b.status} |`);
      });
    }
  }

  if (toolResults.get_spending_comparison) {
    const comp = toolResults.get_spending_comparison;
    parts.push(`\n### Spending Comparison:\n`);
    parts.push(`* **${comp.current_period?.label || 'Current Period'}:** ₹${Number(comp.current_period?.total_expense || 0).toLocaleString('en-IN')}`);
    parts.push(`* **${comp.previous_period?.label || 'Previous Period'}:** ₹${Number(comp.previous_period?.total_expense || 0).toLocaleString('en-IN')}`);
    const diffSign = (comp.difference || 0) > 0 ? '+' : '';
    parts.push(`* **Difference:** ${diffSign}₹${Number(comp.difference || 0).toLocaleString('en-IN')} (${comp.trend || 'compared'})`);
  }

  if (parts.length === 0) {
    return 'Your financial request was processed, but no specific spending records were found for the selected period.';
  }

  return parts.join('\n');
}

const SYSTEM_PROMPT = `You are FinSight AI, a trusted, highly capable financial assistant embedded in the FinSight personal finance application.
Your goal is to answer user questions about their personal spending, income, categories, and budgets, and assist them with financial planning.

CRITICAL OPERATIONAL RULES:
1. ALWAYS ground your answers in actual numbers returned by the tools.
2. NEVER invent, fabricate, or hallucinate transactions, totals, dates, or budget limits.
3. ALWAYS state the exact reporting period in your answers (e.g., "In January 2026", "For Year to Date 2026 (Jan 1 – Oct 17, 2026)", etc.).
4. DATE INTELLIGENCE:
   - If the user asks about an entire calendar year (e.g. "for 2026", "in 2026", "year to date", "2026 so far"), query the entire year or year-to-date range using period="ytd" or year=2026 without a month filter. Do NOT restrict the query to a single month!
   - If the user asks about "this month", query the current calendar month.
   - If the user asks about "last month", query the previous calendar month.
   - If a specific month has no records, state that clearly for that specific month, but NEVER claim that the entire year has no records without querying the broader period.
   - SPENDING REDUCTION & BUDGET OPTIMIZATION:
     When the user asks for advice on reducing spending, cutting costs, or budget adjustments (e.g. "Help me reduce my monthly spending by ₹2,000"):
     - Always examine overall spending patterns using get_category_breakdown (period="ytd") and check current active budgets using get_budget_status.
     - Propose a concrete, responsible budget reduction target on an active budgeted category (e.g. Entertainment, current limit ₹500, proposed limit ₹300) as an actionable first step toward their overall savings goal.
     - Conclude with the structured proposal line:
       PROPOSAL: {"category_name": "<CategoryName>", "proposed_amount": <number>, "reason": "<explanation>"}
5. BUDGET PROPOSAL SAFETY:
   - When proposing a budget limit adjustment, make it crystal clear that reducing a budget limit is a TARGET CAP to help save, not a guarantee that actual expenses will automatically drop by that exact amount.
   - Distinguish clearly between proposed limit changes and realized/actual savings.
   - Format proposal recommendation in a distinct JSON block at the end if you recommend an update:
     PROPOSAL: {"category_name": "<Category>", "proposed_amount": <number>, "reason": "<explanation>"}
6. All monetary arithmetic must agree with the deterministic figures returned by tools.
7. TOOL EFFICIENCY & STRICT LIMITS:
   - Call ONLY the minimum tools strictly required to answer the query (maximum 2-3 tool calls).
   - NEVER call get_monthly_spending multiple times for individual months when answering a year-level or comparison query. Use period="ytd" or get_spending_comparison.
   - NEVER call the same tool more than once with identical or overlapping parameters.
8. Be polite, concise, professional, and clear. Format numbers with currency symbols (e.g. ₹ or the user's preferred currency) and clean markdown tables or bullet points where appropriate.
`;

// Define the LangGraph State Annotation
const AgentStateAnnotation = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  userId: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
  userQuery: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => ''
  }),
  toolResults: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({})
  }),
  iterationCount: Annotation({
    reducer: (x, y) => y,
    default: () => 0
  }),
  evidenceSufficient: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => false
  }),
  needsMoreData: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => false
  }),
  evaluationNotes: Annotation({
    reducer: (x, y) => (x || []).concat(y || []),
    default: () => []
  }),
  finalResponse: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
  proposedAction: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
  reportingPeriod: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null
  })
});

/**
 * Creates the finance agent LangGraph workflow.
 * @param {object} options
 * @param {object} [options.model] Optional pre-configured chat model (for mocking or testing)
 * @param {object} [options.db] Database pool override
 */
function createFinanceAgentGraph({ model: customModel = null, db = defaultPool } = {}) {
  const toolsFactory = (userId) => createFinanceTools(userId, db);

  // Initialize nodes
  async function planAndCall(state) {
    const { messages, userId, iterationCount } = state;
    const tools = toolsFactory(userId);

    let llm;
    if (customModel) {
      llm = customModel;
    } else {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim() === '') {
        throw new Error('GEMINI_API_KEY is not configured in server environment.');
      }
      llm = new ChatGoogleGenerativeAI({
        apiKey,
        model: DEFAULT_MODEL,
        temperature: 0.2,
        maxRetries: 1
      });
    }

    const boundModel = llm.bindTools ? llm.bindTools(tools) : llm;

    const nonSystemMessages = messages.filter(m => !(m instanceof SystemMessage));
    // If the conversation ends with an AIMessage (e.g. re-planning loop), Gemini requires a user turn before generation
    if (nonSystemMessages.length > 0 && nonSystemMessages[nonSystemMessages.length - 1] instanceof AIMessage) {
      const guidance = state.evaluationNotes && state.evaluationNotes.length > 0
        ? `Please call the appropriate financial tools to gather the necessary data. Notes: ${state.evaluationNotes.join('; ')}`
        : 'Please call the appropriate financial tools to address the user request.';
      nonSystemMessages.push(new HumanMessage(guidance));
    }

    // Ensure system prompt is present at index 0 and no duplicate/misplaced system messages
    const callMessages = [
      new SystemMessage(SYSTEM_PROMPT),
      ...nonSystemMessages
    ];

    const tStart = Date.now();
    let aiMessage;
    try {
      aiMessage = await boundModel.invoke(callMessages);
    } catch (err) {
      const errLower = (err.message || '').toLowerCase();
      const isDailyQuota = errLower.includes('quota exceeded') || errLower.includes('free_tier_requests') || errLower.includes('perday');
      const isTransient = (err.status === 429 && !isDailyQuota) || err.status === 503;
      if (isTransient) {
        console.warn(`[Agent] planAndCall transient error (${err.status || 429}). Retrying once after 1500ms...`);
        await new Promise(r => setTimeout(r, 1500));
        aiMessage = await boundModel.invoke(callMessages);
      } else {
        throw err;
      }
    }
    const duration = Date.now() - tStart;
    const toolCallNames = aiMessage.tool_calls ? aiMessage.tool_calls.map(t => t.name) : [];
    console.log(`[Agent] planAndCall node: duration=${duration}ms, iteration=${iterationCount + 1}, tools_requested=[${toolCallNames.join(', ')}]`);

    return {
      messages: [aiMessage],
      iterationCount: iterationCount + 1
    };
  }

  async function executeTools(state) {
    const { messages, userId, toolResults } = state;
    const latestMessage = messages[messages.length - 1];
    const tools = toolsFactory(userId);
    const toolMap = new Map(tools.map(t => [t.name, t]));

    const toolMessages = [];
    const newResults = { ...toolResults };
    const tStart = Date.now();

    if (latestMessage && latestMessage.tool_calls && latestMessage.tool_calls.length > 0) {
      // 1. Validate that requested tool exists
      const validCalls = latestMessage.tool_calls.filter(call => {
        if (!toolMap.has(call.name)) {
          console.warn(`[Agent] Ignoring unsupported tool call requested by model: ${call.name}`);
          return false;
        }
        return true;
      });

      // 2. Deduplicate identical tool calls by signature (name + args)
      const seen = new Set();
      const deduplicatedCalls = [];
      for (const call of validCalls) {
        const sig = `${call.name}:${JSON.stringify(call.args || {})}`;
        if (!seen.has(sig)) {
          seen.add(sig);
          deduplicatedCalls.push(call);
        } else {
          console.log(`[Agent] Skipping duplicate tool call: ${sig}`);
        }
      }

      // 3. Strict bound: max 3 tools per iteration to prevent token bloat & rate limits
      const callsToExecute = deduplicatedCalls.slice(0, 3);
      if (deduplicatedCalls.length > 3) {
        console.warn(`[Agent] Capped ${deduplicatedCalls.length} requested tool calls to 3.`);
      }

      for (const call of callsToExecute) {
        const toolInstance = toolMap.get(call.name);
        let resultString;
        let parsedResult;

        try {
          resultString = await toolInstance.invoke(call.args);
          try {
            parsedResult = JSON.parse(resultString);
          } catch {
            parsedResult = resultString;
          }
        } catch (err) {
          resultString = JSON.stringify({ error: err.message });
          parsedResult = { error: err.message };
        }

        newResults[call.name] = parsedResult;
        toolMessages.push(
          new ToolMessage({
            name: call.name,
            content: resultString,
            tool_call_id: call.id || `call_${Date.now()}_${call.name}`
          })
        );
      }
    }

    const duration = Date.now() - tStart;
    console.log(`[Agent] executeTools node: duration=${duration}ms, executed=[${Object.keys(newResults).join(', ')}]`);

    return {
      messages: toolMessages,
      toolResults: newResults
    };
  }

  async function evaluateEvidence(state) {
    const tStart = Date.now();
    const { userQuery, toolResults, iterationCount } = state;
    const notes = [];
    let evidenceSufficient = true;
    let needsMoreData = false;

    const queryLower = (userQuery || '').toLowerCase();
    const toolsCalled = Object.keys(toolResults);

    // 1. Check if tool data was returned
    if (toolsCalled.length === 0) {
      // If the query is an informational or greeting query, tool calls might not be required
      const isInformationalOnly = /^(hi|hello|hey|help|who are you|what can you do)/i.test(userQuery.trim());
      if (!isInformationalOnly) {
        notes.push('No financial tools were invoked yet for a financial query.');
        if (iterationCount < MAX_ITERATIONS) {
          needsMoreData = true;
          evidenceSufficient = false;
        }
      }
    }

    // 2. Check empty or zero data
    if (toolResults.get_monthly_spending) {
      const ms = toolResults.get_monthly_spending;
      if (!ms.has_data) {
        notes.push(`No transaction data recorded for month ${ms.month}/${ms.year}.`);
      }
    }

    // 3. Check comparison sufficiency
    if (toolResults.get_spending_comparison) {
      const comp = toolResults.get_spending_comparison;
      if (!comp.has_sufficient_history) {
        notes.push('Insufficient historical records for the previous comparison period. Will advise user of baseline.');
      }
    }

    // 4. Check budget status questions
    if (queryLower.includes('budget') && !toolResults.get_budget_status && iterationCount < MAX_ITERATIONS) {
      notes.push('Budget status requested but get_budget_status has not been called yet.');
      needsMoreData = true;
      evidenceSufficient = false;
    }

    // 5. Check category breakdown questions
    if ((queryLower.includes('category') || queryLower.includes('breakdown') || queryLower.includes('spend on')) && 
        !toolResults.get_category_breakdown && !toolResults.get_monthly_spending && iterationCount < MAX_ITERATIONS) {
      notes.push('Category breakdown query detected without category tool execution.');
      needsMoreData = true;
      evidenceSufficient = false;
    }

    // Stop looping if iteration limit reached
    if (iterationCount >= MAX_ITERATIONS) {
      needsMoreData = false;
      evidenceSufficient = true;
      notes.push(`Reached configured maximum iterations limit (${MAX_ITERATIONS}).`);
    }

    const duration = Date.now() - tStart;
    console.log(`[Agent] evaluateEvidence node: duration=${duration}ms, sufficient=${evidenceSufficient}, needsMoreData=${needsMoreData}`);

    return {
      evidenceSufficient,
      needsMoreData,
      evaluationNotes: notes
    };
  }

  async function generateResponse(state) {
    const tStart = Date.now();
    const { messages, userQuery, toolResults, evaluationNotes, userId } = state;

    let llm;
    if (customModel) {
      llm = customModel;
    } else {
      const apiKey = process.env.GEMINI_API_KEY;
      llm = new ChatGoogleGenerativeAI({
        apiKey,
        model: DEFAULT_MODEL,
        temperature: 0.2,
        maxRetries: 0
      });
    }

    // Retrieve active budget limits for context so proposal matches an existing user budget
    let activeBudgetsDesc = 'None';
    try {
      const [existingBudgets] = await db.execute(`
        SELECT b.id, b.monthly_limit, c.name AS category_name
        FROM budget_limits b
        JOIN categories c ON b.category_id = c.id
        WHERE b.user_id = ?
      `, [userId]);
      if (existingBudgets.length > 0) {
        activeBudgetsDesc = existingBudgets
          .map(b => `${b.category_name} (Current Monthly Limit: ₹${parseFloat(b.monthly_limit)})`)
          .join(', ');
      }
    } catch (bErr) {
      console.warn('[Agent] Could not fetch active budgets for prompt context:', bErr.message);
    }

    // Add evaluation grounding context as part of the single system instruction at index 0
    const combinedSystemPrompt = SYSTEM_PROMPT + '\n\n' +
      `EVALUATION CONTEXT FOR RESPONSE GENERATION:\n` +
      `- Evaluation notes: ${evaluationNotes.join('; ') || 'All required data verified.'}\n` +
      `- Deterministic Tool Results: ${JSON.stringify(toolResults)}\n` +
      `- User's Existing Active Budget Limits: ${activeBudgetsDesc}\n` +
      `Instructions: Answer the user's question clearly. Use only the verified figures above.\n` +
      `If the user is asking to reduce spending, cut costs, or optimize budgets, propose a concrete, realistic reduction target for one of their active budget categories (${activeBudgetsDesc}). ` +
      `Conclude with: PROPOSAL: {"category_name": "<name>", "proposed_amount": <number>, "reason": "<reason>"}`;

    let content = '';
    const lastMessage = messages[messages.length - 1];

    if (lastMessage instanceof AIMessage && (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) && lastMessage.content) {
      // The model already generated a direct response during the planning phase without needing tools
      content = extractTextContent(lastMessage.content);
    } else {
      const generationPrompt = combinedSystemPrompt + '\n\n' +
        'CRITICAL OPERATIONAL INSTRUCTIONS:\n' +
        '1. All required data has already been retrieved from the database above.\n' +
        '2. Do NOT invoke or request any additional tools or function calls.\n' +
        '3. Formulate your final response directly for the user as clear, natural markdown text.\n' +
        '4. Ground your advice solely in the verified figures above. If no transactions exist for the requested period, explain that clearly and honestly.';

      const responseMessages = [
        new SystemMessage(generationPrompt),
        new HumanMessage(userQuery)
      ];

      try {
        const responseMsg = await llm.invoke(responseMessages);
        content = extractTextContent(responseMsg.content);
      } catch (genErr) {
        console.warn(`[Agent] LLM formatting error (${genErr.message}). Checking deterministic fallback.`);
        if (Object.keys(toolResults).length > 0) {
          content = formatDeterministicResponse(userQuery, toolResults);
        } else {
          throw genErr;
        }
      }
    }

    // Parse potential PROPOSAL block
    let proposedAction = null;
    const proposalMatch = content.match(/PROPOSAL:\s*(?:```(?:json)?\s*)?({[\s\S]*?})(?:\s*```)?/i);
    if (proposalMatch) {
      try {
        const rawProposal = JSON.parse(proposalMatch[1]);
        if (rawProposal.category_name && rawProposal.proposed_amount !== undefined) {
          const rawAmountStr = String(rawProposal.proposed_amount).replace(/[^0-9.]/g, '');
          const proposedAmountNum = parseFloat(rawAmountStr);
          const rawCatName = String(rawProposal.category_name).trim().toLowerCase();

          // Check if category has an existing budget limit for this user
          const [catRows] = await db.execute(`
            SELECT b.id AS budget_id, b.category_id, c.name AS category_name, b.monthly_limit
            FROM budget_limits b
            JOIN categories c ON b.category_id = c.id
            WHERE b.user_id = ? AND (
              LOWER(c.name) = ? OR
              LOWER(c.name) LIKE ? OR
              ? LIKE CONCAT('%', LOWER(c.name), '%')
            )
            ORDER BY (LOWER(c.name) = ?) DESC
            LIMIT 1
          `, [userId, rawCatName, `%${rawCatName}%`, rawCatName, rawCatName]);

          if (catRows.length > 0 && !isNaN(proposedAmountNum) && proposedAmountNum > 0) {
            const row = catRows[0];
            const currentLimit = parseFloat(row.monthly_limit);
            proposedAction = {
              target_budget_id: row.budget_id,
              category_id: row.category_id,
              category_name: row.category_name,
              current_amount: currentLimit,
              proposed_amount: Math.round(proposedAmountNum * 100) / 100,
              difference: Math.round((proposedAmountNum - currentLimit) * 100) / 100,
              reason: rawProposal.reason || 'Recommended by FinSight AI to optimize savings.'
            };
          }
        }
      } catch (err) {
        console.warn('Failed to parse proposal block from model output:', err.message);
      }
    }

    // Clean up response text to remove raw PROPOSAL JSON block from user-visible response
    const cleanContent = content.replace(/PROPOSAL:\s*(?:```(?:json)?\s*)?{[\s\S]*?}(?:\s*```)?/gi, '').trim();
    const duration = Date.now() - tStart;
    console.log(`[Agent] generateResponse node: duration=${duration}ms, proposed_action=${proposedAction ? proposedAction.category_name : 'none'}`);

    return {
      finalResponse: {
        message: cleanContent,
        evaluationNotes,
        toolResults
      },
      proposedAction
    };
  }

  // Conditional Routing functions
  function checkAfterPlan(state) {
    const { messages } = state;
    const latestMessage = messages[messages.length - 1];
    if (latestMessage && latestMessage.tool_calls && latestMessage.tool_calls.length > 0) {
      return 'executeTools';
    }
    return 'evaluateEvidence';
  }

  function checkAfterEval(state) {
    const { needsMoreData, iterationCount } = state;
    if (needsMoreData && iterationCount < MAX_ITERATIONS) {
      return 'planAndCall';
    }
    return 'generateResponse';
  }

  // Build the StateGraph
  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode('planAndCall', planAndCall)
    .addNode('executeTools', executeTools)
    .addNode('evaluateEvidence', evaluateEvidence)
    .addNode('generateResponse', generateResponse)
    .addEdge(START, 'planAndCall')
    .addConditionalEdges('planAndCall', checkAfterPlan, {
      executeTools: 'executeTools',
      evaluateEvidence: 'evaluateEvidence'
    })
    .addEdge('executeTools', 'evaluateEvidence')
    .addConditionalEdges('evaluateEvidence', checkAfterEval, {
      planAndCall: 'planAndCall',
      generateResponse: 'generateResponse'
    })
    .addEdge('generateResponse', END);

  return workflow.compile();
}

/**
 * Executes the Finance Agent for a user message.
 */
async function runFinanceAgent({ userId, message, history = [], reportingPeriod = null, model = null, db = defaultPool }) {
  const totalStart = Date.now();
  console.log(`[Agent] runFinanceAgent started for user ${userId}, message: "${(message || '').substring(0, 60)}"`);
  const agentGraph = createFinanceAgentGraph({ model, db });

  // Format initial message history
  const initialMessages = [];
  if (reportingPeriod && reportingPeriod.period) {
    const periodDesc = reportingPeriod.label || reportingPeriod.period;
    initialMessages.push(new SystemMessage(`Active User Reporting Period: ${periodDesc}. Prefer this reporting period when selecting dates for tools.`));
  }

  if (Array.isArray(history)) {
    history.forEach(h => {
      if (h.role === 'user') {
        initialMessages.push(new HumanMessage(h.content));
      } else if (h.role === 'assistant') {
        initialMessages.push(new AIMessage(h.content));
      }
    });
  }
  initialMessages.push(new HumanMessage(message));

  const result = await agentGraph.invoke({
    messages: initialMessages,
    userId,
    userQuery: message,
    reportingPeriod,
    iterationCount: 0
  });

  const totalDuration = Date.now() - totalStart;
  console.log(`[Agent] runFinanceAgent completed in ${totalDuration}ms for user ${userId}`);

  return {
    response: result.finalResponse?.message || '',
    tool_results: result.toolResults || {},
    evaluation_notes: result.finalResponse?.evaluationNotes || [],
    proposed_action: result.proposedAction || null
  };
}

module.exports = {
  createFinanceAgentGraph,
  runFinanceAgent,
  AgentStateAnnotation
};
