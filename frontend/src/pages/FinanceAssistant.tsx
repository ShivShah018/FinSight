import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRates } from '../hooks/useRates';
import { useAssistant } from '../contexts/AssistantContext';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User as UserIcon, 
  ShieldCheck, 
  Layers, 
  Info,
  X,
  Calendar,
  RotateCcw,
  Square,
  Clock
} from 'lucide-react';

import { MarkdownMessage } from '../components/agent/MarkdownMessage';
import { TypewriterText } from '../components/agent/TypewriterText';
import { FinancialMetricsCard } from '../components/agent/FinancialMetricsCard';
import { ProposalCard } from '../components/agent/ProposalCard';
import { AlternativesCard } from '../components/agent/AlternativesCard';
import { ActivityStages } from '../components/agent/ActivityStages';

export interface FinanceAssistantProps {
  isDrawer?: boolean;
  onClose?: () => void;
  initialPrompt?: string;
  initialPeriod?: string;
}

const SUGGESTED_PROMPTS = [
  "How much did I spend in 2026 so far?",
  "How much did I spend on food this month?",
  "Compare my spending this month with last month",
  "Which categories are exceeding their budgets?",
  "Help me reduce my monthly spending by ₹2,000",
  "Detect any unusual transactions"
];

const REPORTING_PERIOD_OPTIONS = [
  { id: 'auto', label: 'Smart Context' },
  { id: 'ytd', label: 'Year to Date (2026)' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'all_time', label: 'All Recorded' }
];

export const FinanceAssistant: React.FC<FinanceAssistantProps> = ({
  isDrawer = false,
  onClose,
  initialPrompt,
  initialPeriod
}) => {
  const { user } = useAuth();
  const { rates } = useRates();
  const cur = user?.currency || 'INR';
  const location = useLocation();
  const navigate = useNavigate();

  const locState = location.state as { prefilledPrompt?: string; period?: string } | null;

  const {
    messages,
    inputMessage,
    setInputMessage,
    selectedPeriod,
    setSelectedPeriod,
    animatingMessageId,
    completedMessageIds,
    interruptedMessageIds,
    lastFailedPrompt,
    handleMessageComplete,
    handleMessageStop,
    handleGlobalStop,
    handleSendMessage,
    chatMutation,
    proposalsList,
    showProposalsDrawer,
    setShowProposalsDrawer,
    actionInProgressId,
    approveMutation,
    rejectMutation,
    handleDeclineAlternatives,
    clearConversation,
    closeDrawer,
    getRevealedLength,
    handleMessageProgress,
  } = useAssistant();

  const [isUserScrolledUp, setIsUserScrolledUp] = useState<boolean>(false);

  // Sync initialPrompt/initialPeriod if provided as props or route location state
  useEffect(() => {
    if (initialPrompt) {
      setInputMessage(initialPrompt);
    } else if (locState?.prefilledPrompt) {
      setInputMessage(locState.prefilledPrompt);
    }
  }, [initialPrompt, locState?.prefilledPrompt, setInputMessage]);

  useEffect(() => {
    if (initialPeriod) {
      setSelectedPeriod(initialPeriod);
    } else if (locState?.period) {
      setSelectedPeriod(locState.period);
    }
  }, [initialPeriod, locState?.period, setSelectedPeriod]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setIsUserScrolledUp(!isAtBottom);
  };

  const scrollToBottom = useCallback((force = false) => {
    if (force || !isUserScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isUserScrolledUp]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, animatingMessageId, scrollToBottom]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const pendingProposalsCount = proposalsList?.filter(p => p.status === 'pending').length || 0;
  const isGeneratingOrTyping = chatMutation.isPending || animatingMessageId !== null;

  const assistantContent = (
    <div className={`flex flex-col ${isDrawer ? 'h-full p-4 space-y-3' : 'h-[calc(100vh-2rem)] max-w-6xl mx-auto space-y-4 pb-2'}`}>
      {/* Top Header - Product-oriented Branding */}
      <header className={`flex flex-wrap items-center justify-between gap-3 ${isDrawer ? 'p-3.5' : 'p-5'} rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-md`}>
        <div className="flex items-center gap-3">
          <div className={`${isDrawer ? 'w-9 h-9' : 'w-11 h-11'} rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-600/30 shrink-0`}>
            <Sparkles className={`${isDrawer ? 'w-4 h-4' : 'w-6 h-6'} text-white`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`${isDrawer ? 'text-base font-bold' : 'text-xl font-bold'} text-white tracking-tight`}>AI Finance Assistant</h1>
              <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Financial Intelligence
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isDrawer ? 'Contextual insight explanation & budget planning' : 'Personalized financial insights and budget planning'}
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {!isDrawer && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-xs text-slate-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Human-in-the-Loop Safe</span>
            </div>
          )}

          {isDrawer && (
            <button
              type="button"
              onClick={() => {
                onClose?.();
                closeDrawer();
                navigate('/assistant');
              }}
              title="Open full page"
              className="text-xs font-semibold text-purple-300 hover:text-white px-2.5 py-1.5 rounded-xl bg-purple-600/15 hover:bg-purple-600/30 border border-purple-500/30 transition-all cursor-pointer"
            >
              Full Page
            </button>
          )}

          {messages.length > 1 && (
            <button
              type="button"
              onClick={clearConversation}
              title="Start new conversation"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-slate-700/50 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          )}

          <button
            onClick={() => setShowProposalsDrawer(!showProposalsDrawer)}
            aria-label="View action proposals"
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-semibold bg-purple-600/15 hover:bg-purple-600/25 text-purple-300 border border-purple-500/30 transition-all duration-200 cursor-pointer"
          >
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">Proposals</span>
            {pendingProposalsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500 text-white animate-pulse">
                {pendingProposalsCount}
              </span>
            )}
          </button>

          {isDrawer && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assistant drawer"
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Main Container: Chat + Proposals Drawer */}
      <div className="flex-1 flex gap-4 min-h-0 relative">
        {/* Chat Section */}
        <div className="flex-1 flex flex-col rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-lg">
          
          {/* Reporting Period Selector Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-800/80 bg-slate-950/40 text-xs">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Calendar className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-medium text-[11px] text-slate-300">Reporting Range:</span>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              {REPORTING_PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setSelectedPeriod(opt.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                    selectedPeriod === opt.id
                      ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto w-full'
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white shadow-purple-600/20'
                      : 'bg-slate-800 text-purple-400 border border-purple-500/20'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <UserIcon className="w-5 h-5" />
                  ) : (
                    <Bot className="w-5 h-5" />
                  )}
                </div>

                {/* Message Body */}
                <div className={`flex flex-col space-y-2 ${msg.role === 'user' ? 'max-w-[85%]' : 'max-w-2xl w-full'}`}>
                  <div
                    className={`p-4 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-purple-600 text-white rounded-tr-none'
                        : 'bg-slate-800/85 text-slate-200 border border-slate-700/60 rounded-tl-none shadow-md backdrop-blur-sm'
                    }`}
                  >
                    {/* Assistant Message Rendering: Typewriter on newest, Markdown otherwise */}
                    {msg.role === 'assistant' ? (
                      msg.id === animatingMessageId ? (
                        <TypewriterText 
                          content={msg.content} 
                          animate={true} 
                          initialRevealedLength={getRevealedLength(msg.id)}
                          onComplete={() => handleMessageComplete(msg.id)} 
                          onStop={(revealed) => handleMessageStop(msg.id, revealed)}
                          onProgress={(len) => handleMessageProgress(msg.id, len)}
                          onTick={() => scrollToBottom()}
                        />
                      ) : (
                        <div>
                          <MarkdownMessage content={msg.content} />
                          {interruptedMessageIds.has(msg.id) && (
                            <div className="mt-2 text-[11px] text-amber-400/90 italic font-medium flex items-center gap-1.5 border-t border-slate-700/50 pt-1.5">
                              <Square className="w-2.5 h-2.5 fill-current text-amber-400" />
                              <span>Generation stopped by user</span>
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}

                    {/* Compact Visual Financial Metrics Card: Revealed ONLY after message typing completes normally */}
                    {msg.role === 'assistant' && msg.tool_results && completedMessageIds.has(msg.id) && (
                      <FinancialMetricsCard 
                        toolResults={msg.tool_results} 
                        rates={rates} 
                        currency={cur} 
                      />
                    )}
                  </div>

                  {/* Grounded Budget Proposal Card: Revealed ONLY after message typing completes normally */}
                  {msg.proposal && completedMessageIds.has(msg.id) && (
                    <ProposalCard
                      proposal={msg.proposal}
                      rates={rates}
                      currency={cur}
                      isActionLoading={actionInProgressId === msg.proposal.id}
                      onApprove={(id) => approveMutation.mutate(id)}
                      onReject={(id) => rejectMutation.mutate(id)}
                    />
                  )}

                  {/* Safe indicator for interrupted message that has a backend proposal */}
                  {msg.proposal && interruptedMessageIds.has(msg.id) && (
                    <div className="mt-2 p-3 rounded-xl bg-slate-900/90 border border-amber-500/30 text-xs text-slate-300 flex items-center justify-between gap-3 shadow-md">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>
                          Generation was stopped. A pending proposal for <strong>{msg.proposal.category_name}</strong> (₹{msg.proposal.proposed_amount}) was recorded before stopping and remains safe.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowProposalsDrawer(true)}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-all shrink-0 cursor-pointer"
                      >
                        View Proposal
                      </button>
                    </div>
                  )}

                  {/* Intelligent Alternatives Card: Revealed ONLY after acknowledgement typing completes */}
                  {msg.alternatives_data && completedMessageIds.has(msg.id) && (
                    <AlternativesCard
                      data={msg.alternatives_data}
                      onSelectAlternative={(prompt) => handleSendMessage(prompt)}
                      onDismiss={() => handleDeclineAlternatives(msg.id)}
                      isLoading={chatMutation.isPending}
                    />
                  )}

                  {/* Retry action for failed requests */}
                  {msg.id.startsWith('err_') && lastFailedPrompt && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleSendMessage(lastFailedPrompt)}
                        disabled={chatMutation.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Retry Question</span>
                      </button>
                    </div>
                  )}

                  {/* Timestamp */}
                  <span
                    className={`text-[10px] text-slate-500 ${
                      msg.role === 'user' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            ))}

            {/* AI Dynamic Activity Stages */}
            {chatMutation.isPending && (
              <ActivityStages isLoading={true} />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Suggestions */}
          <div className="px-4 py-2.5 border-t border-slate-800/80 bg-slate-900/40">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" /> Suggested Inquiries:
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto no-scrollbar">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  disabled={chatMutation.isPending}
                  onClick={() => handleSendMessage(prompt)}
                  className="px-3 py-1 text-xs rounded-xl bg-slate-800/90 hover:bg-purple-900/30 text-slate-300 hover:text-purple-200 border border-slate-700/60 hover:border-purple-500/30 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed text-left cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Input Bar */}
          <div className="p-4 bg-slate-900/90 border-t border-slate-800">
            <div className="flex items-center gap-3">
              <input
                type="text"
                data-testid="assistant-input"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about 2026 spending, category breakdown, budget utilization..."
                disabled={chatMutation.isPending}
                className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all duration-200"
              />
              {isGeneratingOrTyping ? (
                <button
                  type="button"
                  data-testid="agent-stop-button"
                  onClick={handleGlobalStop}
                  aria-label="Stop generating"
                  className="px-4 py-3 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition-all duration-200 cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                  title="Stop generating"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="agent-send-button"
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim()}
                  aria-label="Send message"
                  className="p-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl shadow-lg shadow-purple-600/30 transition-all duration-200 cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Proposals Slide-Out Drawer / Column */}
        {showProposalsDrawer && (
          <aside 
            aria-label="Budget Proposals Drawer"
            className="w-80 md:w-96 rounded-2xl bg-slate-900/95 border border-slate-800 p-4 flex flex-col shadow-2xl overflow-hidden shrink-0 animate-in slide-in-from-right duration-200"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-white text-sm">Action Proposals</h3>
              </div>
              <button
                onClick={() => setShowProposalsDrawer(false)}
                aria-label="Close proposals drawer"
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {proposalsList && proposalsList.length > 0 ? (
                proposalsList.map((prop) => (
                  <ProposalCard
                    key={prop.id}
                    proposal={prop}
                    rates={rates}
                    currency={cur}
                    isActionLoading={actionInProgressId === prop.id}
                    onApprove={(id) => approveMutation.mutate(id)}
                    onReject={(id) => rejectMutation.mutate(id)}
                  />
                ))
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs">
                  <Info className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>No budget proposals yet.</p>
                  <p className="mt-1 text-slate-600">
                    Ask the assistant to help reduce spending or revise a budget.
                  </p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );

  if (isDrawer) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
        {/* Backdrop */}
        <div 
          onClick={onClose} 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity cursor-pointer"
          aria-hidden="true" 
        />
        {/* Slide-over Panel */}
        <div className="relative z-10 w-full sm:w-[540px] md:w-[620px] lg:w-[680px] h-full shadow-2xl border-l border-slate-800 flex flex-col bg-slate-950">
          {assistantContent}
        </div>
      </div>
    );
  }

  return assistantContent;
};
