const { test, describe } = require('node:test');
const assert = require('node:assert');

describe('Stop Generating & Response Sequencing Test Suite', () => {

  // Simulate pacing algorithm from TypewriterText.tsx
  function calculatePacing(totalChars) {
    const newChunk = totalChars > 1500 ? 5 : totalChars > 800 ? 3 : totalChars > 250 ? 2 : 1;
    const newIntervalMs = 20;
    const newTicks = Math.ceil(totalChars / newChunk);
    const newDurationMs = newTicks * newIntervalMs;
    const newThroughput = (newChunk / newIntervalMs) * 1000;

    return {
      chunk: newChunk,
      intervalMs: newIntervalMs,
      durationMs: newDurationMs,
      throughputCharsPerSec: Math.round(newThroughput)
    };
  }

  test('Natural typewriter pacing maintains comfortable reading rhythm', () => {
    const shortPacing = calculatePacing(200);
    assert.strictEqual(shortPacing.chunk, 1);
    assert.strictEqual(shortPacing.intervalMs, 20);
    assert.strictEqual(shortPacing.throughputCharsPerSec, 50);

    const medPacing = calculatePacing(500);
    assert.strictEqual(medPacing.chunk, 2);
    assert.strictEqual(medPacing.throughputCharsPerSec, 100);

    const longPacing = calculatePacing(1200);
    assert.strictEqual(longPacing.chunk, 3);
    assert.strictEqual(longPacing.throughputCharsPerSec, 150);
  });

  // Comprehensive simulator for FinanceAssistant & Typewriter state transitions
  class FinanceAssistantSimulator {
    constructor() {
      this.messages = [
        { id: 'welcome', role: 'assistant', content: 'Welcome to FinSight AI' }
      ];
      this.animatingMessageId = null;
      this.completedMessageIds = new Set(['welcome']);
      this.interruptedMessageIds = new Set();
      this.activeTimers = new Map();
      this.abortController = null;
      this.isGeneratingHttp = false;
      this.activeRevealedLength = 0;
    }

    startHttpRequest() {
      this.isGeneratingHttp = true;
      this.abortController = { aborted: false };
      return this.abortController;
    }

    cancelHttpRequest() {
      if (this.abortController) {
        this.abortController.aborted = true;
        this.abortController = null;
      }
      this.isGeneratingHttp = false;
    }

    receiveAssistantResponse(id, content, proposal = null, toolResults = null, alternativesData = null) {
      this.isGeneratingHttp = false;
      this.abortController = null;
      const msg = { 
        id, 
        role: 'assistant', 
        content, 
        proposal, 
        tool_results: toolResults, 
        alternatives_data: alternativesData 
      };
      this.messages.push(msg);
      this.animatingMessageId = id;
      this.activeRevealedLength = 0;
      this.activeTimers.set(id, { isRunning: true, revealedLength: 0, totalLength: content.length });
      return msg;
    }

    // Advance typewriter typing by a specific number of characters
    typeChars(id, count) {
      const timer = this.activeTimers.get(id);
      if (!timer || !timer.isRunning) return;
      timer.revealedLength = Math.min(timer.revealedLength + count, timer.totalLength);
      this.activeRevealedLength = timer.revealedLength;
      if (timer.revealedLength >= timer.totalLength) {
        this.finishNaturalTyping(id);
      }
    }

    // User clicks Stop generating
    stop(id) {
      // If HTTP request was pending, abort it
      if (this.isGeneratingHttp) {
        this.cancelHttpRequest();
      }

      // If typewriter was animating, stop timer and freeze revealed text
      if (this.activeTimers.has(id)) {
        const timer = this.activeTimers.get(id);
        timer.isRunning = false;
        const msg = this.messages.find(m => m.id === id);
        if (msg) {
          msg.content = msg.content.slice(0, timer.revealedLength);
        }
      }

      this.interruptedMessageIds.add(id);
      if (this.animatingMessageId === id) {
        this.animatingMessageId = null;
      }
      this.activeRevealedLength = 0;
    }

    finishNaturalTyping(id) {
      if (this.activeTimers.has(id)) {
        const timer = this.activeTimers.get(id);
        timer.isRunning = false;
        timer.revealedLength = timer.totalLength;
      }
      this.completedMessageIds.add(id);
      if (this.animatingMessageId === id) {
        this.animatingMessageId = null;
      }
      this.activeRevealedLength = 0;
    }

    sendNewUserMessage(userText) {
      if (this.isGeneratingHttp) {
        this.cancelHttpRequest();
      }
      if (this.animatingMessageId) {
        this.stop(this.animatingMessageId);
      }
      this.messages.push({ id: `user_${Date.now()}`, role: 'user', content: userText });
    }

    isStopControlVisible() {
      return this.isGeneratingHttp || this.animatingMessageId !== null;
    }

    isCardVisible(msgId, cardType) {
      const msg = this.messages.find(m => m.id === msgId);
      if (!msg) return false;
      const isCompleted = this.completedMessageIds.has(msgId);
      if (!isCompleted) return false;

      if (cardType === 'metrics') return !!msg.tool_results;
      if (cardType === 'proposal') return !!msg.proposal;
      if (cardType === 'alternatives') return !!msg.alternatives_data;
      return false;
    }

    hasInterruptedNotice(msgId) {
      const msg = this.messages.find(m => m.id === msgId);
      return !!(msg && msg.proposal && this.interruptedMessageIds.has(msgId));
    }
  }

  test('Stop immediately halts typing and preserves only the text already revealed (does not reveal the remaining text)', () => {
    const sim = new FinanceAssistantSimulator();
    const fullText = 'For Year to Date 2026, here is your complete financial analysis and proposed spending cap.';
    sim.receiveAssistantResponse('msg_1', fullText);

    assert.strictEqual(sim.animatingMessageId, 'msg_1');
    assert.strictEqual(sim.isStopControlVisible(), true, 'Stop control must be visible while typing');

    // Simulate partial typing: reveal 25 chars out of 91
    sim.typeChars('msg_1', 25);
    assert.strictEqual(sim.activeTimers.get('msg_1').revealedLength, 25);

    // User clicks Stop
    sim.stop('msg_1');

    const msg = sim.messages.find(m => m.id === 'msg_1');
    assert.strictEqual(msg.content.length, 25, 'Text must be frozen at exactly 25 characters');
    assert.strictEqual(msg.content, fullText.slice(0, 25), 'Only the already revealed text must be preserved');
    assert.strictEqual(sim.activeTimers.get('msg_1').isRunning, false, 'Timer must be stopped');
  });

  test('Stop hides its control and allows a new user message immediately', () => {
    const sim = new FinanceAssistantSimulator();
    sim.receiveAssistantResponse('msg_1', 'Analyzing budget utilization...');
    sim.typeChars('msg_1', 10);

    assert.strictEqual(sim.isStopControlVisible(), true);

    // Click Stop
    sim.stop('msg_1');

    assert.strictEqual(sim.isStopControlVisible(), false, 'Stop control must be hidden after stopping');
    assert.strictEqual(sim.animatingMessageId, null, 'animatingMessageId must be reset');

    // User can immediately type and send a new message
    sim.sendNewUserMessage('What about my entertainment budget?');
    const lastMsg = sim.messages[sim.messages.length - 1];
    assert.strictEqual(lastMsg.role === 'user' && lastMsg.content === 'What about my entertainment budget?', true);
  });

  test('Stop does not mark an interrupted response as completed', () => {
    const sim = new FinanceAssistantSimulator();
    sim.receiveAssistantResponse('msg_stopped', 'Synthesizing response for user inquiry...');
    sim.typeChars('msg_stopped', 15);
    sim.stop('msg_stopped');

    assert.strictEqual(sim.interruptedMessageIds.has('msg_stopped'), true, 'Must be marked in interruptedMessageIds');
    assert.strictEqual(sim.completedMessageIds.has('msg_stopped'), false, 'Must NOT be in completedMessageIds');
  });

  test('Stopping does not incorrectly reveal proposal or metrics cards', () => {
    const sim = new FinanceAssistantSimulator();
    const mockProposal = { id: 40, category_name: 'Entertainment', proposed_amount: 300 };
    const mockMetrics = { get_budget_status: { total_budget_limit: 500 } };
    
    sim.receiveAssistantResponse('msg_cards', 'Financial breakdown and recommendation', mockProposal, mockMetrics);
    sim.typeChars('msg_cards', 20);

    // Cards must be hidden while typing
    assert.strictEqual(sim.isCardVisible('msg_cards', 'proposal'), false);
    assert.strictEqual(sim.isCardVisible('msg_cards', 'metrics'), false);

    // User clicks Stop
    sim.stop('msg_cards');

    // Cards MUST REMAIN HIDDEN after stopping early
    assert.strictEqual(sim.isCardVisible('msg_cards', 'proposal'), false, 'Proposal card must NOT be revealed after stop');
    assert.strictEqual(sim.isCardVisible('msg_cards', 'metrics'), false, 'Metrics card must NOT be revealed after stop');

    // But safe notice linking to drawer is visible so proposal is not lost
    assert.strictEqual(sim.hasInterruptedNotice('msg_cards'), true, 'Safe notice linking to proposal drawer must be present');
  });

  test('Cancelling an HTTP request does not create duplicate or misleading messages', () => {
    const sim = new FinanceAssistantSimulator();
    const controller = sim.startHttpRequest();
    assert.strictEqual(sim.isStopControlVisible(), true);
    assert.strictEqual(controller.aborted, false);

    // User clicks Stop while request is in-flight
    sim.cancelHttpRequest();

    assert.strictEqual(controller.aborted, true, 'AbortSignal must be triggered');
    assert.strictEqual(sim.isGeneratingHttp, false);
    assert.strictEqual(sim.isStopControlVisible(), false);
    // No assistant error bubbles were added
    assert.strictEqual(sim.messages.filter(m => m.id.startsWith('err_')).length, 0);
  });

  test('A valid pending proposal remains attached to the correct message and is rendered after normal completion', () => {
    const sim = new FinanceAssistantSimulator();
    const mockProposal = {
      id: 125,
      target_budget_id: 40,
      category_name: 'Entertainment',
      current_amount: 500,
      proposed_amount: 300,
      difference: -200,
      status: 'pending'
    };
    sim.receiveAssistantResponse('msg_complete', 'We recommend adjusting your Entertainment budget cap.', mockProposal);

    assert.strictEqual(sim.isCardVisible('msg_complete', 'proposal'), false, 'Card hidden while typing');

    // Natural typing finishes
    sim.typeChars('msg_complete', 100);

    assert.strictEqual(sim.completedMessageIds.has('msg_complete'), true);
    assert.strictEqual(sim.isCardVisible('msg_complete', 'proposal'), true, 'Card rendered upon completion');
    
    const msg = sim.messages.find(m => m.id === 'msg_complete');
    assert.strictEqual(msg.proposal.id, 125);
    assert.strictEqual(msg.proposal.proposed_amount, 300);
    assert.strictEqual(msg.proposal.status, 'pending');
  });

  test('The proposal card appears even when a financial metrics card exists on the same message', () => {
    const sim = new FinanceAssistantSimulator();
    const mockProposal = { id: 126, category_name: 'Entertainment', proposed_amount: 300 };
    const mockToolResults = { get_category_breakdown: { categories: [{ category_name: 'Rent', total_amount: 22000 }] } };

    sim.receiveAssistantResponse('msg_both', 'Explanation with metrics and proposal', mockProposal, mockToolResults);

    // Natural completion
    sim.typeChars('msg_both', 100);

    // Both cards must be visible simultaneously
    assert.strictEqual(sim.isCardVisible('msg_both', 'metrics'), true, 'Metrics card must be visible');
    assert.strictEqual(sim.isCardVisible('msg_both', 'proposal'), true, 'Proposal card must be visible alongside metrics card');
  });

  test('Proposal data survives rerenders and state updates', () => {
    const sim = new FinanceAssistantSimulator();
    const mockProposal = { id: 127, category_name: 'Entertainment', proposed_amount: 300, status: 'pending' };
    sim.receiveAssistantResponse('msg_survive', 'Recommendation text', mockProposal);
    sim.finishNaturalTyping('msg_survive');

    assert.strictEqual(sim.isCardVisible('msg_survive', 'proposal'), true);

    // Simulate state updates (e.g., adding user message, selecting reporting period, rerendering)
    sim.sendNewUserMessage('Can I also save on groceries?');
    sim.receiveAssistantResponse('msg_next', 'Here is the groceries analysis');
    sim.finishNaturalTyping('msg_next');

    // Earlier proposal on msg_survive must still be preserved and visible
    assert.strictEqual(sim.isCardVisible('msg_survive', 'proposal'), true, 'Proposal card must remain visible across rerenders');
    const origMsg = sim.messages.find(m => m.id === 'msg_survive');
    assert.strictEqual(origMsg.proposal.id, 127);
  });

  test('Decline acknowledgement and alternatives retain correct sequencing', () => {
    const sim = new FinanceAssistantSimulator();
    const mockAlternatives = {
      acknowledgement: 'Understood, kept budget unchanged',
      alternatives: [{ id: 'alt_1', title: 'Food & Dining' }]
    };

    // User declines proposal -> Assistant responds with acknowledgement and alternatives
    sim.receiveAssistantResponse('decline_ack', 'Understood! I kept your Entertainment budget unchanged.', null, null, mockAlternatives);

    assert.strictEqual(sim.animatingMessageId, 'decline_ack');
    // Alternatives card must remain hidden while typing acknowledgement!
    assert.strictEqual(sim.isCardVisible('decline_ack', 'alternatives'), false);

    // Acknowledgement completes
    sim.typeChars('decline_ack', 100);

    // Alternatives card is revealed only after acknowledgement completes
    assert.strictEqual(sim.isCardVisible('decline_ack', 'alternatives'), true);
  });

  test('Stopping decline acknowledgement preserves partial text and does not reveal alternatives', () => {
    const sim = new FinanceAssistantSimulator();
    const mockAlternatives = {
      acknowledgement: 'Understood, kept budget unchanged',
      alternatives: [{ id: 'alt_1', title: 'Food & Dining' }]
    };

    sim.receiveAssistantResponse('decline_stop', 'Understood! I kept your Entertainment budget unchanged.', null, null, mockAlternatives);
    sim.typeChars('decline_stop', 15);

    // User stops acknowledgement
    sim.stop('decline_stop');

    assert.strictEqual(sim.isCardVisible('decline_stop', 'alternatives'), false, 'Alternatives must NOT be shown if acknowledgement was stopped early');
    assert.strictEqual(sim.interruptedMessageIds.has('decline_stop'), true);
    assert.strictEqual(sim.messages.find(m => m.id === 'decline_stop').content.length, 15);
  });
});
