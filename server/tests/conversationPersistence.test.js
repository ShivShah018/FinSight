const { test, describe } = require('node:test');
const assert = require('node:assert');

describe('AI Assistant Conversation Persistence & Mode Transition Test Suite', () => {

  // SessionStorage Simulator
  class MockSessionStorage {
    constructor() {
      this.store = new Map();
    }
    getItem(key) {
      return this.store.get(key) || null;
    }
    setItem(key, value) {
      this.store.set(key, String(value));
    }
    removeItem(key) {
      this.store.delete(key);
    }
    clear() {
      this.store.clear();
    }
    get length() {
      return this.store.size;
    }
    key(index) {
      return Array.from(this.store.keys())[index] || null;
    }
  }

  // Simulator representing the shared AssistantContext architecture
  class AssistantContextSimulator {
    constructor(userId, userName, sessionStorage = new MockSessionStorage(), parentSharedState = null) {
      this.userId = String(userId);
      this.userName = userName;
      this.sessionStorage = sessionStorage;

      this.storageKey = `finsight_conversation_${this.userId}`;
      this.completedStorageKey = `finsight_completed_${this.userId}`;
      this.interruptedStorageKey = `finsight_interrupted_${this.userId}`;
      this.periodStorageKey = `finsight_period_${this.userId}`;
      this.revealedStorageKey = `finsight_revealed_${this.userId}`;

      // Initialize from storage or default welcome message
      const savedMessages = this.sessionStorage.getItem(this.storageKey);
      if (savedMessages) {
        this.messages = JSON.parse(savedMessages);
      } else {
        this.messages = [
          {
            id: 'welcome',
            role: 'assistant',
            content: `Hello ${userName}! I'm your FinSight AI Finance Assistant.`,
            timestamp: 'Just now'
          }
        ];
      }

      const savedPeriod = this.sessionStorage.getItem(this.periodStorageKey);
      this.selectedPeriod = savedPeriod || 'auto';

      const savedCompleted = this.sessionStorage.getItem(this.completedStorageKey);
      this.completedMessageIds = savedCompleted ? new Set(JSON.parse(savedCompleted)) : new Set(['welcome']);

      const savedInterrupted = this.sessionStorage.getItem(this.interruptedStorageKey);
      this.interruptedMessageIds = savedInterrupted ? new Set(JSON.parse(savedInterrupted)) : new Set();

      const savedRevealed = this.sessionStorage.getItem(this.revealedStorageKey);
      this.revealedLengths = savedRevealed ? JSON.parse(savedRevealed) : {};

      // If resuming from a shared provider (e.g. route change), inherit in-memory active states
      if (parentSharedState) {
        this.animatingMessageId = parentSharedState.animatingMessageId;
        this.isGeneratingHttp = parentSharedState.isGeneratingHttp;
        this.httpRequestsSent = parentSharedState.httpRequestsSent;
        this.activeAbortController = parentSharedState.activeAbortController;
      } else {
        this.animatingMessageId = null;
        this.isGeneratingHttp = false;
        this.httpRequestsSent = [];
        this.activeAbortController = null;
      }

      this.inputMessage = '';
      this.isDrawerOpen = false;
    }

    _persist() {
      this.sessionStorage.setItem(this.storageKey, JSON.stringify(this.messages));
      this.sessionStorage.setItem(this.completedStorageKey, JSON.stringify(Array.from(this.completedMessageIds)));
      this.sessionStorage.setItem(this.interruptedStorageKey, JSON.stringify(Array.from(this.interruptedMessageIds)));
      this.sessionStorage.setItem(this.periodStorageKey, this.selectedPeriod);
      this.sessionStorage.setItem(this.revealedStorageKey, JSON.stringify(this.revealedLengths));
    }

    openDrawer(initialPrompt, initialPeriod) {
      if (initialPrompt) this.inputMessage = initialPrompt;
      if (initialPeriod) this.selectedPeriod = initialPeriod;
      this.isDrawerOpen = true;
      this._persist();
    }

    closeDrawer() {
      this.isDrawerOpen = false;
    }

    sendMessage(prompt) {
      if (!prompt || this.isGeneratingHttp) return;
      const userMsg = {
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        role: 'user',
        content: prompt,
        timestamp: '10:00 AM'
      };
      this.messages.push(userMsg);
      this.inputMessage = '';
      this.isGeneratingHttp = true;
      this.activeAbortController = { aborted: false };
      this.httpRequestsSent.push({ prompt, period: this.selectedPeriod });
      this._persist();
    }

    receiveResponse(responsePayload) {
      this.isGeneratingHttp = false;
      this.activeAbortController = null;
      const aiMsg = {
        id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        role: 'assistant',
        content: responsePayload.response,
        timestamp: '10:00 AM',
        proposal: responsePayload.proposed_action || null,
        tool_results: responsePayload.tool_results || undefined,
        evaluation_notes: responsePayload.evaluation_notes || undefined,
        alternatives_data: responsePayload.alternatives_data || null
      };
      this.messages.push(aiMsg);
      this.animatingMessageId = aiMsg.id;
      this._persist();
      return aiMsg.id;
    }

    handleMessageProgress(msgId, length) {
      this.revealedLengths[msgId] = length;
      this._persist();
    }

    getRevealedLength(msgId) {
      return this.revealedLengths[msgId] || 0;
    }

    completeAnimation(msgId) {
      this.completedMessageIds.add(msgId);
      if (this.animatingMessageId === msgId) {
        this.animatingMessageId = null;
      }
      this._persist();
    }

    stopAnimation(msgId, revealedText) {
      const msg = this.messages.find(m => m.id === msgId);
      if (msg && revealedText !== undefined) {
        msg.content = revealedText;
      }
      this.interruptedMessageIds.add(msgId);
      this.completedMessageIds.delete(msgId);
      this.animatingMessageId = null;
      if (this.activeAbortController) {
        this.activeAbortController.aborted = true;
      }
      this.isGeneratingHttp = false;
      this._persist();
    }

    transitionToFullPage() {
      // Hardened behavior: Do NOT abruptly complete animation on route navigation.
      // The single shared AssistantContext preserves in-flight request, animation progress, and message order.
      this.closeDrawer();
      return new AssistantContextSimulator(this.userId, this.userName, this.sessionStorage, {
        animatingMessageId: this.animatingMessageId,
        isGeneratingHttp: this.isGeneratingHttp,
        httpRequestsSent: this.httpRequestsSent,
        activeAbortController: this.activeAbortController
      });
    }

    approveProposal(proposalId) {
      const msg = this.messages.find(m => m.proposal && m.proposal.id === proposalId);
      if (msg) {
        msg.proposal.status = 'approved';
        this._persist();
      }
    }

    declineProposal(proposalId, acknowledgementText, alternativesData) {
      const msg = this.messages.find(m => m.proposal && m.proposal.id === proposalId);
      if (msg) {
        msg.proposal.status = 'rejected';
      }
      if (acknowledgementText) {
        const altMsg = {
          id: `alt_${Date.now()}`,
          role: 'assistant',
          content: acknowledgementText,
          timestamp: '10:01 AM',
          alternatives_data: alternativesData || null
        };
        this.messages.push(altMsg);
        this.completedMessageIds.add(altMsg.id);
      }
      this._persist();
    }

    dismissAlternatives(msgId) {
      const msg = this.messages.find(m => m.id === msgId);
      if (msg) {
        msg.alternatives_data = null;
      }
      const userMsg = {
        id: `user_declined_${Date.now()}`,
        role: 'user',
        content: 'No thanks, keep it as it is.',
        timestamp: '10:02 AM'
      };
      const aiMsg = {
        id: `ai_confirm_${Date.now()}`,
        role: 'assistant',
        content: 'Understood! Your existing category budget limits remain completely unchanged.',
        timestamp: '10:02 AM'
      };
      this.messages.push(userMsg, aiMsg);
      this.completedMessageIds.add(userMsg.id);
      this.completedMessageIds.add(aiMsg.id);
      this._persist();
    }

    static logout(sessionStorage) {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && (
          k.startsWith('finsight_conversation_') ||
          k.startsWith('finsight_completed_') ||
          k.startsWith('finsight_interrupted_') ||
          k.startsWith('finsight_period_') ||
          k.startsWith('finsight_revealed_')
        )) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k));
    }
  }

  test('1. Messages and metadata survive the drawer-to-full-page transition', () => {
    const storage = new MockSessionStorage();
    const drawerInstance = new AssistantContextSimulator('1', 'Shivam', storage);

    // Open drawer from Analytics
    drawerInstance.openDrawer('How much did I spend in 2026 so far?', 'ytd');
    assert.strictEqual(drawerInstance.selectedPeriod, 'ytd');
    assert.strictEqual(drawerInstance.inputMessage, 'How much did I spend in 2026 so far?');

    // Send question
    drawerInstance.sendMessage('How much did I spend in 2026 so far?');
    assert.strictEqual(drawerInstance.messages.length, 2); // welcome + user message
    assert.strictEqual(drawerInstance.messages[1].content, 'How much did I spend in 2026 so far?');

    // Receive response with metrics and proposals
    const responsePayload = {
      response: 'You spent ₹14,250 so far in 2026.',
      proposed_action: {
        id: 101,
        category_name: 'Entertainment',
        current_budget: 8000,
        proposed_amount: 6000,
        status: 'pending'
      },
      tool_results: [
        {
          tool: 'get_monthly_spending',
          result: { total_spent: 14250, period: '2026-01-01 to 2026-10-18' }
        }
      ]
    };
    const aiMsgId = drawerInstance.receiveResponse(responsePayload);
    drawerInstance.completeAnimation(aiMsgId);

    assert.strictEqual(drawerInstance.messages.length, 3);
    assert.strictEqual(drawerInstance.messages[2].content, 'You spent ₹14,250 so far in 2026.');
    assert.strictEqual(drawerInstance.messages[2].proposal.id, 101);

    // Transition to Full Page view
    const fullPageInstance = drawerInstance.transitionToFullPage();

    // Verify messages survive in the exact same count and order
    assert.strictEqual(fullPageInstance.messages.length, 3);
    assert.strictEqual(fullPageInstance.messages[0].id, 'welcome');
    assert.strictEqual(fullPageInstance.messages[1].content, 'How much did I spend in 2026 so far?');
    assert.strictEqual(fullPageInstance.messages[2].content, 'You spent ₹14,250 so far in 2026.');

    // Verify metadata preserved
    assert.strictEqual(fullPageInstance.selectedPeriod, 'ytd');
    assert.strictEqual(fullPageInstance.messages[2].proposal.category_name, 'Entertainment');
    assert.strictEqual(fullPageInstance.messages[2].proposal.status, 'pending');
    assert.strictEqual(fullPageInstance.messages[2].tool_results[0].result.total_spent, 14250);
  });

  test('2. Follow-up messages continue seamlessly in full page and persist when reopening drawer', () => {
    const storage = new MockSessionStorage();
    const drawerInstance = new AssistantContextSimulator('1', 'Shivam', storage);

    // Initial drawer interaction
    drawerInstance.openDrawer();
    drawerInstance.sendMessage('How much did I spend on Food?');
    const aiMsgId = drawerInstance.receiveResponse({ response: 'Food spending is ₹4,500.' });
    drawerInstance.completeAnimation(aiMsgId);

    // Switch to Full Page
    const fullPageInstance = drawerInstance.transitionToFullPage();

    // Ask follow up in Full Page
    fullPageInstance.sendMessage('Compare that with last month');
    const followUpId = fullPageInstance.receiveResponse({ response: 'Last month food spending was ₹4,100 (+₹400 increase).' });
    fullPageInstance.completeAnimation(followUpId);

    assert.strictEqual(fullPageInstance.messages.length, 5); // welcome, q1, a1, q2, a2

    // Navigate back to Analytics and reopen drawer
    const reopenedDrawer = new AssistantContextSimulator('1', 'Shivam', storage);
    reopenedDrawer.openDrawer();

    // Assert that the drawer has the latest full conversation with both inquiries
    assert.strictEqual(reopenedDrawer.messages.length, 5);
    assert.strictEqual(reopenedDrawer.messages[3].content, 'Compare that with last month');
    assert.strictEqual(reopenedDrawer.messages[4].content, 'Last month food spending was ₹4,100 (+₹400 increase).');
  });

  test('3. Mode transition does not duplicate requests, resubmit prompts, or duplicate welcome messages', () => {
    const storage = new MockSessionStorage();
    const drawerInstance = new AssistantContextSimulator('1', 'Shivam', storage);

    drawerInstance.sendMessage('Analyze my budgets');
    assert.strictEqual(drawerInstance.httpRequestsSent.length, 1);

    const aiMsgId = drawerInstance.receiveResponse({ response: 'Your budgets are healthy.' });
    drawerInstance.completeAnimation(aiMsgId);

    // Transition to full page
    const fullPageInstance = drawerInstance.transitionToFullPage();

    // Zero additional HTTP requests were triggered by transition
    assert.strictEqual(fullPageInstance.httpRequestsSent.length, 1);

    // No duplicate welcome messages
    const welcomeMessages = fullPageInstance.messages.filter(m => m.id === 'welcome' || m.role === 'assistant' && m.content.includes("Hello"));
    assert.strictEqual(welcomeMessages.length, 1);
  });

  test('4. Issue 3: Navigation during active typewriter animation preserves progress and resumes seamlessly', () => {
    const storage = new MockSessionStorage();
    const drawerInstance = new AssistantContextSimulator('1', 'Shivam', storage);

    drawerInstance.sendMessage('Explain my savings rate in 2026');
    const fullResponse = 'Your savings rate in 2026 is 32.5%, which exceeds your 25% target.';
    const aiMsgId = drawerInstance.receiveResponse({ response: fullResponse });

    // Drawer typewriter types up to character 25
    drawerInstance.handleMessageProgress(aiMsgId, 25);
    assert.strictEqual(drawerInstance.getRevealedLength(aiMsgId), 25);
    assert.strictEqual(drawerInstance.animatingMessageId, aiMsgId);

    // User navigates to Full Page while animation is still running
    const fullPageInstance = drawerInstance.transitionToFullPage();

    // Hardened check: Animation is NOT forcefully completed or reset to 0
    assert.strictEqual(fullPageInstance.animatingMessageId, aiMsgId);
    assert.strictEqual(fullPageInstance.completedMessageIds.has(aiMsgId), false);
    assert.strictEqual(fullPageInstance.getRevealedLength(aiMsgId), 25);

    // Full page continues typing from index 25 up to completion
    fullPageInstance.handleMessageProgress(aiMsgId, fullResponse.length);
    fullPageInstance.completeAnimation(aiMsgId);

    assert.strictEqual(fullPageInstance.completedMessageIds.has(aiMsgId), true);
    assert.strictEqual(fullPageInstance.animatingMessageId, null);
  });

  test('5. Issue 3: Navigation during active in-flight network/API request does not abort or duplicate request', () => {
    const storage = new MockSessionStorage();
    const drawerInstance = new AssistantContextSimulator('1', 'Shivam', storage);

    // User sends prompt in drawer
    drawerInstance.sendMessage('Generate detailed quarterly financial report');
    assert.strictEqual(drawerInstance.isGeneratingHttp, true);
    assert.strictEqual(drawerInstance.httpRequestsSent.length, 1);

    // User navigates to Full Page while server request is still pending
    const fullPageInstance = drawerInstance.transitionToFullPage();

    // Network request remains active in shared provider, not duplicated or restarted
    assert.strictEqual(fullPageInstance.isGeneratingHttp, true);
    assert.strictEqual(fullPageInstance.httpRequestsSent.length, 1);
    assert.strictEqual(fullPageInstance.activeAbortController.aborted, false);

    // Network response arrives in full page view
    const aiMsgId = fullPageInstance.receiveResponse({ response: 'Quarterly report generated.' });
    assert.strictEqual(fullPageInstance.isGeneratingHttp, false);
    assert.strictEqual(fullPageInstance.messages[fullPageInstance.messages.length - 1].content, 'Quarterly report generated.');
  });

  test('6. Issue 3: Navigation during a stopped/interrupted response preserves partial text without restarting', () => {
    const storage = new MockSessionStorage();
    const drawerInstance = new AssistantContextSimulator('1', 'Shivam', storage);

    drawerInstance.sendMessage('Give me a detailed budget breakdown');
    const fullText = 'Here is your breakdown: 1. Food: ₹5000. 2. Rent: ₹15000. 3. Utilities: ₹3000.';
    const aiMsgId = drawerInstance.receiveResponse({ response: fullText });

    // User stops generation halfway in drawer
    const partialText = 'Here is your breakdown: 1. Food: ₹5000.';
    drawerInstance.stopAnimation(aiMsgId, partialText);

    assert.strictEqual(drawerInstance.messages[2].content, partialText);
    assert.strictEqual(drawerInstance.interruptedMessageIds.has(aiMsgId), true);
    assert.strictEqual(drawerInstance.completedMessageIds.has(aiMsgId), false);

    // Switch to full page
    const fullPageInstance = drawerInstance.transitionToFullPage();

    // Interrupted status and partial text are preserved without restarting or overwriting
    assert.strictEqual(fullPageInstance.messages[2].content, partialText);
    assert.strictEqual(fullPageInstance.interruptedMessageIds.has(aiMsgId), true);
    assert.strictEqual(fullPageInstance.animatingMessageId, null);
  });

  test('7. Budget proposal status remains synchronized between drawer and full-page', () => {
    const storage = new MockSessionStorage();
    const drawerInstance = new AssistantContextSimulator('1', 'Shivam', storage);

    drawerInstance.sendMessage('Propose a budget cut');
    const aiMsgId = drawerInstance.receiveResponse({
      response: 'I propose reducing Dining budget by ₹1,500.',
      proposed_action: {
        id: 202,
        category_name: 'Dining Out',
        current_budget: 6000,
        proposed_amount: 4500,
        status: 'pending'
      }
    });
    drawerInstance.completeAnimation(aiMsgId);

    // Transition to Full Page
    const fullPageInstance = drawerInstance.transitionToFullPage();
    assert.strictEqual(fullPageInstance.messages[2].proposal.status, 'pending');

    // User approves proposal in Full Page view
    fullPageInstance.approveProposal(202);
    assert.strictEqual(fullPageInstance.messages[2].proposal.status, 'approved');

    // User returns to drawer in Analytics
    const drawerReopened = new AssistantContextSimulator('1', 'Shivam', storage);
    assert.strictEqual(drawerReopened.messages[2].proposal.status, 'approved');
  });

  test('8. Decline proposal alternatives & keep-as-is state persists across views', () => {
    const storage = new MockSessionStorage();
    const drawerInstance = new AssistantContextSimulator('1', 'Shivam', storage);

    drawerInstance.sendMessage('Help me save ₹2000');
    const aiMsgId = drawerInstance.receiveResponse({
      response: 'I propose adjusting Shopping.',
      proposed_action: {
        id: 303,
        category_name: 'Shopping',
        current_budget: 7000,
        proposed_amount: 5000,
        status: 'pending'
      }
    });
    drawerInstance.completeAnimation(aiMsgId);

    // Decline proposal in drawer
    drawerInstance.declineProposal(
      303,
      'Proposal declined. Here are other flexible categories to consider.',
      { alternatives: [{ category_name: 'Entertainment', potential_savings: 1500 }] }
    );

    // Transition to Full Page
    const fullPageInstance = drawerInstance.transitionToFullPage();
    assert.strictEqual(fullPageInstance.messages[2].proposal.status, 'rejected');
    assert.strictEqual(fullPageInstance.messages[3].alternatives_data.alternatives.length, 1);

    // User clicks "No thanks, keep it as it is" in Full Page
    fullPageInstance.dismissAlternatives(fullPageInstance.messages[3].id);

    // Verify alternatives dismissed and confirmation appended
    assert.strictEqual(fullPageInstance.messages[3].alternatives_data, null);
    assert.strictEqual(fullPageInstance.messages[4].content, 'No thanks, keep it as it is.');
    assert.strictEqual(fullPageInstance.messages[5].content.includes('budget limits remain completely unchanged'), true);

    // Verify state persists in drawer
    const drawerReopened = new AssistantContextSimulator('1', 'Shivam', storage);
    assert.strictEqual(drawerReopened.messages.length, 6);
  });

  test('9. Fresh conversation without prior messages initializes correctly with welcome message', () => {
    const freshStorage = new MockSessionStorage();
    const newSession = new AssistantContextSimulator('99', 'Alex', freshStorage);

    assert.strictEqual(newSession.messages.length, 1);
    assert.strictEqual(newSession.messages[0].id, 'welcome');
    assert.strictEqual(newSession.messages[0].role, 'assistant');
    assert.strictEqual(newSession.messages[0].content.includes('Hello Alex!'), true);
    assert.strictEqual(newSession.selectedPeriod, 'auto');
    assert.strictEqual(newSession.completedMessageIds.has('welcome'), true);
  });

  test('10. Issue 4: Complete user isolation on logout and account switching', () => {
    const sharedStorage = new MockSessionStorage();
    const userA = new AssistantContextSimulator('1001', 'Alice', sharedStorage);
    userA.sendMessage('My confidential salary and expenses');
    const aMsgId = userA.receiveResponse({ response: 'Salary is ₹1,00,000.' });
    userA.handleMessageProgress(aMsgId, 20);
    userA.completeAnimation(aMsgId);

    // Verify User A state exists in sessionStorage
    assert.strictEqual(sharedStorage.getItem('finsight_conversation_1001') !== null, true);
    assert.strictEqual(sharedStorage.getItem('finsight_revealed_1001') !== null, true);

    // User logs out: AuthContext cleans up all conversation keys
    AssistantContextSimulator.logout(sharedStorage);

    // Verify all finsight assistant keys purged
    for (let i = 0; i < sharedStorage.length; i++) {
      const k = sharedStorage.key(i);
      assert.strictEqual(k && k.startsWith('finsight_conversation_'), false);
      assert.strictEqual(k && k.startsWith('finsight_revealed_'), false);
    }

    // User B logs in on same browser
    const userB = new AssistantContextSimulator('1002', 'Bob', sharedStorage);

    // User B must receive a clean fresh welcome message, not Alice's conversation
    assert.strictEqual(userB.messages.length, 1);
    assert.strictEqual(userB.messages[0].id, 'welcome');
    assert.strictEqual(userB.messages[0].content.includes('Bob'), true);
    assert.strictEqual(userB.messages.some(m => m.content.includes('confidential salary')), false);
  });
});
