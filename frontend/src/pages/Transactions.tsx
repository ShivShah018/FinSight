import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TransactionService, CategoryService, ReportService } from '../services';
import { useAuth } from '../contexts/AuthContext';
import { fmt as convertCurrency } from '../utils/currency';
import { useRates } from '../hooks/useRates';
import { 
  Search, 
  Trash2, 
  RotateCcw, 
  FileText, 
  AlertCircle,
  X,
  Edit,
  Calendar
} from 'lucide-react';
import toast from 'react-hot-toast';

export const Transactions: React.FC = () => {
  const { user } = useAuth();
  const { rates } = useRates();
  const cur = user?.currency || 'INR';
  const queryClient = useQueryClient();
  
  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number | undefined>(new Date().getFullYear());
  const [showSoftDeleted, setShowSoftDeleted] = useState(false);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [editType, setEditType] = useState<'income' | 'expense'>('expense');
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDate, setEditDate] = useState('');

  // Queries
  const { data: txData, isLoading, error } = useQuery({
    queryKey: ['transactions', selectedMonth, selectedYear],
    queryFn: () => TransactionService.getAll(selectedMonth, selectedYear),
  });

  const { data: deletedTxs } = useQuery({
    queryKey: ['transactions', 'deleted'],
    queryFn: () => TransactionService.getDeletedRecent(),
    enabled: showSoftDeleted,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoryService.getAll(),
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id: number) => TransactionService.delete(id, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Transaction deleted (can be restored)');
    },
    onError: () => {
      toast.error('Failed to delete transaction.');
    }
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => TransactionService.restore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Transaction restored!');
    },
    onError: () => {
      toast.error('Failed to restore transaction.');
    }
  });

  const updateTxMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => TransactionService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Transaction updated!');
      setEditingTx(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update transaction.');
    }
  });

  const exportPdfMutation = useMutation({
    mutationFn: () => ReportService.downloadPdf(),
    onSuccess: async (blobData: any) => {
      try {
        if ('showSaveFilePicker' in window) {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: `finsight_statement_${new Date().toISOString().slice(0, 10)}.pdf`,
            types: [{
              description: 'PDF Document',
              accept: {
                'application/pdf': ['.pdf'],
              },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(blobData);
          await writable.close();
          toast.success('PDF statement saved successfully!');
        } else {
          const url = window.URL.createObjectURL(new Blob([blobData], { type: 'application/pdf' }));
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `finsight_statement_${new Date().toISOString().slice(0, 10)}.pdf`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.success('PDF statement downloaded successfully!');
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          if (import.meta.env.DEV) console.error(err);
          toast.error('Failed to save PDF statement.');
        }
      }
    },
    onError: () => {
      toast.error('Failed to download PDF statement.');
    }
  });

  // Filters & Search
  const transactions = txData?.transactions || [];
  const filtered = transactions.filter((tx) => {
    const matchesSearch = 
      tx.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.category_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === 'all' || tx.type === typeFilter;

    return matchesSearch && matchesType;
  });



  const fmt = (val: number) => convertCurrency(val, cur, rates);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Transactions</h1>
          <p className="text-sm text-slate-400">View, search, and manage all your cash inflow and outflow logs.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => exportPdfMutation.mutate()}
            disabled={exportPdfMutation.isPending}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-sm px-4 py-2.5 rounded-xl border border-slate-800 transition-all cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-4 h-4 text-purple-400" />
            <span>Export PDF</span>
          </button>

        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800/80 p-4 rounded-2xl shadow-xl flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-72">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
            <Search className="w-4 h-4" />
          </span>
          <input
            id="transactions-search"
            name="search"
            type="text"
            placeholder="Search transactions..."
            autoComplete="off"
            aria-label="Search transactions"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 pl-10 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all"
          />
        </div>

        {/* Type toggle buttons */}
        <div className="flex gap-2">
          {(['all', 'income', 'expense'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold uppercase border transition-all cursor-pointer ${
                typeFilter === t
                  ? 'bg-purple-600/20 text-purple-400 border-purple-500/30'
                  : 'bg-slate-950 text-slate-400 border-slate-800/80 hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Date Filters and Undo Options */}
        <div className="flex items-center gap-3">
          <select
            id="transactions-month-filter"
            name="month"
            autoComplete="off"
            aria-label="Filter transactions by month"
            value={selectedMonth || ''}
            onChange={(e) => setSelectedMonth(e.target.value ? Number(e.target.value) : undefined)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-3 py-2 rounded-xl focus:outline-none cursor-pointer"
          >
            <option value="">All Months</option>
            {Array.from({ length: 12 }, (_, i) => {
              const monthNum = i + 1;
              const isFuture = !!(selectedYear && selectedYear >= new Date().getFullYear() && monthNum > new Date().getMonth() + 1);
              return (
                <option key={monthNum} value={monthNum} disabled={isFuture}>
                  {new Date(0, i).toLocaleString('en', { month: 'short' })}
                </option>
              );
            })}
          </select>

          <select
            id="transactions-year-filter"
            name="year"
            autoComplete="off"
            aria-label="Filter transactions by year"
            value={selectedYear || ''}
            onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : undefined)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-3 py-2 rounded-xl focus:outline-none cursor-pointer"
          >
            <option value="">All Years</option>
            {(() => {
              const currentYear = new Date().getFullYear();
              const years = [];
              for (let y = currentYear - 3; y <= currentYear; y++) years.push(y);
              return years;
            })().map(yr => (
              <option key={yr} value={yr}>{yr}</option>
            ))}
          </select>

          <button
            onClick={() => setShowSoftDeleted(!showSoftDeleted)}
            aria-label="Toggle recently deleted transactions"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              showSoftDeleted 
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Undo Delete</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {showSoftDeleted ? (
        /* Soft Deleted Transactions list */
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-400">Recently Deleted (Undo actions)</h3>
            <button 
              onClick={() => setShowSoftDeleted(false)}
              aria-label="Close recently deleted transactions list"
              className="text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-slate-800">
            {!deletedTxs || deletedTxs.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">No recently deleted transactions.</div>
            ) : (
              deletedTxs.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm text-slate-200 font-semibold">{tx.description || tx.category_name}</p>
                    <p className="text-[10px] text-slate-500">{new Date(tx.transaction_date).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400 font-semibold">{fmt(tx.amount)}</span>
                    <button
                      onClick={() => restoreMutation.mutate(tx.id)}
                      aria-label="Restore transaction"
                      className="p-1.5 hover:bg-emerald-500/10 text-emerald-400 rounded-lg transition-all cursor-pointer"
                      title="Restore"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Main Transactions Data Table */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          {isLoading ? (
            <div className="py-20 text-center text-slate-400">
              <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <span>Fetching logs...</span>
            </div>
          ) : error ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center">
              <AlertCircle className="w-10 h-10 text-rose-500 mb-2" />
              <span>Failed to fetch transaction logs.</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-slate-500 text-sm">
              No transactions matching your criteria. Try adjusting filters or creating a new transaction.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-4 px-6">Date</th>
                    <th className="py-4 px-6">Category</th>
                    <th className="py-4 px-6">Description</th>
                    <th className="py-4 px-6">Type</th>
                    <th className="py-4 px-6">Amount</th>
                    <th className="py-4 px-6 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {filtered.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-800/30 transition-all">
                      <td className="py-3.5 px-6 font-medium text-slate-400">
                        {tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString() : '-'}
                      </td>
                      <td className="py-3.5 px-6 font-semibold">{tx.category_name}</td>
                      <td className="py-3.5 px-6 text-slate-300 max-w-xs truncate">{tx.description || '-'}</td>
                      <td className="py-3.5 px-6">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className={`py-3.5 px-6 font-bold ${tx.type === 'income' ? 'text-emerald-400' : 'text-slate-100'}`}>
                        {tx.type === 'expense' ? '-' : ''}{fmt(tx.amount)}
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setEditingTx(tx);
                              setEditType(tx.type);
                              setEditAmount(tx.amount.toString());
                              setEditDescription(tx.description || '');
                              setEditCategoryId(tx.category_id?.toString() || '');
                              setEditDate(tx.transaction_date);
                            }}
                            aria-label="Edit transaction"
                            className="p-2 hover:bg-purple-500/10 text-purple-400 rounded-lg transition-all cursor-pointer"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(tx.id)}
                            aria-label="Delete transaction"
                            className="p-2 hover:bg-rose-500/10 text-rose-400 rounded-lg transition-all cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editingTx && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Edit Transaction</h3>
              <button 
                onClick={() => setEditingTx(null)}
                aria-label="Cancel editing transaction"
                className="text-slate-500 hover:text-slate-300 text-sm cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!editAmount || isNaN(Number(editAmount)) || Number(editAmount) <= 0) {
                toast.error('Please enter a valid positive amount.');
                return;
              }
              if (!editCategoryId) {
                toast.error('Please select a category.');
                return;
              }
              updateTxMutation.mutate({
                id: editingTx.id,
                data: {
                  type: editType,
                  amount: Number(editAmount),
                  description: editDescription,
                  category_id: Number(editCategoryId),
                  transaction_date: editDate,
                },
              });
            }} className="space-y-4">
              <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setEditType('expense')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    editType === 'expense' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setEditType('income')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    editType === 'income' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Income
                </button>
              </div>

              <div>
                <label htmlFor="edit-tx-amount" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Amount</label>
                <input
                  id="edit-tx-amount"
                  name="amount"
                  type="text"
                  placeholder="e.g. 500"
                  autoComplete="off"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all"
                />
              </div>

              <div>
                <label htmlFor="edit-tx-description" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Description</label>
                <input
                  id="edit-tx-description"
                  name="description"
                  type="text"
                  placeholder="e.g. Uber ride / Salary"
                  autoComplete="off"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all"
                />
              </div>

              <div>
                <label htmlFor="edit-tx-category" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Category</label>
                <select
                  id="edit-tx-category"
                  name="category_id"
                  autoComplete="off"
                  value={editCategoryId}
                  onChange={(e) => setEditCategoryId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all cursor-pointer"
                >
                  <option value="">Select a category</option>
                  {categories?.filter(c => c.type === editType).map((cat) => (
                    <option key={cat.id} value={cat.id} className="bg-slate-950">
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="edit-tx-date" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">Transaction Date</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <Calendar className="w-5 h-5" />
                  </span>
                  <input
                    id="edit-tx-date"
                    name="transaction_date"
                    type="date"
                    autoComplete="off"
                    max={new Date().toISOString().split("T")[0]}
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 pl-11 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/30 transition-all cursor-pointer"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={updateTxMutation.isPending}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-purple-600/10 flex items-center justify-center"
              >
                {updateTxMutation.isPending ? (
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
