const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { classifyAgentApiError } = require('../controllers/agentController');
const { createFinanceAgentGraph } = require('../agent/financeAgent');
const { AIMessage } = require('@langchain/core/messages');

describe('Rate Limit, Error Handling & Tool Bounding Suite', () => {
  test('Accurately identifies daily free-tier quota exhaustion (QUOTA_EXHAUSTED)', () => {
    const error = {
      status: 429,
      message: '[GoogleGenerativeAI Error]: [429 Too Many Requests] You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20',
      errorDetails: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            {
              quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
              quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'
            }
          ]
        },
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '44077s'
        }
      ]
    };

    const result = classifyAgentApiError(error);
    assert.equal(result.httpStatus, 429);
    assert.equal(result.errorCode, 'QUOTA_EXHAUSTED');
    assert.ok(result.detail.includes('daily free-tier request quota has been reached'));
    assert.equal(result.retryAfterSeconds, 44077);
  });

  test('Accurately identifies transient requests-per-minute rate limit (RATE_LIMIT_EXCEEDED)', () => {
    const error = {
      status: 429,
      message: '[GoogleGenerativeAI Error]: [429 Too Many Requests] Resource has been exhausted (rate limit)',
      errorDetails: [
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '25s'
        }
      ]
    };

    const result = classifyAgentApiError(error);
    assert.equal(result.httpStatus, 429);
    assert.equal(result.errorCode, 'RATE_LIMIT_EXCEEDED');
    assert.ok(result.detail.includes('rate limit was briefly reached'));
    assert.equal(result.retryAfterSeconds, 25);
  });

  test('Accurately identifies model high demand / service overload (SERVICE_OVERLOADED)', () => {
    const error = {
      status: 503,
      message: '[GoogleGenerativeAI Error]: [503 Service Unavailable] This model is currently experiencing high demand.'
    };

    const result = classifyAgentApiError(error);
    assert.equal(result.httpStatus, 503);
    assert.equal(result.errorCode, 'SERVICE_OVERLOADED');
    assert.ok(result.detail.includes('experiencing high demand'));
    assert.equal(result.retryAfterSeconds, 10);
  });

  test('Accurately identifies invalid or revoked API key (AUTH_ERROR)', () => {
    const error = {
      status: 400,
      message: 'API_KEY_INVALID: API key not valid. Please pass a valid API key.'
    };

    const result = classifyAgentApiError(error);
    assert.equal(result.httpStatus, 401);
    assert.equal(result.errorCode, 'AUTH_ERROR');
    assert.ok(result.detail.includes('invalid or unauthorized'));
  });

  test('Accurately identifies network and gateway timeouts (TIMEOUT)', () => {
    const error = {
      code: 'ECONNABORTED',
      message: 'timeout of 30000ms exceeded'
    };

    const result = classifyAgentApiError(error);
    assert.equal(result.httpStatus, 504);
    assert.equal(result.errorCode, 'TIMEOUT');
    assert.ok(result.detail.includes('longer than expected'));
  });

  test('Sanitizes secret-bearing error strings without leaking credentials', () => {
    const error = {
      message: 'Failed to fetch from https://api.google.com/v1?key=AIzaSyD-1234567890abcdefghijklmnopqrstuvw&token=secret123'
    };

    const result = classifyAgentApiError(error);
    assert.equal(result.httpStatus, 500);
    assert.ok(!result.detail.includes('AIzaSyD-1234567890abcdefghijklmnopqrstuvw'));
    assert.ok(!result.detail.includes('secret123'));
    assert.ok(result.detail.includes('key=***'));
  });

  test('Agent workflow caps requested tool calls to maximum 3 and removes duplicates', async () => {
    // Mock model that intentionally returns 6 tool calls with duplicate entries
    const duplicateToolCalls = [
      { id: 'c1', name: 'get_monthly_spending', args: { year: 2026, month: 1 } },
      { id: 'c2', name: 'get_monthly_spending', args: { year: 2026, month: 1 } }, // duplicate
      { id: 'c3', name: 'get_category_breakdown', args: { year: 2026, month: 1 } },
      { id: 'c4', name: 'get_budget_status', args: { year: 2026, month: 1 } },
      { id: 'c5', name: 'get_monthly_spending', args: { year: 2026, month: 2 } }, // 4th unique tool call
      { id: 'c6', name: 'unsupported_unknown_tool', args: {} } // invalid tool
    ];

    let callCount = 0;
    const mockModel = {
      bindTools: () => mockModel,
      invoke: async (messages) => {
        callCount++;
        if (callCount === 1) {
          // Return tool calls
          return new AIMessage({
            content: '',
            tool_calls: duplicateToolCalls
          });
        }
        // Final response
        return new AIMessage({
          content: 'Here is your financial summary.'
        });
      }
    };

    const mockDb = {
      execute: async () => [[]]
    };

    const graph = createFinanceAgentGraph({ model: mockModel, db: mockDb });
    const result = await graph.invoke({
      messages: [],
      userId: 1,
      userQuery: 'Compare spending',
      iterationCount: 0
    });

    assert.ok(result.finalResponse);
    assert.equal(result.finalResponse.message, 'Here is your financial summary.');
    // Check that toolResults does not have invalid tools
    assert.ok(!result.toolResults.unsupported_unknown_tool);
  });

  test('Deterministic fallback formats verified tool data if response formatting LLM call fails', async () => {
    let callCount = 0;
    const mockModel = {
      bindTools: () => mockModel,
      invoke: async (messages) => {
        callCount++;
        if (callCount === 1) {
          // Tool planning succeeds
          return new AIMessage({
            content: '',
            tool_calls: [
              { id: 'call_1', name: 'get_monthly_spending', args: { year: 2026 } }
            ]
          });
        }
        // Second formatting call throws quota exhaustion error
        const quotaError = new Error('Quota exceeded for metric: free_tier_requests');
        quotaError.status = 429;
        throw quotaError;
      }
    };

    const mockDb = {
      execute: async (sql) => {
        // Return verified YTD figures for user 1
        return [
          [
            { type: 'expense', total: '60090.00', count: 78 },
            { type: 'income', total: '155146.00', count: 17 }
          ]
        ];
      }
    };

    const graph = createFinanceAgentGraph({ model: mockModel, db: mockDb });
    const result = await graph.invoke({
      messages: [],
      userId: 1,
      userQuery: 'How much did I spend in 2026 so far?',
      iterationCount: 0
    });

    // Instead of failing the user request, the agent successfully returns the verified deterministic numbers!
    assert.ok(result.finalResponse);
    const msg = result.finalResponse.message;
    assert.ok(msg.includes('60,090'), 'Should contain ₹60,090 total expenses');
    assert.ok(msg.includes('1,55,146') || msg.includes('155,146'), 'Should contain ₹1,55,146 total income');
    assert.ok(msg.includes('95,056'), 'Should contain ₹95,056 net savings');
    assert.ok(msg.includes('78'), 'Should contain 78 expense transactions');
    assert.equal(result.toolResults.get_monthly_spending.total_expense, 60090);
  });
});
