import { apiClient } from '../api/apiClient';
import type { 
  Transaction, 
  Category, 
  Goal, 
  BudgetUtilization, 
  DashboardSummary, 
  SpendingPrediction, 
  SpendingCluster,
  AgentProposal,
  AgentChatResponse,
  AlternativesData
} from '../types';

interface RawUtilizationItem {
  id: number;
  category_id?: number;
  category_name: string;
  limit?: number;
  monthly_limit?: number;
  spent: number;
  percentage: number;
}

interface RawCategoryItem {
  name: string;
  total: number;
  percentage: number;
}

interface RawTransactionItem {
  id: number;
  category_id?: number;
  category_name: string;
  amount: number;
  type?: 'income' | 'expense';
  description?: string;
  transaction_date: string;
}

interface RawPredictionResponse {
  predicted_total?: number;
  confidence?: number;
  trend?: string;
}

interface RawDashboardResponse {
  total_income: number;
  total_expense: number;
  net_savings: number;
  savings_rate: number;
  recent_transactions: Transaction[];
  upcoming_bills: Transaction[];
  top_categories: (RawCategoryItem | { category_name: string; amount: number; pct: number })[];
  budget_utilization: Record<string, RawUtilizationItem> | BudgetUtilization[];
  monthly_trends: { month: string; income: number; expense: number }[];
  largest_expenses?: RawTransactionItem[];
}

export const AuthService = {
  forgotPassword: async (email: string) => {
    const res = await apiClient.post<{ message: string }>('/auth/forgot-password', { email });
    return res.data;
  },
  resetPassword: async (token: string, password: string) => {
    const res = await apiClient.post<{ message: string }>('/auth/reset-password', { token, password });
    return res.data;
  },
};

export const TransactionService = {
  getAll: async (month?: number, year?: number, limit = 500) => {
    const params: Record<string, string | number> = { limit };
    if (month) params.month = month;
    if (year) params.year = year;
    const res = await apiClient.get<{ transactions: Transaction[]; total: number }>('/transactions', { params });
    return res.data;
  },

  create: async (data: {
    category_id: number;
    amount: number;
    type: 'income' | 'expense';
    description?: string;
    currency?: string;
    transaction_date: string;
    is_bill?: boolean;
  }) => {
    const res = await apiClient.post('/transactions', data);
    return res.data;
  },

  delete: async (id: number, soft = true) => {
    const res = await apiClient.delete(`/transactions/${id}`, { params: { soft } });
    return res.data;
  },

  update: async (id: number, data: {
    category_id?: number;
    amount?: number;
    type?: 'income' | 'expense';
    description?: string;
    currency?: string;
    transaction_date?: string;
  }) => {
    const res = await apiClient.put(`/transactions/${id}`, data);
    return res.data;
  },

  restore: async (id: number) => {
    const res = await apiClient.post(`/transactions/${id}/restore`);
    return res.data;
  },

  getDeletedRecent: async () => {
    const res = await apiClient.get<Transaction[]>('/transactions/deleted/recent');
    return res.data;
  },
};

export const CategoryService = {
  getAll: async (type?: 'income' | 'expense') => {
    const params: Record<string, string> = {};
    if (type) params.type = type;
    const res = await apiClient.get<Category[]>('/categories', { params });
    return res.data;
  },
};

export const GoalService = {
  getAll: async () => {
    const res = await apiClient.get<Goal[]>('/goals');
    return res.data;
  },

  create: async (data: {
    name: string;
    target_amount: number;
    deadline?: string;
    auto_fund_amount?: number;
    auto_fund_category_id?: number;
  }) => {
    const res = await apiClient.post('/goals', data);
    return res.data;
  },

  fund: async (id: number, amount: number) => {
    const res = await apiClient.post(`/goals/${id}/fund`, { amount });
    return res.data;
  },

  update: async (id: number, data: {
    name?: string;
    target_amount?: number;
    deadline?: string;
  }) => {
    const res = await apiClient.put(`/goals/${id}`, data);
    return res.data;
  },

  complete: async (id: number) => {
    const res = await apiClient.post(`/goals/${id}/complete`);
    return res.data;
  },

  delete: async (id: number) => {
    const res = await apiClient.delete(`/goals/${id}`);
    return res.data;
  },
};

export const BudgetService = {
  setLimit: async (data: { category_id: number; monthly_limit: number }) => {
    const res = await apiClient.post('/budgets', data);
    return res.data;
  },

  updateLimit: async (id: number, monthly_limit: number) => {
    const res = await apiClient.put(`/budgets/${id}`, { monthly_limit });
    return res.data;
  },

  delete: async (id: number) => {
    const res = await apiClient.delete(`/budgets/${id}`);
    return res.data;
  },

  getUtilization: async (month?: number, year?: number) => {
    const params: Record<string, number> = {};
    if (month) params.month = month;
    if (year) params.year = year;
    const res = await apiClient.get<Record<string, RawUtilizationItem> | BudgetUtilization[]>('/budgets/utilization', { params });
    if (res.data && !Array.isArray(res.data)) {
      return (Object.values(res.data) as RawUtilizationItem[]).map((item) => ({
        id: item.id,
        category_id: item.category_id ?? item.id,
        category_name: item.category_name,
        monthly_limit: item.limit ?? item.monthly_limit ?? 0,
        spent: item.spent,
        pct: item.percentage,
      }));
    }
    return res.data as BudgetUtilization[];
  },

};

export const AnalyticsService = {
  getDashboard: async (month?: number, year?: number) => {
    const params: Record<string, number> = {};
    if (month) params.month = month;
    if (year) params.year = year;
    const res = await apiClient.get<RawDashboardResponse>('/dashboard', { params });
    const data = res.data;
    if (data) {
      let finalUtilization: BudgetUtilization[];
      if (Array.isArray(data.budget_utilization)) {
        finalUtilization = data.budget_utilization;
      } else {
        finalUtilization = (Object.values(data.budget_utilization) as RawUtilizationItem[]).map((item) => ({
          id: item.id,
          category_id: item.category_id ?? item.id,
          category_name: item.category_name,
          monthly_limit: item.limit ?? item.monthly_limit ?? 0,
          spent: item.spent,
          pct: item.percentage,
        }));
      }

      let finalTopCategories: { category_name: string; amount: number; pct: number }[] = [];
      if (data.top_categories) {
        finalTopCategories = data.top_categories.map((cat) => {
          if ('category_name' in cat) {
            return cat;
          }
          return {
            category_name: cat.name,
            amount: cat.total,
            pct: cat.percentage,
          };
        });
      }

      let finalRecent = data.recent_transactions;
      if (data.largest_expenses) {
        finalRecent = data.largest_expenses.map((tx: RawTransactionItem) => ({
          id: tx.id,
          category_id: tx.category_id ?? 0,
          category_name: tx.category_name,
          amount: tx.amount,
          type: tx.type || 'expense',
          description: tx.description || tx.category_name,
          transaction_date: tx.transaction_date,
          currency: 'INR' as const,
        }));
      }

      const summary: DashboardSummary = {
        total_income: data.total_income,
        total_expense: data.total_expense,
        net_savings: data.net_savings,
        savings_rate: data.savings_rate,
        recent_transactions: finalRecent,
        upcoming_bills: data.upcoming_bills,
        top_categories: finalTopCategories,
        budget_utilization: finalUtilization,
        monthly_trends: data.monthly_trends,
      };
      return summary;
    }
    return data as unknown as DashboardSummary;
  },

  getTrends: async (months = 12) => {
    const res = await apiClient.get<{ month: string; income: number; expense: number }[]>('/analytics/trends', {
      params: { months },
    });
    return res.data;
  },

};

export const InsightService = {
  predict: async () => {
    const res = await apiClient.get<RawPredictionResponse>('/insights/predict');
    const data = res.data;
    if (data) {
      return {
        next_month_prediction: data.predicted_total || 0,
        confidence_score: data.confidence || 0,
        trend: data.trend === 'rising' ? 'up' : data.trend === 'falling' ? 'down' : 'stable',
        message: data.trend === 'insufficient_data' 
          ? 'Not enough historical data for a forecast.' 
          : `Your spending is expected to ${data.trend === 'rising' ? 'increase' : data.trend === 'falling' ? 'decrease' : 'remain stable'} next month.`,
      } as SpendingPrediction;
    }
    return data;
  },

  suggestCategory: async (description: string) => {
    const res = await apiClient.get<{ category: string | null; category_id: number | null; score: number }>('/insights/suggest-category', {
      params: { description },
    });
    return res.data;
  },

  getClusters: async () => {
    const res = await apiClient.get<SpendingCluster[]>('/insights/cluster');
    return res.data;
  },

};

export const ReportService = {
  generate: async (emailTo?: string) => {
    const params: Record<string, string> = {};
    if (emailTo) params.email_to = emailTo;
    const res = await apiClient.post<{ path: string; message: string }>('/report/generate', {}, { params });
    return res.data;
  },
  downloadPdf: async () => {
    const res = await apiClient.post('/report/generate', {}, {
      params: { download: 'true' },
      responseType: 'blob'
    });
    return res.data;
  }
};

export const AgentService = {
  chat: async (
    message: string, 
    history: { role: 'user' | 'assistant'; content: string }[] = [],
    reportingPeriod?: string | { period: string; year?: number; month?: number; start_date?: string; end_date?: string; label?: string },
    signal?: AbortSignal
  ) => {
    const res = await apiClient.post<AgentChatResponse>('/agent/chat', { 
      message, 
      history,
      reporting_period: typeof reportingPeriod === 'string' ? { period: reportingPeriod } : reportingPeriod 
    }, {
      timeout: 45000,
      signal
    });
    return res.data;
  },

  getProposals: async () => {
    const res = await apiClient.get<AgentProposal[]>('/agent/proposals');
    return res.data;
  },

  getProposal: async (id: number) => {
    const res = await apiClient.get<AgentProposal>(`/agent/proposals/${id}`);
    return res.data;
  },

  approveProposal: async (id: number) => {
    const res = await apiClient.post<{
      success: boolean;
      message: string;
      proposal_id: number;
      target_budget_id: number;
      previous_amount: number;
      new_amount: number;
    }>(`/agent/proposals/${id}/approve`);
    return res.data;
  },

  rejectProposal: async (id: number) => {
    const res = await apiClient.post<{
      success: boolean;
      message: string;
      proposal_id: number;
      status: string;
      already_declined?: boolean;
      category_name?: string;
      current_amount?: number;
      proposed_amount?: number;
      acknowledgement?: string;
      alternatives_data?: AlternativesData;
      assistant_reply?: string;
    }>(`/agent/proposals/${id}/reject`);
    return res.data;
  }
};

