import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  PiggyBank, 
  Receipt, 
  CheckCircle2, 
  Calendar,
  Layers,
  PieChart as PieChartIcon,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { fmt as convertCurrency } from '../../utils/currency';

interface ToolResultsProps {
  toolResults?: {
    get_monthly_spending?: {
      reporting_period?: { label: string; start_date?: string; end_date?: string };
      total_income?: number;
      total_expense?: number;
      net_savings?: number;
      savings_rate_pct?: number;
      avg_daily_spending?: number;
      total_transactions?: number;
      has_data?: boolean;
    };
    get_category_breakdown?: {
      reporting_period?: { label: string };
      overall_total?: number;
      has_data?: boolean;
      categories?: Array<{
        category_name: string;
        total_amount: number;
        percentage_of_total: number;
        color?: string;
      }>;
    };
    get_budget_status?: {
      reporting_period?: { label: string };
      has_budgets?: boolean;
      total_budget_limit?: number;
      total_budget_spent?: number;
      overall_utilization_pct?: number;
      budgets?: Array<{
        category_name: string;
        monthly_limit: number;
        spent: number;
        remaining: number;
        utilization_pct: number;
        status: string;
      }>;
    };
  };
  rates: Record<string, number>;
  currency: string;
}

export const FinancialMetricsCard: React.FC<ToolResultsProps> = ({ toolResults, rates, currency }) => {
  if (!toolResults) return null;

  const ms = toolResults.get_monthly_spending;
  const cats = toolResults.get_category_breakdown;
  const budgets = toolResults.get_budget_status;

  const hasSpendingData = ms && ms.has_data && (ms.total_expense! > 0 || ms.total_income! > 0);
  const hasCategories = cats && cats.has_data && cats.categories && cats.categories.length > 0;
  const hasBudgets = budgets && budgets.has_budgets && budgets.budgets && budgets.budgets.length > 0;

  if (!hasSpendingData && !hasCategories && !hasBudgets) {
    return null;
  }

  const periodLabel = ms?.reporting_period?.label || cats?.reporting_period?.label || budgets?.reporting_period?.label || 'Selected Period';

  return (
    <div className="mt-3.5 space-y-3 rounded-2xl bg-slate-900/90 border border-slate-800 p-3.5 shadow-lg">
      {/* Header Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2 text-xs">
        <div className="flex items-center gap-1.5 text-purple-300 font-semibold">
          <Calendar className="w-3.5 h-3.5 text-purple-400" />
          <span>{periodLabel}</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px]">Verified from recorded transactions</span>
        </div>
      </div>

      {/* Main Totals Grid */}
      {hasSpendingData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
          {/* Income */}
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/70">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              <span>Income</span>
            </div>
            <p className="text-sm font-bold text-emerald-400 mt-1">
              {convertCurrency(ms!.total_income || 0, currency, rates)}
            </p>
          </div>

          {/* Expenses */}
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/70">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <TrendingDown className="w-3 h-3 text-rose-400" />
              <span>Expenses</span>
            </div>
            <p className="text-sm font-bold text-rose-400 mt-1">
              {convertCurrency(ms!.total_expense || 0, currency, rates)}
            </p>
          </div>

          {/* Net Savings */}
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/70">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <PiggyBank className="w-3 h-3 text-cyan-400" />
              <span>Net Savings</span>
            </div>
            <p className={`text-sm font-bold mt-1 ${(ms!.net_savings || 0) >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
              {convertCurrency(ms!.net_savings || 0, currency, rates)}
            </p>
          </div>

          {/* Activity / Tx Count */}
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/70">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Receipt className="w-3 h-3 text-indigo-400" />
              <span>Transactions</span>
            </div>
            <p className="text-sm font-bold text-slate-200 mt-1">
              {ms!.total_transactions || 0}
              {ms!.savings_rate_pct !== undefined && ms!.savings_rate_pct > 0 && (
                <span className="text-[11px] text-slate-400 font-normal ml-1.5">
                  ({ms!.savings_rate_pct}% saved)
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Top Categories Breakdown */}
      {hasCategories && (
        <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span className="flex items-center gap-1 text-slate-300">
              <PieChartIcon className="w-3 h-3 text-purple-400" />
              Top Spending Categories
            </span>
            <span>Total: {convertCurrency(cats!.overall_total || 0, currency, rates)}</span>
          </div>
          <div className="space-y-1.5">
            {cats!.categories!.slice(0, 4).map((cat, idx) => (
              <div key={idx} className="space-y-0.5 text-xs">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="font-medium truncate max-w-[150px]">{cat.category_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[11px]">{cat.percentage_of_total}%</span>
                    <span className="font-semibold text-slate-200">
                      {convertCurrency(cat.total_amount, currency, rates)}
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(3, cat.percentage_of_total))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget Utilization highlights */}
      {hasBudgets && (
        <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span className="flex items-center gap-1 text-slate-300">
              <Layers className="w-3 h-3 text-cyan-400" />
              Active Budgets
            </span>
            <span className="text-[11px]">
              {budgets!.budgets!.length} categories tracked
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {budgets!.budgets!.slice(0, 2).map((b, idx) => (
              <div key={idx} className="p-2 rounded-lg bg-slate-950/40 border border-slate-800/60 text-xs flex justify-between items-center">
                <div className="truncate pr-2">
                  <span className="font-medium text-slate-200 block truncate">{b.category_name}</span>
                  <span className="text-[10px] text-slate-400">
                    Spent: {convertCurrency(b.spent, currency, rates)} / Limit: {convertCurrency(b.monthly_limit, currency, rates)}
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                  b.status === 'exceeded' 
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                    : b.status === 'at_risk' 
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {b.utilization_pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Referral to full Analytics Dashboard */}
      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
        <span>Detailed 12-month trends & ML forecasts</span>
        <Link 
          to="/analytics" 
          className="text-purple-400 hover:text-purple-300 font-medium inline-flex items-center gap-1 transition-colors"
        >
          <span>View Analytics</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
};
