import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { AgentService } from '../services';
import { useAuth } from './AuthContext';
import type { AgentChatMessage, AgentProposal, User } from '../types';
import toast from 'react-hot-toast';

export interface AssistantContextType {
  messages: AgentChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<AgentChatMessage[]>>;
  inputMessage: string;
  setInputMessage: (msg: string) => void;
  selectedPeriod: string;
  setSelectedPeriod: (period: string) => void;
  animatingMessageId: string | null;
  setAnimatingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  completedMessageIds: Set<string>;
  interruptedMessageIds: Set<string>;
  lastFailedPrompt: string | null;
  setLastFailedPrompt: (prompt: string | null) => void;
  handleMessageComplete: (msgId: string) => void;
  handleMessageStop: (msgId: string, revealedText?: string) => void;
  handleMessageProgress: (msgId: string, len: number) => void;
  getRevealedLength: (msgId: string) => number;
  handleGlobalStop: () => void;
  handleSendMessage: (textToSend?: string) => void;
  chatMutation: {
    isPending: boolean;
    error: unknown;
  };
  proposalsList: AgentProposal[] | undefined;
  refetchProposals: () => void;
  showProposalsDrawer: boolean;
  setShowProposalsDrawer: (show: boolean) => void;
  actionInProgressId: number | null;
  approveMutation: {
    mutate: (proposalId: number) => void;
    isPending: boolean;
  };
  rejectMutation: {
    mutate: (proposalId: number) => void;
    isPending: boolean;
  };
  handleDeclineAlternatives: (msgId: string) => void;
  clearConversation: () => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  openDrawer: (initialPrompt?: string, initialPeriod?: string) => void;
  closeDrawer: () => void;
  activeRevealedLengthRef: React.MutableRefObject<number>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
}

const AssistantContext = createContext<AssistantContextType | undefined>(undefined);

function createMessageId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function formatCurrentTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getWelcomeMessage(userName?: string): AgentChatMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    content: `Hello ${userName || 'there'}! I'm your FinSight AI Finance Assistant.\n\nI provide personalized financial analysis, verify budgets against actual transactions, and help you plan savings. When we identify areas to save, I can propose safe budget adjustments that you can review and approve directly here.`,
    timestamp: 'Just now'
  };
}

const AssistantProviderInner: React.FC<{ children: React.ReactNode; user: User | null }> = ({ children, user }) => {
  const queryClient = useQueryClient();

  const userId = user?.user_id ? String(user.user_id) : (user as { id?: number })?.id ? String((user as { id?: number }).id) : null;
  const storageKey = userId ? `finsight_conversation_${userId}` : null;
  const completedStorageKey = userId ? `finsight_completed_${userId}` : null;
  const interruptedStorageKey = userId ? `finsight_interrupted_${userId}` : null;
  const periodStorageKey = userId ? `finsight_period_${userId}` : null;

  // Initialize messages from sessionStorage scoped to user, or fallback to welcome message
  const [messages, setMessages] = useState<AgentChatMessage[]>(() => {
    if (typeof window !== 'undefined' && storageKey) {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (_err) {
        void _err;
      }
    }
    return [getWelcomeMessage(user?.name)];
  });

  const [inputMessage, setInputMessage] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    if (typeof window !== 'undefined' && periodStorageKey) {
      try {
        const saved = sessionStorage.getItem(periodStorageKey);
        if (saved) return saved;
      } catch (_err) {
        void _err;
      }
    }
    return 'auto';
  });

  const [animatingMessageId, setAnimatingMessageId] = useState<string | null>(null);

  const [completedMessageIds, setCompletedMessageIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined' && completedStorageKey) {
      try {
        const saved = sessionStorage.getItem(completedStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return new Set(parsed);
        }
      } catch (_err) {
        void _err;
      }
    }
    return new Set(['welcome']);
  });

  const [interruptedMessageIds, setInterruptedMessageIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined' && interruptedStorageKey) {
      try {
        const saved = sessionStorage.getItem(interruptedStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return new Set(parsed);
        }
      } catch (_err) {
        void _err;
      }
    }
    return new Set();
  });

  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [showProposalsDrawer, setShowProposalsDrawer] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Active typing length and in-flight request cancellation refs
  const activeRevealedLengthRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const revealedStorageKey = userId ? `finsight_revealed_${userId}` : null;
  const revealedLengthsRef = useRef<Record<string, number>>({});

  // Initialize revealedLengths from sessionStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && revealedStorageKey) {
      try {
        const saved = sessionStorage.getItem(revealedStorageKey);
        if (saved) {
          revealedLengthsRef.current = JSON.parse(saved);
        }
      } catch (_err) {
        void _err;
      }
    }
  }, [revealedStorageKey]);

  // Clean up in-flight requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const persistRevealedLengths = useCallback(() => {
    if (revealedStorageKey && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(revealedStorageKey, JSON.stringify(revealedLengthsRef.current));
      } catch (_err) {
        void _err;
      }
    }
  }, [revealedStorageKey]);

  const handleMessageProgress = useCallback((msgId: string, len: number) => {
    activeRevealedLengthRef.current = len;
    revealedLengthsRef.current[msgId] = len;
    persistRevealedLengths();
  }, [persistRevealedLengths]);

  const getRevealedLength = useCallback((msgId: string): number => {
    return revealedLengthsRef.current[msgId] || 0;
  }, []);

  // Synchronize active messages to scoped sessionStorage
  useEffect(() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(messages));
      } catch (_err) {
        void _err;
      }
    }
  }, [messages, storageKey]);

  // Synchronize completed message IDs to sessionStorage
  useEffect(() => {
    if (completedStorageKey && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(completedStorageKey, JSON.stringify(Array.from(completedMessageIds)));
      } catch (_err) {
        void _err;
      }
    }
  }, [completedMessageIds, completedStorageKey]);

  // Synchronize interrupted message IDs to sessionStorage
  useEffect(() => {
    if (interruptedStorageKey && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(interruptedStorageKey, JSON.stringify(Array.from(interruptedMessageIds)));
      } catch (_err) {
        void _err;
      }
    }
  }, [interruptedMessageIds, interruptedStorageKey]);

  // Synchronize selected period to sessionStorage
  useEffect(() => {
    if (periodStorageKey && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(periodStorageKey, selectedPeriod);
      } catch (_err) {
        void _err;
      }
    }
  }, [selectedPeriod, periodStorageKey]);

  // Query for historical and pending proposals - partitioned by userId
  const { data: proposalsList, refetch: refetchProposals } = useQuery({
    queryKey: ['agent', 'proposals', userId],
    queryFn: () => AgentService.getProposals(),
    enabled: !!userId,
  });

  const handleMessageComplete = useCallback((msgId: string) => {
    setCompletedMessageIds(prev => {
      const next = new Set(prev);
      next.add(msgId);
      return next;
    });
    setAnimatingMessageId(current => (current === msgId ? null : current));
    delete revealedLengthsRef.current[msgId];
    persistRevealedLengths();
    activeRevealedLengthRef.current = 0;
  }, [persistRevealedLengths]);

  const handleMessageStop = useCallback((msgId: string, revealedText?: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id === msgId) {
        const preservedContent = revealedText !== undefined
          ? revealedText
          : (activeRevealedLengthRef.current > 0 ? m.content.slice(0, activeRevealedLengthRef.current) : m.content);
        return {
          ...m,
          content: preservedContent
        };
      }
      return m;
    }));

    setInterruptedMessageIds(prev => {
      const next = new Set(prev);
      next.add(msgId);
      return next;
    });

    setCompletedMessageIds(prev => {
      const next = new Set(prev);
      next.delete(msgId);
      return next;
    });

    setAnimatingMessageId(current => (current === msgId ? null : current));
    delete revealedLengthsRef.current[msgId];
    persistRevealedLengths();
    activeRevealedLengthRef.current = 0;
  }, [persistRevealedLengths]);

  const handleGlobalStop = useCallback(() => {
    // 1. Cancel in-flight HTTP request if active
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 2. Halt typewriter animation if currently typing
    if (animatingMessageId) {
      handleMessageStop(animatingMessageId);
    }
  }, [animatingMessageId, handleMessageStop]);

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (messageText: string) => {
      const history = messages
        .filter(m => m.id !== 'welcome' && !m.id.startsWith('err_'))
        .map(m => ({
          role: m.role,
          content: m.content
        }));

      const periodParam = selectedPeriod !== 'auto' ? selectedPeriod : undefined;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      return await AgentService.chat(messageText, history, periodParam, controller.signal);
    },
    onSuccess: (data) => {
      abortControllerRef.current = null;
      activeRevealedLengthRef.current = 0;
      setLastFailedPrompt(null);
      const newMsgId = createMessageId('ai');
      const assistantMsg: AgentChatMessage = {
        id: newMsgId,
        role: 'assistant',
        content: data.response,
        timestamp: formatCurrentTime(),
        proposal: data.proposed_action || null,
        tool_results: data.tool_results || undefined,
        evaluation_notes: data.evaluation_notes || undefined,
      };

      setMessages(prev => [...prev, assistantMsg]);
      setAnimatingMessageId(newMsgId);

      if (data.proposed_action) {
        queryClient.invalidateQueries({ queryKey: ['agent', 'proposals'] });
        refetchProposals();
        toast.success('FinSight AI created a new budget change proposal for your review!');
      }
    },
    onError: (err: unknown) => {
      const isAbort = 
        axios.isCancel(err) || 
        (err as { name?: string })?.name === 'CanceledError' || 
        (err as { code?: string })?.code === 'ERR_CANCELED' || 
        (err as { name?: string })?.name === 'AbortError' ||
        (err as { message?: string })?.message?.includes('canceled');

      if (isAbort) {
        abortControllerRef.current = null;
        activeRevealedLengthRef.current = 0;
        toast('Generation stopped', { icon: '⏹️', id: 'gen-stopped' });
        return;
      }

      abortControllerRef.current = null;
      activeRevealedLengthRef.current = 0;

      const errorObj = err as {
        response?: {
          status?: number;
          data?: {
            detail?: string;
            code?: string;
            error_code?: string;
            retry_after_seconds?: number;
          };
        };
        message?: string;
        code?: string;
      };

      const backendDetail = errorObj.response?.data?.detail;
      const status = errorObj.response?.status;
      const errorCode = errorObj.response?.data?.code || errorObj.response?.data?.error_code;
      let errMsg = backendDetail || errorObj.message || 'Failed to communicate with Finance Assistant';

      if (!backendDetail) {
        if (status === 429 || errorCode === 'RATE_LIMIT_EXCEEDED' || errorCode === 'QUOTA_EXHAUSTED') {
          errMsg = 'The AI service rate limit was briefly reached. Please wait a moment and try again.';
        } else if (errMsg.includes('timeout of') || errorObj.code === 'ECONNABORTED' || status === 504) {
          errMsg = 'The AI Assistant request timed out while analyzing your data. Please retry or ask a more specific question.';
        } else if (errorCode === 'SERVICE_OVERLOADED') {
          errMsg = 'The AI model is experiencing temporarily high demand. Please try again shortly.';
        }
      }

      toast.error(errMsg);
      const errorMsgId = createMessageId('err');
      const errorMsg: AgentChatMessage = {
        id: errorMsgId,
        role: 'assistant',
        content: `⚠️ **Unable to complete request:** ${errMsg}`,
        timestamp: formatCurrentTime()
      };

      setMessages(prev => [...prev, errorMsg]);
      setCompletedMessageIds(prev => {
        const next = new Set(prev);
        next.add(errorMsgId);
        return next;
      });
      setAnimatingMessageId(null);
    }
  });

  const handleSendMessage = useCallback((textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || chatMutation.isPending) return;

    if (animatingMessageId) {
      handleMessageStop(animatingMessageId);
    }
    setLastFailedPrompt(text);
    const userMsg: AgentChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: text,
      timestamp: formatCurrentTime()
    };

    setMessages(prev => {
      const filtered = textToSend ? prev.filter(m => !m.id.startsWith('err_')) : prev;
      return [...filtered, userMsg];
    });
    setInputMessage('');
    chatMutation.mutate(text);
  }, [inputMessage, chatMutation, animatingMessageId, handleMessageStop]);

  // Mutation for Approving Proposal
  const approveMutation = useMutation({
    mutationFn: async (proposalId: number) => {
      setActionInProgressId(proposalId);
      return await AgentService.approveProposal(proposalId);
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Budget updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['agent', 'proposals'] });
      refetchProposals();

      setMessages(prev => prev.map(m => {
        if (m.proposal && m.proposal.id === data.proposal_id) {
          return {
            ...m,
            proposal: {
              ...m.proposal,
              status: 'approved'
            }
          };
        }
        return m;
      }));
    },
    onError: (err: unknown) => {
      const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = errorObj.response?.data?.detail || errorObj.message || 'Failed to approve proposal';
      toast.error(msg);
      refetchProposals();
    },
    onSettled: () => {
      setActionInProgressId(null);
    }
  });

  // Mutation for Rejecting Proposal
  const rejectMutation = useMutation({
    mutationFn: async (proposalId: number) => {
      setActionInProgressId(proposalId);
      return await AgentService.rejectProposal(proposalId);
    },
    onSuccess: (data) => {
      toast.success('Proposal declined. Budget remains unchanged.');
      queryClient.invalidateQueries({ queryKey: ['agent', 'proposals'] });
      refetchProposals();

      setMessages(prev => {
        const updated = prev.map(m => {
          if (m.proposal && m.proposal.id === data.proposal_id) {
            return {
              ...m,
              proposal: {
                ...m.proposal,
                status: 'rejected' as const
              }
            };
          }
          return m;
        });

        if (data.assistant_reply || data.acknowledgement) {
          const followUpId = createMessageId('alt_followup');
          const followUpMsg: AgentChatMessage = {
            id: followUpId,
            role: 'assistant',
            content: data.assistant_reply || data.acknowledgement || 'Proposal declined. Budget limits remain unchanged.',
            timestamp: formatCurrentTime(),
            alternatives_data: data.alternatives_data || null
          };
          setAnimatingMessageId(followUpId);
          return [...updated, followUpMsg];
        }

        return updated;
      });
    },
    onError: (err: unknown) => {
      const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = errorObj.response?.data?.detail || errorObj.message || 'Failed to decline proposal';
      toast.error(msg);
      refetchProposals();
    },
    onSettled: () => {
      setActionInProgressId(null);
    }
  });

  // Handler for user selecting "No thanks, keep it as it is" on alternatives card
  const handleDeclineAlternatives = useCallback((msgId: string) => {
    // 1. Remove alternatives card from the original message
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, alternatives_data: null } : m));

    // 2. Record user selection in chat
    const userMsgId = createMessageId('user_declined_alt');
    const userMsg: AgentChatMessage = {
      id: userMsgId,
      role: 'user',
      content: 'No thanks, keep it as it is.',
      timestamp: formatCurrentTime()
    };

    // 3. Append assistant confirmation that budget remains unchanged
    const confirmMsgId = createMessageId('ai_confirm_keep');
    const confirmMsg: AgentChatMessage = {
      id: confirmMsgId,
      role: 'assistant',
      content: 'Understood! Your existing category budget limits and financial plans remain completely unchanged. Let me know if there is anything else you would like to analyze or review.',
      timestamp: formatCurrentTime()
    };

    setMessages(prev => [...prev, userMsg, confirmMsg]);
    setCompletedMessageIds(prev => new Set([...prev, userMsgId, confirmMsgId]));
    toast.success('Budget limits kept unchanged.');
  }, []);

  const clearConversation = useCallback(() => {
    const welcome = getWelcomeMessage(user?.name);
    setMessages([welcome]);
    setCompletedMessageIds(new Set(['welcome']));
    setInterruptedMessageIds(new Set());
    setInputMessage('');
    revealedLengthsRef.current = {};
    if (storageKey && typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(storageKey);
        if (completedStorageKey) sessionStorage.removeItem(completedStorageKey);
        if (interruptedStorageKey) sessionStorage.removeItem(interruptedStorageKey);
        if (revealedStorageKey) sessionStorage.removeItem(revealedStorageKey);
      } catch (_err) {
        void _err;
      }
    }
  }, [user?.name, storageKey, completedStorageKey, interruptedStorageKey, revealedStorageKey]);

  const openDrawer = useCallback((initialPrompt?: string, initialPeriod?: string) => {
    if (initialPrompt) {
      setInputMessage(initialPrompt);
    }
    if (initialPeriod) {
      setSelectedPeriod(initialPeriod);
    }
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const value: AssistantContextType = {
    messages,
    setMessages,
    inputMessage,
    setInputMessage,
    selectedPeriod,
    setSelectedPeriod,
    animatingMessageId,
    setAnimatingMessageId,
    completedMessageIds,
    interruptedMessageIds,
    lastFailedPrompt,
    setLastFailedPrompt,
    handleMessageComplete,
    handleMessageStop,
    handleMessageProgress,
    getRevealedLength,
    handleGlobalStop,
    handleSendMessage,
    chatMutation: {
      isPending: chatMutation.isPending,
      error: chatMutation.error
    },
    proposalsList,
    refetchProposals,
    showProposalsDrawer,
    setShowProposalsDrawer,
    actionInProgressId,
    approveMutation: {
      mutate: approveMutation.mutate,
      isPending: approveMutation.isPending
    },
    rejectMutation: {
      mutate: rejectMutation.mutate,
      isPending: rejectMutation.isPending
    },
    handleDeclineAlternatives,
    clearConversation,
    isDrawerOpen,
    setIsDrawerOpen,
    openDrawer,
    closeDrawer,
    activeRevealedLengthRef,
    abortControllerRef
  };

  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  );
};

export const AssistantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.user_id || (user as { id?: number })?.id || 'anonymous';
  return (
    <AssistantProviderInner key={userId} user={user}>
      {children}
    </AssistantProviderInner>
  );
};

export const useAssistant = (): AssistantContextType => {
  const context = useContext(AssistantContext);
  if (!context) {
    throw new Error('useAssistant must be used within an AssistantProvider');
  }
  return context;
};
