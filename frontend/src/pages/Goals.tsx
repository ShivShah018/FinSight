import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GoalService } from '../services';
import { useAuth } from '../contexts/AuthContext';
import { fmt as convertCurrency } from '../utils/currency';
import { useRates } from '../hooks/useRates';
import { 
  PlusCircle, 
  Trash2, 
  Coins, 
  CheckCircle2, 
  Calendar,
  AlertCircle,
  TrendingUp,
  Award,
  Edit
} from 'lucide-react';
import toast from 'react-hot-toast';

export const Goals: React.FC = () => {
  const { user } = useAuth();
  const { rates } = useRates();
  const cur = user?.currency || 'INR';
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [fundingGoal, setFundingGoal] = useState<{ id: number; name: string } | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<{ id: number; name: string } | null>(null);
  const [editingGoal, setEditingGoal] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editTargetAmount, setEditTargetAmount] = useState('');
  const [editDeadline, setEditDeadline] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [fundAmount, setFundAmount] = useState('');

  // Queries
  const { data: goals, isLoading, error } = useQuery({
    queryKey: ['goals'],
    queryFn: () => GoalService.getAll(),
  });

  // Mutations
  const createGoalMutation = useMutation({
    mutationFn: GoalService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Savings goal created!');
      setShowAddModal(false);
      setName('');
      setTargetAmount('');
      setDeadline('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to create goal.');
    }
  });

  const fundGoalMutation = useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number }) => GoalService.fund(id, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Funds added to savings goal!');
      setFundingGoal(null);
      setFundAmount('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to add funds.');
    }
  });

  const completeMutation = useMutation({
    mutationFn: GoalService.complete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success('🎉 Congratulations on reaching your savings goal!');
    },
    onError: () => {
      toast.error('Failed to complete goal.');
    }
  });

  const deleteGoalMutation = useMutation({
    mutationFn: GoalService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Savings goal deleted permanently.');
    },
    onError: () => {
      toast.error('Failed to delete goal.');
    }
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => GoalService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Savings goal updated!');
      setEditingGoal(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update goal.');
    }
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter a goal name.');
      return;
    }
    if (!targetAmount || isNaN(Number(targetAmount)) || Number(targetAmount) <= 0) {
      toast.error('Please enter a valid positive target amount.');
      return;
    }
    createGoalMutation.mutate({
      name: name.trim(),
      target_amount: Number(targetAmount),
      deadline: deadline || undefined,
    });
  };

  const handleFundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundAmount || isNaN(Number(fundAmount)) || Number(fundAmount) <= 0) {
      toast.error('Please enter a valid deposit amount.');
      return;
    }
    if (fundingGoal) {
      fundGoalMutation.mutate({
        id: fundingGoal.id,
        amount: Number(fundAmount),
      });
    }
  };

  const fmt = (val: number) => convertCurrency(val, cur, rates);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Savings Goals</h1>
          <p className="text-sm text-slate-400">Create, fund, and track milestones for your savings targets.</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-purple-600/10 cursor-pointer"
        >
          <PlusCircle className="w-5 h-5" />
          <span>New Goal</span>
        </button>
      </div>

      {/* Goals grid list */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-400">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <span>Loading milestones...</span>
        </div>
      ) : error ? (
        <div className="py-20 text-center text-slate-400 flex flex-col items-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mb-2" />
          <span>Failed to load savings goals.</span>
        </div>
      ) : !goals || goals.length === 0 ? (
        <div className="py-20 text-center text-slate-500 text-sm">
          No savings goals found. Click "New Goal" above to configure savings objectives.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals.map((goal) => {
            const isCompleted = goal.status === 'completed' || goal.current_amount >= goal.target_amount;
            const progress = Math.min((goal.current_amount / goal.target_amount) * 100, 100);

            return (
              <div 
                key={goal.id} 
                className={`bg-slate-900 border p-6 rounded-2xl flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-300 shadow-xl ${
                  isCompleted ? 'border-emerald-500/35 bg-gradient-to-br from-slate-900 to-emerald-950/15' : 'border-slate-800'
                }`}
              >
                <div>
                  {/* Goal header info */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isCompleted ? 'bg-emerald-500/10 text-emerald-400' : 'bg-purple-500/10 text-purple-400'
                      }`}>
                        {isCompleted ? <Award className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                      </div>
                      <h3 className="font-bold text-slate-200 text-sm">{goal.name}</h3>
                    </div>
                    
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      goal.status === 'completed' 
                        ? 'bg-emerald-500/10 text-emerald-400' 
                        : goal.status === 'cancelled'
                        ? 'bg-slate-950 text-slate-500'
                        : 'bg-purple-500/10 text-purple-400'
                    }`}>
                      {goal.status}
                    </span>
                  </div>

                  {/* Fund values */}
                  <div className="flex justify-between items-baseline mb-2">
                    <p className="text-xl font-extrabold text-white">
                      {fmt(goal.current_amount)}
                      <span className="text-xs font-normal text-slate-500"> saved</span>
                    </p>
                    <p className="text-xs text-slate-400 font-medium">
                      Target: {fmt(goal.target_amount)}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden mb-3">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCompleted ? 'bg-emerald-500' : 'bg-purple-600'
                      }`} 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>

                {/* Footer values & action actions */}
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-800/60">
                  <div className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{goal.deadline ? new Date(goal.deadline).toLocaleDateString() : 'No deadline'}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {goal.status === 'active' && (
                      <>
                        <button
                          onClick={() => setFundingGoal({ id: goal.id, name: goal.name })}
                          className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-[10px] px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                        >
                          <Coins className="w-3.5 h-3.5" />
                          <span>Fund</span>
                        </button>
                        
                        {!isCompleted && (
                          <button
                            onClick={() => completeMutation.mutate(goal.id)}
                            aria-label="Complete Goal"
                            className="p-1.5 hover:bg-emerald-500/10 text-emerald-400 rounded-lg transition-all cursor-pointer"
                            title="Complete Goal"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                    
                    <button
                      onClick={() => {
                        setEditingGoal(goal);
                        setEditName(goal.name);
                        setEditTargetAmount(goal.target_amount.toString());
                        setEditDeadline(goal.deadline || '');
                      }}
                      aria-label="Edit Goal"
                      className="p-1.5 hover:bg-purple-500/10 text-purple-400 rounded-lg transition-all cursor-pointer"
                      title="Edit Goal"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeletingGoal({ id: goal.id, name: goal.name })}
                      aria-label="Delete Goal"
                      className="p-1.5 hover:bg-rose-500/10 text-rose-400 rounded-lg transition-all cursor-pointer"
                      title="Delete Goal"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Goal Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Create Savings Goal</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                aria-label="Cancel adding savings goal"
                className="text-slate-500 hover:text-slate-300 text-sm cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              {/* Goal name */}
              <div>
                <label htmlFor="add-goal-name" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Goal Name</label>
                <input
                  id="add-goal-name"
                  name="name"
                  type="text"
                  placeholder="e.g. New Macbook Pro / Car Fund"
                  autoComplete="off"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all"
                />
              </div>

              {/* Target amount */}
              <div>
                <label htmlFor="add-goal-target" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Target Amount</label>
                <input
                  id="add-goal-target"
                  name="target_amount"
                  type="text"
                  placeholder="e.g. 150000"
                  autoComplete="off"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all"
                />
              </div>

              {/* Deadline */}
              <div>
                <label htmlFor="add-goal-deadline" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Target Deadline (Optional)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <Calendar className="w-5 h-5" />
                  </span>
                  <input
                    id="add-goal-deadline"
                    name="deadline"
                    type="date"
                    autoComplete="off"
                    min={new Date().toISOString().split("T")[0]}
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 pl-11 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all cursor-pointer"
                  />
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={createGoalMutation.isPending}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-purple-600/10 flex items-center justify-center"
              >
                {createGoalMutation.isPending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Create Goal'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Goal Confirmation Modal */}
      {deletingGoal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Delete Goal?</h3>
            <p className="text-sm text-slate-400 mb-6">
              Are you sure you want to permanently delete <span className="font-semibold text-slate-200">{deletingGoal.name}</span>? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingGoal(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 rounded-xl text-sm transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteGoalMutation.mutate(deletingGoal.id);
                  setDeletingGoal(null);
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fund Goal Modal */}
      {fundingGoal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Deposit to: {fundingGoal.name}</h3>
              <button 
                onClick={() => setFundingGoal(null)}
                aria-label="Cancel funding goal"
                className="text-slate-500 hover:text-slate-300 text-sm cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleFundSubmit} className="space-y-4">
              <div>
                <label htmlFor="fund-goal-amount" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Amount to add</label>
                <input
                  id="fund-goal-amount"
                  name="amount"
                  type="text"
                  placeholder="e.g. 5000"
                  autoComplete="off"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={fundGoalMutation.isPending}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-purple-600/10 flex items-center justify-center"
              >
                {fundGoalMutation.isPending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Confirm Deposit'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Goal Modal */}
      {editingGoal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Edit Savings Goal</h3>
              <button 
                onClick={() => setEditingGoal(null)}
                aria-label="Cancel editing goal"
                className="text-slate-500 hover:text-slate-300 text-sm cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!editName.trim()) {
                toast.error('Please enter a goal name.');
                return;
              }
              if (!editTargetAmount || isNaN(Number(editTargetAmount)) || Number(editTargetAmount) <= 0) {
                toast.error('Please enter a valid positive target amount.');
                return;
              }
              updateGoalMutation.mutate({
                id: editingGoal.id,
                data: {
                  name: editName.trim(),
                  target_amount: Number(editTargetAmount),
                  deadline: editDeadline || undefined,
                },
              });
            }} className="space-y-4">
              <div>
                <label htmlFor="edit-goal-name" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Goal Name</label>
                <input
                  id="edit-goal-name"
                  name="name"
                  type="text"
                  placeholder="e.g. New Macbook Pro / Car Fund"
                  autoComplete="off"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all"
                />
              </div>

              <div>
                <label htmlFor="edit-goal-target" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Target Amount</label>
                <input
                  id="edit-goal-target"
                  name="target_amount"
                  type="text"
                  placeholder="e.g. 150000"
                  autoComplete="off"
                  value={editTargetAmount}
                  onChange={(e) => setEditTargetAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all"
                />
              </div>

              <div>
                <label htmlFor="edit-goal-deadline" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Target Deadline (Optional)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <Calendar className="w-5 h-5" />
                  </span>
                  <input
                    id="edit-goal-deadline"
                    name="deadline"
                    type="date"
                    autoComplete="off"
                    min={new Date().toISOString().split("T")[0]}
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 pl-11 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all cursor-pointer"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={updateGoalMutation.isPending}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-purple-600/10 flex items-center justify-center"
              >
                {updateGoalMutation.isPending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Save Changes'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
