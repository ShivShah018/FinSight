import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BudgetService, CategoryService } from '../services';
import { useAuth } from '../contexts/AuthContext';
import { fmt as convertCurrency } from '../utils/currency';
import { useRates } from '../hooks/useRates';
import { 
  PlusCircle, 
  Trash2, 
  Edit, 
  AlertCircle, 
  Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { BudgetUtilization } from '../types';

export const Budgets: React.FC = () => {
  const { user } = useAuth();
  const { rates } = useRates();
  const cur = user?.currency || 'INR';
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<{ id: number; category_name: string; limit: number } | null>(null);

  // Form states
  const [categoryId, setCategoryId] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [editLimit, setEditLimit] = useState('');

  // Queries
  const { data: utilization, isLoading, error } = useQuery({
    queryKey: ['budgets', 'utilization'],
    queryFn: () => BudgetService.getUtilization(),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', 'expense'],
    queryFn: () => CategoryService.getAll('expense'),
  });

  // Mutations
  const setLimitMutation = useMutation({
    mutationFn: BudgetService.setLimit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Budget limit configured!');
      setShowAddModal(false);
      setCategoryId('');
      setMonthlyLimit('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to configure budget limit.');
    }
  });

  const updateLimitMutation = useMutation({
    mutationFn: ({ id, limit }: { id: number; limit: number }) => BudgetService.updateLimit(id, limit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Budget limit updated!');
      setEditingBudget(null);
    },
    onError: () => {
      toast.error('Failed to update budget limit.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: BudgetService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Budget limit removed.');
    },
    onError: () => {
      toast.error('Failed to remove budget limit.');
    }
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) {
      toast.error('Please select an expense category.');
      return;
    }
    if (!monthlyLimit || isNaN(Number(monthlyLimit)) || Number(monthlyLimit) <= 0) {
      toast.error('Please enter a valid positive monthly limit.');
      return;
    }
    setLimitMutation.mutate({
      category_id: Number(categoryId),
      monthly_limit: Number(monthlyLimit),
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLimit || isNaN(Number(editLimit)) || Number(editLimit) <= 0) {
      toast.error('Please enter a valid positive monthly limit.');
      return;
    }
    if (editingBudget) {
      updateLimitMutation.mutate({
        id: editingBudget.id,
        limit: Number(editLimit),
      });
    }
  };

  const fmt = (val: number) => convertCurrency(val, cur, rates);

  // Generate budget advisory tips
  const getAdvisoryTip = (spent: number, limit: number, category: string) => {
    if (limit <= 0) return { text: `${category} — no budget limit set.`, type: 'success' as const };
    const pct = (spent / limit) * 100;
    if (pct > 100) {
      return {
        text: `Critical! You are over budget on ${category} by ${fmt(spent - limit)}. Consider trimming this week.`,
        type: 'danger'
      };
    } else if (pct >= 85) {
      return {
        text: `Warning: ${category} spending is at ${pct.toFixed(0)}%. You only have ${fmt(limit - spent)} left.`,
        type: 'warning'
      };
    } else {
      return {
        text: `${category} is looking healthy at ${pct.toFixed(0)}% utilization. Good job maintaining restraint.`,
        type: 'success'
      };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Budgets</h1>
          <p className="text-sm text-slate-400">Establish and monitor monthly budget limits to keep spending on track.</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-purple-600/10 cursor-pointer"
        >
          <PlusCircle className="w-5 h-5" />
          <span>Set Budget Limit</span>
        </button>
      </div>

      {/* Advisory section */}
      {utilization && utilization.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl flex items-start gap-4">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200 mb-1">Smart Spending Tips</h4>
            <div className="space-y-2">
              {utilization.slice(0, 2).map((bud: BudgetUtilization) => {
                const tip = getAdvisoryTip(bud.spent, bud.monthly_limit, bud.category_name);
                return (
                  <p key={bud.category_name} className={`text-xs leading-relaxed ${
                    tip.type === 'danger' ? 'text-rose-400' : tip.type === 'warning' ? 'text-amber-400' : 'text-slate-400'
                  }`}>
                    • {tip.text}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Budgets Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-400">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <span>Calculating utilization...</span>
        </div>
      ) : error ? (
        <div className="py-20 text-center text-slate-400 flex flex-col items-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mb-2" />
          <span>Failed to load budget tracking details.</span>
        </div>
      ) : !utilization || utilization.length === 0 ? (
        <div className="py-20 text-center text-slate-500 text-sm">
          No budget limits configured. Click "Set Budget Limit" above to configure monthly caps for your categories.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {utilization.map((bud: BudgetUtilization) => {
            const pct = bud.monthly_limit > 0 ? Math.min((bud.spent / bud.monthly_limit) * 100, 100) : 0;
            const rawPct = bud.monthly_limit > 0 ? (bud.spent / bud.monthly_limit) * 100 : 0;
            const isOverBudget = rawPct > 100;
            const isWarning = rawPct >= 80 && rawPct <= 100;

            return (
              <div 
                key={bud.category_id} 
                className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between hover:border-slate-700/60 transition-all duration-300 shadow-xl"
              >
                <div>
                  {/* Category Name & Action Buttons */}
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-200 text-sm">{bud.category_name}</h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingBudget({ id: bud.id, category_name: bud.category_name, limit: bud.monthly_limit });
                          setEditLimit(bud.monthly_limit.toString());
                        }}
                        aria-label="Edit Budget"
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-all cursor-pointer"
                        title="Edit Budget"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(bud.id)}
                        aria-label="Remove Limit"
                        className="p-1.5 hover:bg-rose-500/10 text-rose-400 rounded-lg transition-all cursor-pointer"
                        title="Remove Limit"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Spent vs Limit details */}
                  <div className="flex justify-between items-baseline mb-2">
                    <p className="text-xl font-bold text-white">
                      {fmt(bud.spent)}
                      <span className="text-xs font-normal text-slate-500"> spent</span>
                    </p>
                    <p className="text-xs text-slate-400 font-medium">
                      Limit: {fmt(bud.monthly_limit)}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden mb-3">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOverBudget ? 'bg-rose-500 animate-pulse' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                      }`} 
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-800/60 text-[10px]">
                  <span className={`font-semibold uppercase tracking-wider ${
                    isOverBudget ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-slate-500'
                  }`}>
                    {isOverBudget ? 'Over Budget' : isWarning ? 'Approaching Limit' : 'On Track'}
                  </span>
                  <span className="font-bold text-slate-300">{rawPct.toFixed(0)}% Spent</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Set Budget Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Set Budget Limit</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                aria-label="Cancel setting budget limit"
                className="text-slate-500 hover:text-slate-300 text-sm cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              {/* Category selector */}
              <div>
                <label htmlFor="add-budget-category" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Expense Category</label>
                <select
                  id="add-budget-category"
                  name="category_id"
                  autoComplete="off"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all cursor-pointer"
                >
                  <option value="">Select a category</option>
                  {categories?.map((cat) => (
                    <option key={cat.id} value={cat.id} className="bg-slate-950">
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Monthly Limit input */}
              <div>
                <label htmlFor="add-budget-limit" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Monthly Cap Limit</label>
                <input
                  id="add-budget-limit"
                  name="monthly_limit"
                  type="text"
                  placeholder="e.g. 10000"
                  autoComplete="off"
                  value={monthlyLimit}
                  onChange={(e) => setMonthlyLimit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all"
                />
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={setLimitMutation.isPending}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-purple-600/10 flex items-center justify-center"
              >
                {setLimitMutation.isPending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Confirm Limit'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Budget Modal */}
      {editingBudget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Edit Limit: {editingBudget.category_name}</h3>
              <button 
                onClick={() => setEditingBudget(null)}
                aria-label="Cancel editing budget limit"
                className="text-slate-500 hover:text-slate-300 text-sm cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {/* Monthly Limit input */}
              <div>
                <label htmlFor="edit-budget-limit" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">New Monthly Cap Limit</label>
                <input
                  id="edit-budget-limit"
                  name="monthly_limit"
                  type="text"
                  placeholder="e.g. 15000"
                  autoComplete="off"
                  value={editLimit}
                  onChange={(e) => setEditLimit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all"
                />
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={updateLimitMutation.isPending}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-purple-600/10 flex items-center justify-center"
              >
                {updateLimitMutation.isPending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Update Limit'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
