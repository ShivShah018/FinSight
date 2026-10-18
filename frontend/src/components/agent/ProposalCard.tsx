import React from 'react';
import { 
  TrendingDown, 
  TrendingUp, 
  AlertTriangle, 
  Check, 
  X, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Sparkles
} from 'lucide-react';
import type { AgentProposal } from '../../types';
import { fmt as convertCurrency } from '../../utils/currency';

interface ProposalCardProps {
  proposal: AgentProposal;
  rates: Record<string, number>;
  currency: string;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  isActionLoading?: boolean;
}

export const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  rates,
  currency,
  onApprove,
  onReject,
  isActionLoading = false
}) => {
  const currentAmt = typeof proposal.current_amount === 'number' 
    ? proposal.current_amount 
    : parseFloat(proposal.current_amount as unknown as string) || 0;
  const proposedAmt = typeof proposal.proposed_amount === 'number' 
    ? proposal.proposed_amount 
    : parseFloat(proposal.proposed_amount as unknown as string) || 0;

  const diff = Math.round((proposedAmt - currentAmt) * 100) / 100;
  const pctChange = currentAmt > 0 
    ? Math.round(((proposedAmt - currentAmt) / currentAmt) * 1000) / 10 
    : 0;

  const isPending = proposal.status === 'pending';
  const isApproved = proposal.status === 'approved';
  const isRejected = proposal.status === 'rejected';
  const isExpired = proposal.status === 'expired';

  return (
    <div className="mt-3.5 rounded-2xl bg-gradient-to-b from-purple-950/40 via-slate-900 to-slate-900 border border-purple-500/30 p-4 shadow-xl transition-all hover:border-purple-500/50">
      {/* Top Bar with Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-500/20 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300">
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <span className="text-[11px] font-semibold tracking-wider text-purple-300 uppercase block">
              Budget Target Recommendation
            </span>
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>{proposal.category_name || 'Category'}</span>
              <span className="text-xs font-normal text-slate-400">Monthly Limit Adjustment</span>
            </h4>
          </div>
        </div>

        {/* Status indicator */}
        <div>
          {isPending && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <Clock className="w-3 h-3" />
              Pending Your Approval
            </span>
          )}
          {isApproved && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3" />
              Approved & Updated
            </span>
          )}
          {isRejected && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
              <XCircle className="w-3 h-3" />
              Declined
            </span>
          )}
          {isExpired && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
              <AlertTriangle className="w-3 h-3" />
              Expired
            </span>
          )}
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-3 gap-2 my-3 text-center">
        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <span className="text-[11px] text-slate-400 block font-medium">Current Limit</span>
          <span className="text-sm font-bold text-slate-300 mt-0.5 block">
            {convertCurrency(currentAmt, currency, rates)}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30">
          <span className="text-[11px] text-purple-300 block font-medium">Proposed Limit</span>
          <span className="text-sm font-bold text-purple-200 mt-0.5 block">
            {convertCurrency(proposedAmt, currency, rates)}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <span className="text-[11px] text-slate-400 block font-medium">Target Adjustment</span>
          <span className={`text-sm font-bold mt-0.5 block flex items-center justify-center gap-1 ${
            diff < 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {diff < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
            {convertCurrency(Math.abs(diff), currency, rates)} ({diff > 0 ? '+' : ''}{pctChange}%)
          </span>
        </div>
      </div>

      {/* Reasoning */}
      {proposal.reason && (
        <div className="text-xs text-slate-300 bg-slate-950/40 rounded-xl p-3 border border-slate-800/80 mb-3 space-y-1">
          <span className="font-semibold text-slate-200 block text-[11px]">Financial Justification:</span>
          <p className="leading-relaxed text-slate-300">{proposal.reason}</p>
        </div>
      )}

      {/* Financial Safety Disclaimer */}
      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-xs mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-normal text-[11px]">
          <strong>Budget Cap Notice:</strong> Lowering a budget limit adjusts your planned spending cap. It encourages discipline but is not an automatic guarantee that actual future expenses will decrease by this amount.
        </p>
      </div>

      {/* Actions */}
      {isPending && (
        <div className="flex items-center gap-2 pt-1 border-t border-purple-500/20">
          <button
            onClick={() => onApprove(proposal.id)}
            disabled={isActionLoading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Approve & Update Budget</span>
          </button>
          <button
            onClick={() => onReject(proposal.id)}
            disabled={isActionLoading}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-slate-700"
          >
            <X className="w-3.5 h-3.5" />
            <span>Decline</span>
          </button>
        </div>
      )}

      {!isPending && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1 border-t border-slate-800">
          <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
          <span>Requires explicit user authorization before any changes apply to MySQL database.</span>
        </div>
      )}
    </div>
  );
};
