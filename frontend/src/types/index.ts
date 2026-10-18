export interface User {
  user_id: number;
  name: string;
  email: string;
  currency: string;
}

export interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense';
  icon?: string;
  color?: string;
}

export interface Transaction {
  id: number;
  category_id: number;
  category_name: string;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  transaction_date: string;
  currency: 'INR' | 'USD' | 'NPR';
}

export interface Goal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  status: 'active' | 'completed' | 'cancelled';
  progress_pct: number;
}

export interface BudgetUtilization {
  id: number;
  category_id: number;
  category_name: string;
  monthly_limit: number;
  spent: number;
  pct: number;
}

export interface DashboardSummary {
  total_income: number;
  total_expense: number;
  net_savings: number;
  savings_rate: number;
  recent_transactions: Transaction[];
  upcoming_bills: Transaction[];
  top_categories: { category_name: string; amount: number; pct: number }[];
  budget_utilization: BudgetUtilization[];
  monthly_trends: { month: string; income: number; expense: number }[];
}

export interface SpendingPrediction {
  next_month_prediction: number;
  confidence_score: number;
  trend: 'up' | 'down' | 'stable';
  message: string;
}

export interface SpendingCluster {
  cluster_id: number;
  name: string;
  count: number;
  total_amount: number;
  avg_amount: number;
  categories: string[];
}

export interface AgentProposal {
  id: number;
  action_type: string;
  target_budget_id: number;
  category_id: number;
  category_name: string;
  category_icon?: string;
  current_amount: number;
  proposed_amount: number;
  difference: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  is_stale?: boolean;
  live_current_limit?: number;
  created_at: string;
  expires_at: string;
}

export interface ProposalAlternative {
  id: string;
  title: string;
  category_id?: number;
  category_name?: string;
  category_icon?: string;
  type: 'flexible_spending' | 'budget_cap' | 'recurring_subscription' | 'spending_habit';
  is_fixed_cost: boolean;
  potential_impact: string;
  contribution_pct?: number;
  contribution_text: string;
  explanation: string;
  suggested_prompt: string;
}

export interface AlternativesData {
  acknowledgement: string;
  original_goal: {
    target_reduction: number;
    declined_category: string;
    reporting_period: string;
  };
  has_alternatives: boolean;
  alternatives: ProposalAlternative[];
  fixed_costs_note?: string | null;
  follow_up_question?: string;
  assistant_content: string;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  proposal?: AgentProposal | null;
  tool_results?: Record<string, unknown>;
  evaluation_notes?: string[];
  alternatives_data?: AlternativesData | null;
}

export interface AgentChatResponse {
  response: string;
  proposed_action?: AgentProposal | null;
  tool_results: Record<string, unknown>;
  evaluation_notes: string[];
}


