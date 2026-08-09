import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnalyticsService, TransactionService, CategoryService, InsightService } from '../services';
import { useAuth } from '../contexts/AuthContext';
import { fmt as convertCurrency } from '../utils/currency';
import { useRates } from '../hooks/useRates';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ArrowUpRight, 
  PlusCircle, 
  Calendar, 
  Briefcase,
  AlertCircle
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Cell, 
  XAxis, 
  YAxis, 
  Tooltip, 
  PieChart, 
  Pie, 
} from 'recharts';
import toast from 'react-hot-toast';
import { tooltipStyle, tooltipLabelStyle } from '../utils/theme';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { rates } = useRates();
  const cur = user?.currency || 'INR';
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Form states for quick transaction creation
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0]);

  // Queries
  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError } = useQuery({
    queryKey: ['dashboard', selectedMonth, selectedYear],
    queryFn: () => AnalyticsService.getDashboard(selectedMonth, selectedYear),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoryService.getAll(),
  });

  const { data: prediction } = useQuery({
    queryKey: ['insights', 'predict'],
    queryFn: () => InsightService.predict(),
    retry: false,
  });

  // Category Suggester Mutation
  const suggestMutation = useMutation({
    mutationFn: (desc: string) => InsightService.suggestCategory(desc),
    onSuccess: (data) => {
      if (data && data.category_id) {
        setCategoryId(data.category_id.toString());
        toast.success(`Suggested category: ${data.category}`, { id: 'suggest' });
      }
    }
  });

  // Create Transaction Mutation
  const createTxMutation = useMutation({
    mutationFn: TransactionService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Transaction created!');
      setShowAddModal(false);
      // Reset form
      setAmount('');
      setCategoryId('');
      setDescription('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to create transaction');
    }
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error('Please enter a valid positive amount.');
      return;
    }
    if (!categoryId) {
      toast.error('Please select a category.');
      return;
    }
    createTxMutation.mutate({
      category_id: Number(categoryId),
      amount: Number(amount),
      type,
      description,
      currency: user?.currency || 'INR',
      transaction_date: transactionDate,
    });
  };

  const handleDescriptionBlur = () => {
    if (description.trim().length > 2 && type === 'expense') {
      suggestMutation.mutate(description);
    }
  };

  // Loader / Error States
  if (dashboardLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-8 bg-slate-900 rounded-lg w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="h-32 bg-slate-900 rounded-2xl"></div>
          <div className="h-32 bg-slate-900 rounded-2xl"></div>
          <div className="h-32 bg-slate-900 rounded-2xl"></div>
          <div className="h-32 bg-slate-900 rounded-2xl"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-96 bg-slate-900 rounded-2xl lg:col-span-2"></div>
          <div className="h-96 bg-slate-900 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (dashboardError || !dashboardData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
        <h3 className="text-lg font-semibold text-white mb-2">Failed to Load Dashboard</h3>
        <p className="text-sm text-slate-500 mb-6">Make sure the backend server is running and properly connected to the database.</p>
      </div>
    );
  }

  // Format currency helper
  const fmt = (val: number | null | undefined) => {
    if (val == null) return '';
    return convertCurrency(val ?? 0, cur, rates);
  };

  // Pie chart colors
  const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1'];

  const pieData = dashboardData.top_categories?.map(cat => ({
    name: cat.category_name,
    value: cat.amount
  })) || [];

  // Fill in all 12 months so gaps show as zero
  const allMonths: { month: string; income: number; expense: number; net: number }[] = [];
  const trendMap = new Map((dashboardData.monthly_trends || []).map((m: any) => [m.month, m]));
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const existing = trendMap.get(key);
    allMonths.push({
      month: key,
      income: existing?.income ?? 0,
      expense: existing?.expense ?? 0,
      net: (existing?.income ?? 0) - (existing?.expense ?? 0),
    });
  }

  return (
    <div className="space-y-8">
      {/* Upper header action area */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Financial Overview</h1>
          <p className="text-sm text-slate-400">Welcome back, {user?.name}. Here is your financial summary.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Month/Year selector */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl p-1 text-sm text-slate-300">
            <select 
              id="dashboard-month-select"
              name="month"
              autoComplete="off"
              aria-label="Select month"
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent border-0 py-1.5 px-3 focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => {
                const monthNum = i + 1;
                const isFuture = selectedYear >= new Date().getFullYear() && monthNum > new Date().getMonth() + 1;
                return (
                  <option key={monthNum} value={monthNum} disabled={isFuture} className="bg-slate-950">
                    {new Date(0, i).toLocaleString('en', { month: 'short' })}
                  </option>
                );
              })}
            </select>
            <div className="w-px h-5 bg-slate-800"></div>
            <select 
              id="dashboard-year-select"
              name="year"
              autoComplete="off"
              aria-label="Select year"
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent border-0 py-1.5 px-3 focus:outline-none cursor-pointer"
            >
              {(() => {
                const currentYear = new Date().getFullYear();
                const years = [];
                for (let y = currentYear - 3; y <= currentYear; y++) years.push(y);
                return years;
              })().map(yr => (
                <option key={yr} value={yr} className="bg-slate-950">{yr}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-purple-600/10 cursor-pointer"
          >
            <PlusCircle className="w-5 h-5" />
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      {/* Cards stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Net Savings Card */}
        <div className="bg-slate-900 border border-slate-800/80 p-6 rounded-2xl shadow-xl flex flex-col justify-between hover:border-slate-700/50 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide">Net Savings</span>
              <Wallet className="w-5 h-5 text-purple-400" />
            </div>
            <p className={`text-2xl font-bold ${dashboardData.net_savings >= 0 ? 'text-white' : 'text-rose-400'}`}>
              {fmt(dashboardData.net_savings)}
            </p>
          </div>
          <span className="text-[11px] text-slate-500 mt-4 block">
            Remaining savings for this period.
          </span>
        </div>

        {/* Total Income Card */}
        <div className="bg-slate-900 border border-slate-800/80 p-6 rounded-2xl shadow-xl flex flex-col justify-between hover:border-slate-700/50 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide">Income</span>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400">{fmt(dashboardData.total_income)}</p>
          </div>
          <span className="text-[11px] text-slate-500 mt-4 block">
            Total inflow of funds.
          </span>
        </div>

        {/* Total Expense Card */}
        <div className="bg-slate-900 border border-slate-800/80 p-6 rounded-2xl shadow-xl flex flex-col justify-between hover:border-slate-700/50 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide">Expenses</span>
              <TrendingDown className="w-5 h-5 text-rose-400" />
            </div>
            <p className="text-2xl font-bold text-rose-400">{fmt(dashboardData.total_expense)}</p>
          </div>
          <span className="text-[11px] text-slate-500 mt-4 block">
            Total spending and outflows.
          </span>
        </div>

        {/* Savings Rate Card */}
        <div className="bg-slate-900 border border-slate-800/80 p-6 rounded-2xl shadow-xl flex flex-col justify-between hover:border-slate-700/50 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide">Savings Rate</span>
              <ArrowUpRight className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-blue-400">{(dashboardData.savings_rate ?? 0).toFixed(1)}%</p>
          </div>
          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-4">
            <div 
              className="bg-blue-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(Math.max(dashboardData.savings_rate, 0), 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Bar Chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
          <div className="mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Monthly Cashflow Difference</h3>
            <p className="text-xs text-slate-500">Net savings (income − expenses) per month. Green = surplus, red = deficit.</p>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={allMonths}>
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => convertCurrency(v, cur, rates)} />
                <Tooltip 
                  contentStyle={tooltipStyle()}
                  labelStyle={tooltipLabelStyle()}
                  itemStyle={{ color: 'inherit' }}
                  formatter={(value: any) => convertCurrency(Number(value) || 0, cur, rates)}
                />
                <Bar dataKey="net" radius={[4, 4, 0, 0]} name="Net Savings">
                  {allMonths.map((d, i) => (
                    <Cell key={i} fill={d.net >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Category Pie Chart */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Expense Distribution</h3>
            <p className="text-xs text-slate-500">Breakdown of expenses by category.</p>
          </div>
          <div className="h-64 flex items-center justify-center relative my-4">
            {pieData.length === 0 ? (
              <p className="text-xs text-slate-500">No expenses recorded for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={tooltipStyle()}
                    labelStyle={tooltipLabelStyle()}
                    itemStyle={{ color: 'inherit' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {dashboardData.top_categories?.slice(0, 4).map((cat, i) => (
              <div key={cat.category_name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                  <span className="text-slate-400">{cat.category_name}</span>
                </div>
                <span className="font-semibold text-slate-200">{fmt(cat.amount)} ({(cat.pct ?? 0).toFixed(0)}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Predictions and Budgets Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions List */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Recent Transactions</h3>
                <p className="text-xs text-slate-500">Your latest transactions this period.</p>
              </div>
            </div>
            <div className="divide-y divide-slate-800/60 max-h-[300px] overflow-y-auto pr-1">
              {dashboardData.recent_transactions?.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs">No transactions found.</div>
              ) : (
                dashboardData.recent_transactions?.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                        tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {tx.type === 'income' ? '+' : '-'}
                      </div>
                      <div>
                        <p className="text-sm text-slate-200 font-semibold">{tx.description || tx.category_name}</p>
                        <p className="text-[10px] text-slate-500">{new Date(tx.transaction_date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold ${
                      tx.type === 'income' ? 'text-emerald-400' : 'text-slate-200'
                    }`}>
                      {tx.type === 'expense' ? '-' : ''}{fmt(tx.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Spending Prediction Card */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Spending Forecast</h3>
            <p className="text-xs text-slate-500">Estimated spending range for next month based on your transaction history.</p>
          </div>
          <div className="py-6 flex flex-col items-center justify-center text-center">
            {prediction ? (
              <div className="space-y-4">
                <span className="text-xs font-semibold text-purple-400 uppercase tracking-widest bg-purple-500/10 px-3 py-1.5 rounded-full">
                  Predicted Spending
                </span>
                <p className="text-3xl font-extrabold text-white mt-2">
                  {fmt(prediction.next_month_prediction)}
                </p>
                <p className="text-xs text-slate-400 px-4 leading-relaxed">
                  {prediction.message || 'Based on your transaction trends over the past weeks.'}
                </p>
                {prediction.confidence_score !== undefined && (
                  <div className="pt-2">
                    <span className="text-[10px] text-slate-500">Confidence Score: </span>
                    <span className="text-xs font-semibold text-slate-300">{(prediction.confidence_score * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-500 text-xs py-8">
                <Briefcase className="w-8 h-8 text-slate-600 mb-2 mx-auto animate-pulse" />
                Not enough historical data to generate predictions. Add more expense history.
              </div>
            )}
          </div>
          <div className="p-3 bg-slate-950 border border-slate-800/50 rounded-xl">
            <p className="text-[10px] text-slate-500 leading-normal">
              Forecast is based on your historical spending patterns and monthly trends.
            </p>
          </div>
        </div>
      </div>

      {/* Add Transaction Modal Overlay */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Create New Transaction</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                aria-label="Cancel transaction creation"
                className="text-slate-500 hover:text-slate-300 text-sm cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              {/* Type Toggle */}
              <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setType('expense')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    type === 'expense' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setType('income')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    type === 'income' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Income
                </button>
              </div>

              {/* Amount input */}
              <div>
                <label htmlFor="dash-tx-amount" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Amount</label>
                <input
                  id="dash-tx-amount"
                  name="amount"
                  type="text"
                  placeholder="e.g. 500"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all"
                />
              </div>

              {/* Description input */}
              <div>
                <label htmlFor="dash-tx-description" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Description</label>
                <input
                  id="dash-tx-description"
                  name="description"
                  type="text"
                  placeholder="e.g. Uber ride / Salary"
                  autoComplete="off"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={handleDescriptionBlur}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all"
                />
              </div>

              {/* Category selector */}
              <div>
                <label htmlFor="dash-tx-category" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Category</label>
                <select
                  id="dash-tx-category"
                  name="category_id"
                  autoComplete="off"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all cursor-pointer"
                >
                  <option value="">Select a category</option>
                  {categories?.filter(c => c.type === type).map((cat) => (
                    <option key={cat.id} value={cat.id} className="bg-slate-950">
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Transaction Date */}
              <div>
                <label htmlFor="dash-tx-date" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Transaction Date</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <Calendar className="w-5 h-5" />
                  </span>
                  <input
                    id="dash-tx-date"
                    name="transaction_date"
                    type="date"
                    autoComplete="off"
                    max={new Date().toISOString().split("T")[0]}
                    value={transactionDate}
                    onChange={(e) => setTransactionDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 pl-11 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all cursor-pointer"
                  />
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={createTxMutation.isPending}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-purple-600/10 flex items-center justify-center"
              >
                {createTxMutation.isPending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Create'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
