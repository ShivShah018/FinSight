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
const LOADING_MESSAGES = [
  'Analyzing your spending patterns…',
  'Connecting the dots in your finances…',
  'Uncovering insights from your transactions…',
  'Almost there — preparing your insights…'
];

export const Analytics: React.FC = () => {
  const { user } = useAuth();
  const { rates } = useRates();
  const cur = user?.currency || 'INR';

  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState<string>('');

  // Animated message rotation state for premium loading experience
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [isFading, setIsFading] = useState(false);

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

  const isAnyLoading = trendsLoading || clustersLoading;

  // Rotate through catchy insights messages while loading
  React.useEffect(() => {
    if (!isAnyLoading) return;

    const interval = setInterval(() => {
      setIsFading(true);
      const timer = setTimeout(() => {
        setLoadingMsgIdx((prev) => (prev + 1) % LOADING_MESSAGES.length);
        setIsFading(false);
      }, 300);
      return () => clearTimeout(timer);
    }, 2800);

    return () => clearInterval(interval);
  }, [isAnyLoading]);

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
            className="w-full bg-slate-800/70 rounded-t-md animate-pulse transition-all duration-300 motion-reduce:animate-none"
            style={{ height: `${heightPct}%` }}
          />
          <div className="w-8 h-2.5 bg-slate-800/60 rounded animate-pulse motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );

  // Premium Centered Animated Loading Experience with Glowing Orb & Financial Theme
  const renderCrunchingNumbersVisual = () => (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/70 backdrop-blur-[3px] rounded-xl z-10 transition-all duration-500"
      role="status"
      aria-live="polite"
    >
      {/* Glowing Purple / Indigo Gradient Financial Visual */}
      <div className="relative mb-5 flex items-center justify-center">
        {/* Ambient Blur Glow */}
        <div className="absolute -inset-3 bg-gradient-to-r from-purple-600/35 via-indigo-500/35 to-cyan-500/35 rounded-full blur-xl animate-pulse motion-reduce:animate-none" />

        {/* Subtle Expanding Radar Ring */}
        <div className="absolute -inset-2 rounded-2xl border border-purple-500/25 animate-ping opacity-25 motion-reduce:animate-none" />

        {/* Floating Ambient Particles */}
        <span className="absolute -top-1.5 -right-2 w-1.5 h-1.5 rounded-full bg-cyan-300/80 animate-ping opacity-60 motion-reduce:hidden" />
        <span className="absolute -bottom-1 -left-2 w-2 h-2 rounded-full bg-purple-400/70 animate-pulse opacity-75 motion-reduce:hidden" />
        <span className="absolute top-1/2 -right-3.5 w-1 h-1 rounded-full bg-indigo-300/80 animate-bounce [animation-delay:-0.5s] motion-reduce:hidden" />

        {/* Central Orb Container */}
        <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-400 p-[2px] shadow-xl shadow-purple-600/30 flex items-center justify-center">
          <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center gap-1.5 px-3">
            {/* Animated Pulsing Financial Chart Bars */}
            <div className="w-1.5 h-4 bg-emerald-400 rounded-full animate-pulse [animation-duration:1s] motion-reduce:animate-none" />
            <div className="w-1.5 h-7 bg-purple-400 rounded-full animate-pulse [animation-duration:1.2s] [animation-delay:0.2s] motion-reduce:animate-none" />
            <div className="w-1.5 h-5 bg-indigo-400 rounded-full animate-pulse [animation-duration:0.9s] [animation-delay:0.4s] motion-reduce:animate-none" />
            <div className="w-1.5 h-8 bg-cyan-400 rounded-full animate-pulse [animation-duration:1.1s] [animation-delay:0.1s] motion-reduce:animate-none" />
          </div>
        </div>
      </div>

      {/* Main Catchy Heading with Animated Dots */}
      <div className="flex items-center gap-1.5 text-slate-100 font-bold text-base sm:text-lg tracking-tight mb-2">
        <span>Crunching your numbers</span>
        <span className="inline-flex items-center gap-1 ml-0.5" aria-hidden="true">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.3s] motion-reduce:animate-none" />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s] motion-reduce:animate-none" />
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce motion-reduce:animate-none" />
        </span>
      </div>

      {/* Rotating Subtitle with Smooth Fade Transition */}
      <div className="h-6 flex items-center justify-center">
        <p
          className={`text-xs sm:text-sm text-purple-300 font-medium transition-all duration-300 ${
            isFading ? 'opacity-0 transform -translate-y-1' : 'opacity-100 transform translate-y-0'
          } motion-reduce:transition-none`}
        >
          {LOADING_MESSAGES[loadingMsgIdx]}
        </p>
      </div>

      {/* Subtle Financial Progress Accent */}
      <div className="w-36 h-1 bg-slate-800/80 rounded-full overflow-hidden mt-4">
        <div className="w-full h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-400 animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  );

  // Polished Skeleton Placeholders for Spending Behavior Clusters (3 cards matching exact dimensions)
  const renderClustersSkeleton = () => (
    <div className="relative">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between shadow-xl"
          >
            <div>
              <div className="flex justify-between items-start mb-4">
                <div className="h-5 w-20 bg-slate-800/80 rounded-lg animate-pulse motion-reduce:animate-none" />
                <div className="h-4 w-16 bg-slate-800/50 rounded animate-pulse motion-reduce:animate-none" />
              </div>
              <div className="h-6 w-36 bg-slate-800/90 rounded mb-2 animate-pulse motion-reduce:animate-none" />
              <div className="h-3 w-48 bg-slate-800/40 rounded mb-4 animate-pulse motion-reduce:animate-none" />
            </div>
            <div className="space-y-3 pt-4 border-t border-slate-800/60">
              <div className="flex justify-between items-center">
                <div className="h-3 w-16 bg-slate-800/50 rounded animate-pulse motion-reduce:animate-none" />
                <div className="h-3 w-20 bg-slate-800/80 rounded animate-pulse motion-reduce:animate-none" />
              </div>
              <div className="flex justify-between items-center">
                <div className="h-3 w-24 bg-slate-800/50 rounded animate-pulse motion-reduce:animate-none" />
                <div className="h-3 w-16 bg-slate-800/80 rounded animate-pulse motion-reduce:animate-none" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* If cashflow has loaded but clusters are still calculating, show localized subtle status */}
      {!trendsLoading && clustersLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] rounded-2xl">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900/90 border border-purple-500/30 shadow-xl shadow-purple-900/20 text-xs font-semibold text-purple-300">
            <Brain className="w-4 h-4 text-purple-400 animate-pulse motion-reduce:animate-none" />
            <span>Categorizing spending clusters</span>
            <span className="inline-flex gap-1" aria-hidden="true">
              <span className="w-1 h-1 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1 h-1 rounded-full bg-cyan-400 animate-bounce" />
            </span>
          </div>
        </div>
      )}
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

        <div className="h-96 w-full relative">
          {trendsLoading ? (
            <div className="relative h-full w-full">
              {renderCashflowSkeleton()}
              {renderCrunchingNumbersVisual()}
            </div>
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
