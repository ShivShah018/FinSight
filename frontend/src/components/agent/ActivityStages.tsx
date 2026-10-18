import React, { useState, useEffect } from 'react';
import { Bot, Loader2, Database, Sparkles } from 'lucide-react';

interface ActivityStagesProps {
  isLoading: boolean;
}

const STAGES = [
  { label: 'Connecting to FinSight secure database...', icon: Database },
  { label: 'Analyzing your transactions & date boundaries...', icon: Database },
  { label: 'Verifying active budgets & category metrics...', icon: Sparkles },
  { label: 'Formulating grounded financial insights...', icon: Bot }
];

export const ActivityStages: React.FC<ActivityStagesProps> = ({ isLoading }) => {
  const [currentStageIdx, setCurrentStageIdx] = useState(0);

  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      setCurrentStageIdx(prev => (prev < STAGES.length - 1 ? prev + 1 : prev));
    }, 1800);

    return () => {
      clearInterval(interval);
      setCurrentStageIdx(0);
    };
  }, [isLoading]);

  if (!isLoading) return null;

  const currentStage = STAGES[currentStageIdx];
  const Icon = currentStage.icon;

  return (
    <div className="flex items-start gap-3 my-3 p-3.5 rounded-2xl bg-slate-900/90 border border-purple-500/30 shadow-lg backdrop-blur-sm animate-in fade-in duration-300 max-w-md">
      <div className="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/30">
        <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
      </div>
      <div className="space-y-1.5 flex-1 min-w-0">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white tracking-tight flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5 text-purple-400" />
            FinSight AI Working
          </span>
          <span className="text-[11px] text-purple-400 font-mono">
            {currentStageIdx + 1}/{STAGES.length}
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-normal truncate">
          {currentStage.label}
        </p>
        {/* Subtle step indicators */}
        <div className="flex items-center gap-1 pt-0.5">
          {STAGES.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i < currentStageIdx 
                  ? 'w-4 bg-emerald-500' 
                  : i === currentStageIdx 
                    ? 'w-6 bg-purple-500 animate-pulse' 
                    : 'w-2 bg-slate-800'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
