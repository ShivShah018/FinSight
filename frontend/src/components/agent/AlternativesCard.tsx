import React from 'react';
import { 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  ShieldCheck, 
  Layers, 
  HelpCircle,
  XCircle,
  Percent
} from 'lucide-react';
import type { AlternativesData, ProposalAlternative } from '../../types';

interface AlternativesCardProps {
  data: AlternativesData;
  onSelectAlternative: (prompt: string) => void;
  onDismiss?: () => void;
  isLoading?: boolean;
}

export const AlternativesCard: React.FC<AlternativesCardProps> = ({
  data,
  onSelectAlternative,
  onDismiss,
  isLoading = false
}) => {
  const { original_goal, alternatives, fixed_costs_note, follow_up_question } = data;

  return (
    <div className="mt-3.5 rounded-2xl bg-gradient-to-b from-indigo-950/30 via-slate-900 to-slate-900 border border-indigo-500/30 p-4 shadow-xl transition-all hover:border-indigo-500/50">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-500/20 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300">
            <Sparkles className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-indigo-300 uppercase block">
                Evidence-Based Alternatives
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                Budget Unchanged
              </span>
            </div>
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
              <span>Goal: Save ₹{original_goal.target_reduction.toLocaleString('en-IN')}/month</span>
              <span className="text-xs font-normal text-slate-400">
                (Declined: {original_goal.declined_category})
              </span>
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950/60 px-2.5 py-1 rounded-xl border border-slate-800">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>No Changes Applied</span>
        </div>
      </div>

      {/* Fixed vs Flexible Spending Notice */}
      {fixed_costs_note && (
        <div className="mt-3 flex items-start gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
          <Layers className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px] text-slate-300">
            <strong>Fixed Obligations Protected:</strong> {fixed_costs_note}. We focus on variable and flexible spending where practical adjustments won't impact living essentials.
          </p>
        </div>
      )}

      {/* Alternatives Grid */}
      {alternatives && alternatives.length > 0 ? (
        <div className="mt-3.5 space-y-3">
          <span className="text-[11px] font-semibold text-slate-400 block tracking-wide uppercase">
            Recommended Options to Reach Your Target:
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alternatives.map((alt: ProposalAlternative) => (
              <div
                key={alt.id}
                className="flex flex-col justify-between p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-indigo-500/40 transition-all group"
              >
                <div>
                  {/* Category & Impact Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg p-1 rounded-lg bg-slate-900 border border-slate-800">
                        {alt.category_icon || '💡'}
                      </span>
                      <div>
                        <h5 className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                          {alt.title}
                        </h5>
                        <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Flexible Expense
                        </span>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 whitespace-nowrap">
                      {alt.potential_impact}
                    </span>
                  </div>

                  {/* Contribution & Explanation */}
                  <div className="mb-3 space-y-1.5">
                    {alt.contribution_text && (
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-purple-300">
                        <Percent className="w-3 h-3 text-purple-400" />
                        <span>{alt.contribution_text}</span>
                      </div>
                    )}
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {alt.explanation}
                    </p>
                  </div>
                </div>

                {/* Explore Button */}
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => onSelectAlternative(alt.suggested_prompt)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/30 hover:border-indigo-500 transition-all duration-150 disabled:opacity-50 cursor-pointer shadow-sm group-hover:shadow-indigo-900/20"
                >
                  <span>Explore This Option</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 flex items-start gap-2">
          <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            {follow_up_question || 'No additional flexible spending categories were found with enough transaction history to justify a proposal.'}
          </p>
        </div>
      )}

      {/* Secondary Action: Keep current budget / Decline all alternatives */}
      <div className="mt-4 pt-3.5 border-t border-slate-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700/80 transition-all">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-slate-800/90 text-slate-300 mt-0.5 shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">
                Prefer to keep your current budgets and spending?
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Your existing category limits and financial plans remain completely unchanged.
              </p>
            </div>
          </div>

          {onDismiss && (
            <button
              type="button"
              disabled={isLoading}
              onClick={onDismiss}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-700/90 border border-slate-700 hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition-all cursor-pointer shadow-sm shrink-0 whitespace-nowrap disabled:opacity-50"
              aria-label="No thanks, keep it as it is"
            >
              <XCircle className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-300" />
              <span>No thanks, keep it as it is</span>
            </button>
          )}
        </div>

        {/* Safety Note */}
        <p className="mt-2 text-[10px] text-slate-500 leading-tight">
          Exploring an option will analyze your transactions and requires your explicit approval before any budget is updated.
        </p>
      </div>
    </div>
  );
};
