import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnalyticsService, InsightService } from '../services';
import { useAuth } from '../contexts/AuthContext';
import { fmt } from '../utils/currency';
import { useRates } from '../hooks/useRates';
import { 
  BarChart, 
  Bar, 
  Cell, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
} from 'recharts';
import { Brain, AlertCircle, Sparkles, RefreshCw } from 'lucide-react';
import { tooltipStyle, tooltipLabelStyle } from '../utils/theme';
import { FinanceAssistant } from './FinanceAssistant';

export const Analytics: React.FC = () => {
  const { user } = useAuth();
  const { rates } = useRates();
  const cur = user?.currency || 'INR';

  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState<string>('');

  // Queries
  const { 
    data: trends, 
    isLoading: trendsLoading, 
    isError: isTrendsError,
    refetch: refetchTrends 
  } = useQuery({
    queryKey: ['analytics', 'trends'],
    queryFn: () => AnalyticsService.getTrends(12),
  });

  const { 
    data: clusters, 
    isLoading: clustersLoading, 
    isError: isClustersError,
    refetch: refetchClusters 
  } = useQuery({
    queryKey: ['insights', 'clusters'],
    queryFn: () => InsightService.getClusters(),
    retry: false,
  });

  const allMonths: { month: string; income: number; expense: number; net: number }[] = [];
  const trendMap = new Map((trends || []).map((m: { month: string; income: number; expense: number }) => [m.month, m]));
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

  // Polished Skeleton Placeholder for Monthly Cashflow Bar Chart
  const renderCashflowSkeleton = () => (
    <div className="h-96 w-full flex items-end justify-between gap-2.5 px-4 pb-6 pt-12 border-b border-slate-800/40">
      {[45, 68, 32, 85, 52, 40, 72, 88, 50, 62, 78, 92].map((heightPct, idx) => (
        <div key={idx} className="flex-1 flex flex-col items-center gap-2.5 h-full justify-end">
          <div 
            className="w-full bg-slate-800/70 rounded-t-md animate-pulse transition-all duration-300" 
            style={{ height: `${heightPct}%` }}
          />
          <div className="w-8 h-2.5 bg-slate-800/60 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );

  // Polished Skeleton Placeholders for Spending Behavior Clusters (3 cards matching exact dimensions)
  const renderClustersSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[0, 1, 2].map((idx) => (
        <div 
          key={idx} 
          className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between shadow-xl"
        >
          <div>
            <div className="flex justify-between items-start mb-4">
              <div className="h-5 w-20 bg-slate-800/80 rounded-lg animate-pulse" />
              <div className="h-4 w-16 bg-slate-800/50 rounded animate-pulse" />
            </div>
            <div className="h-6 w-36 bg-slate-800/90 rounded mb-2 animate-pulse" />
            <div className="h-3 w-48 bg-slate-800/40 rounded mb-4 animate-pulse" />
          </div>
          <div className="space-y-3 pt-4 border-t border-slate-800/60">
            <div className="flex justify-between items-center">
              <div className="h-3 w-16 bg-slate-800/50 rounded animate-pulse" />
              <div className="h-3 w-20 bg-slate-800/80 rounded animate-pulse" />
            </div>
            <div className="flex justify-between items-center">
              <div className="h-3 w-24 bg-slate-800/50 rounded animate-pulse" />
              <div className="h-3 w-16 bg-slate-800/80 rounded animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header — Stays permanently mounted to prevent layout jumping */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Analytics & Insights</h1>
          <p className="text-sm text-slate-400">Discover long-term cashflow patterns and spending behaviors.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAssistantPrompt('Explain these insights and suggest ways to improve my spending.');
            setIsAssistantOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/20 border border-purple-500/30 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer shrink-0"
        >
          <Sparkles className="w-4 h-4 text-purple-200" />
          <span>Ask AI about these insights</span>
        </button>
      </div>

      {/* Cashflow Monthly Difference Card */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Monthly Cashflow Difference</h3>
            <p className="text-xs text-slate-500">Net savings (income − expenses) each month. Green means surplus, red means deficit.</p>
          </div>
          {isTrendsError && (
            <button
              type="button"
              onClick={() => refetchTrends()}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg hover:bg-rose-500/20 transition-all cursor-pointer self-start sm:self-auto"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          )}
        </div>

        <div className="h-96 w-full">
          {trendsLoading ? (
            renderCashflowSkeleton()
          ) : isTrendsError ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-slate-950/40 rounded-xl border border-slate-800/60">
              <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
              <p className="text-sm font-medium text-slate-300 mb-1">Unable to load cashflow analytics</p>
              <p className="text-xs text-slate-500 mb-4">An error occurred while fetching monthly cashflow trends.</p>
              <button
                type="button"
                onClick={() => refetchTrends()}
                className="px-4 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
            </div>
          ) : allMonths.every(m => m.income === 0 && m.expense === 0) ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs bg-slate-950/30 rounded-xl border border-slate-800/40 p-6 text-center">
              <AlertCircle className="w-8 h-8 text-slate-600 mb-2" />
              <p className="font-medium text-slate-400 mb-1">No transaction history recorded yet</p>
              <p className="text-slate-500 max-w-sm">Add income and expense transactions to visualize your 12-month net cashflow trends.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={allMonths}>
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, cur, rates, 'INR')} />
                <Tooltip 
                  contentStyle={tooltipStyle()}
                  labelStyle={tooltipLabelStyle()}
                  itemStyle={{ color: 'inherit' }}
                  formatter={(value) => fmt(Number(value) || 0, cur, rates, 'INR')}
                />
                <Bar dataKey="net" radius={[4, 4, 0, 0]} name="Net Savings">
                  {allMonths.map((d, i) => (
                    <Cell key={i} fill={d.net >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Spending Behavior Groups */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <h3 className="text-base font-bold text-slate-200">Spending Behavior Groups</h3>
          </div>
          <div className="flex items-center gap-2">
            {isClustersError && (
              <button
                type="button"
                onClick={() => refetchClusters()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg hover:bg-rose-500/20 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry Groups</span>
              </button>
            )}
            {clusters && clusters.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setAssistantPrompt('Analyze my spending behavior groups and suggest which categories have the highest potential for reduction.');
                  setIsAssistantOpen(true);
                }}
                className="text-xs font-medium text-purple-300 hover:text-white px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 transition-all cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Ask AI about groups</span>
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
          Groups your monthly spending into behavioral categories based on frequency and average transaction sizes.
        </p>

        {clustersLoading ? (
          renderClustersSkeleton()
        ) : isClustersError ? (
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center text-slate-500 text-xs">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-400" />
            <p className="text-sm font-medium text-slate-300 mb-1">Failed to load spending behavior groups</p>
            <p className="text-xs text-slate-500 mb-4">Unable to retrieve ML behavioral clusters.</p>
            <button
              type="button"
              onClick={() => refetchClusters()}
              className="px-4 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Analysis</span>
            </button>
          </div>
        ) : !clusters || clusters.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center text-slate-500 text-xs">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-600 animate-pulse" />
            Not enough data to identify spending groups. Add more transaction history across multiple months.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clusters.map((cluster) => (
              <div 
                key={cluster.cluster_id} 
                className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between hover:border-slate-700/60 transition-all duration-300 shadow-xl"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-950 px-2.5 py-1 rounded-lg">
                      Group #{cluster.cluster_id + 1}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      {cluster.count} purchases
                    </span>
                  </div>
                  
                  <h4 className="text-lg font-bold text-white mb-1">{cluster.name}</h4>
                  <p className="text-xs text-slate-500 mb-4 truncate">
                    Categories: {cluster.categories.join(', ')}
                  </p>
                </div>

                <div className="space-y-2 pt-4 border-t border-slate-800/60">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Total Spent</span>
                    <span className="font-semibold text-slate-200">{fmt(cluster.total_amount, cur, rates)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Average Transaction</span>
                    <span className="font-semibold text-slate-200">{fmt(cluster.avg_amount, cur, rates)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Embedded Assistant Drawer (Opens without navigating away) */}
      {isAssistantOpen && (
        <FinanceAssistant
          isDrawer={true}
          onClose={() => setIsAssistantOpen(false)}
          initialPrompt={assistantPrompt}
          initialPeriod="ytd"
        />
      )}
    </div>
  );
};
