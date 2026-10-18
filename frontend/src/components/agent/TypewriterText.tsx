import React, { useState, useEffect, useRef } from 'react';
import { MarkdownMessage } from './MarkdownMessage';
import { Square } from 'lucide-react';

interface TypewriterTextProps {
  content: string;
  animate?: boolean;
  initialRevealedLength?: number;
  onComplete?: () => void;
  onStop?: (revealedText: string) => void;
  onProgress?: (revealedLength: number) => void;
  onTick?: () => void;
  /** Configurable interval in ms between text reveal ticks (default: 20ms) */
  intervalMs?: number;
}

export const TypewriterText: React.FC<TypewriterTextProps> = ({
  content,
  animate = false,
  initialRevealedLength = 0,
  onComplete,
  onStop,
  onProgress,
  onTick,
  intervalMs = 20
}) => {
  const shouldAnimate = animate && content.length > 0;
  const startLength = shouldAnimate ? Math.min(Math.max(0, initialRevealedLength), content.length) : content.length;
  const alreadyFinished = startLength >= content.length;
  const hasCompletedRef = useRef(!shouldAnimate || alreadyFinished);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [displayedLength, setDisplayedLength] = useState(() => startLength);
  const [isTyping, setIsTyping] = useState(() => shouldAnimate && !alreadyFinished);

  const onCompleteRef = useRef(onComplete);
  const onStopRef = useRef(onStop);
  const onProgressRef = useRef(onProgress);
  const onTickRef = useRef(onTick);
  const pauseCountRef = useRef(0);
  const tickCounterRef = useRef(0);

  useEffect(() => {
    if (shouldAnimate && alreadyFinished) {
      onCompleteRef.current?.();
    }
  }, [shouldAnimate, alreadyFinished]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  const handleStop = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Immediately cancel any active timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    hasCompletedRef.current = true;
    setIsTyping(false);
    const partialText = content.slice(0, displayedLength);
    onStopRef.current?.(partialText);
  };

  useEffect(() => {
    if (!shouldAnimate || hasCompletedRef.current) {
      return;
    }

    const totalChars = content.length;
    // Pacing:
    // Short: 1 char/tick (~50 chars/sec)
    // Medium: 2 chars/tick (~100 chars/sec)
    // Long: 3 chars/tick (~150 chars/sec)
    // Very long: 5 chars/tick (~250 chars/sec)
    const chunk = totalChars > 1500 ? 5 : totalChars > 800 ? 3 : totalChars > 250 ? 2 : 1;

    timerRef.current = setInterval(() => {
      // Subtle micro-pause at punctuation boundaries (~20ms single tick)
      if (pauseCountRef.current > 0) {
        pauseCountRef.current -= 1;
        return;
      }

      setDisplayedLength(prev => {
        const next = Math.min(prev + chunk, totalChars);
        onProgressRef.current?.(next);

        // Subtle punctuation pause only at sentence ends ('. ', '? ', '! ')
        if (next < totalChars) {
          const charAtNext = content[next - 1];
          const charAfter = content[next];
          if ((charAtNext === '.' || charAtNext === '?' || charAtNext === '!') && (charAfter === ' ' || charAfter === '\n')) {
            pauseCountRef.current = 1;
          }
        }

        if (next >= totalChars) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          hasCompletedRef.current = true;
          setIsTyping(false);
          onCompleteRef.current?.();
          return totalChars;
        }

        // Throttle onTick callback slightly to avoid scroll thrashing
        tickCounterRef.current += 1;
        if (tickCounterRef.current % 3 === 0) {
          onTickRef.current?.();
        }
        return next;
      });
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [content, shouldAnimate, intervalMs]);

  const currentText = isTyping ? content.slice(0, displayedLength) : content;

  return (
    <div className="relative group">
      <MarkdownMessage content={currentText} />
      {isTyping && (
        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-2 select-none">
          <span className="flex items-center gap-1.5 text-purple-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Synthesizing response...
          </span>
          <button
            type="button"
            data-testid="typewriter-stop-button"
            onClick={handleStop}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 shadow-sm transition-all cursor-pointer font-medium text-[11px] active:scale-95"
            title="Stop generating response"
          >
            <Square className="w-2.5 h-2.5 fill-current text-rose-400" />
            <span>Stop generating</span>
          </button>
        </div>
      )}
    </div>
  );
};
