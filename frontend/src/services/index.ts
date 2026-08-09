import { apiClient } from '../api/apiClient';
import type { 
  Transaction, 
  Category, 
  Goal, 
  BudgetUtilization, 
  DashboardSummary, 
  SpendingPrediction, 
  SpendingCluster 
} from '../types';

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
    const params: any = { limit };
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
    const params: any = {};
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
    const params: any = {};
    if (month) params.month = month;
    if (year) params.year = year;
    const res = await apiClient.get<any>('/budgets/utilization', { params });
    if (res.data && !Array.isArray(res.data)) {
      return Object.values(res.data).map((item: any) => ({
        id: item.id,
        category_id: item.category_id,
        category_name: item.category_name,
        monthly_limit: item.limit,
        spent: item.spent,
        pct: item.percentage,
      })) as BudgetUtilization[];
    }
    return res.data as BudgetUtilization[];
  },

};

export const AnalyticsService = {
  getDashboard: async (month?: number, year?: number) => {
    const params: any = {};
    if (month) params.month = month;
    if (year) params.year = year;
    const res = await apiClient.get<any>('/dashboard', { params });
    const data = res.data;
    if (data) {
      if (data.budget_utilization && !Array.isArray(data.budget_utilization)) {
        data.budget_utilization = Object.values(data.budget_utilization).map((item: any) => ({
          category_id: item.id,
          category_name: item.category_name,
          monthly_limit: item.limit,
          spent: item.spent,
          pct: item.percentage,
        }));
      }
      if (data.top_categories) {
        data.top_categories = data.top_categories.map((cat: any) => ({
          category_name: cat.name,
          amount: cat.total,
          pct: cat.percentage,
        }));
      }
      if (data.largest_expenses) {
        data.recent_transactions = data.largest_expenses.map((tx: any) => ({
          id: tx.id,
          category_name: tx.category_name,
          amount: tx.amount,
          type: tx.type || 'expense',
          description: tx.description || tx.category_name,
          transaction_date: tx.transaction_date,
        }));
      }
    }
    return data as DashboardSummary;
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
    const res = await apiClient.get<any>('/insights/predict');
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
    const params: any = {};
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
