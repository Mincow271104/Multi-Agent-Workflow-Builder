// ===================================================================
// Enhanced ExecutionPanel — Real-time streaming logs with step indicator
// ===================================================================

import { useEffect, useRef, useState } from 'react';
import { useWorkflowStore, type ExecutionStep } from '@/stores/workflowStore';
import {
  X, CheckCircle2, XCircle, Loader2, Clock, Zap,
  ChevronRight, RotateCcw, FileText, Terminal,
  Copy,
} from 'lucide-react';

export default function ExecutionPanel() {
  const {
    showExecution, setShowExecution, setActiveTab,
    isRunning, executionId, executionSteps, executionError,
    activeTab, currentAgentId, agentOutputs, executionStartTime,
    resetExecution,
  } = useWorkflowStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Detect manual user scrolling
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // Tolerance of 10px to consider it 'at bottom'
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
    setAutoScroll(isAtBottom);
  };

  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (scrollRef.current && isRunning && autoScroll) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agentOutputs, executionSteps, isRunning, autoScroll]);

  if (!showExecution) return null;

  const completedCount = executionSteps.filter((s) => s.status === 'completed').length;
  const totalCount = executionSteps.length;
  const elapsed = executionStartTime ? Math.floor((Date.now() - executionStartTime) / 1000) : 0;

  return (
    <div className="flex h-[420px] flex-col border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2 shrink-0">
        <div className="flex items-center gap-4">
          {/* Tab Buttons */}
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
              activeTab === 'logs'
                ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <Terminal size={13} /> Execution Logs
          </button>
          <button
            onClick={() => setActiveTab('result')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
              activeTab === 'result'
                ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <FileText size={13} /> Final Result
          </button>

          {/* Status */}
          <div className="flex items-center gap-2 text-xs">
            {isRunning ? (
              <>
                <Loader2 size={13} className="animate-spin text-[var(--color-warning)]" />
                <span className="text-[var(--color-warning)]">Running...</span>
              </>
            ) : executionError ? (
              <>
                <XCircle size={13} className="text-[var(--color-error)]" />
                <span className="text-[var(--color-error)]">Failed</span>
              </>
            ) : executionId ? (
              <>
                <CheckCircle2 size={13} className="text-[var(--color-success)]" />
                <span className="text-[var(--color-success)]">Completed</span>
              </>
            ) : null}

            {(isRunning || executionId) && (
              <span className="flex items-center gap-1 text-[var(--color-text-muted)]">
                <Clock size={11} /> {elapsed}s
                {totalCount > 0 && (
                  <span className="ml-1">
                    • {completedCount}/{totalCount} agents
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!isRunning && executionId && (
            <button
              onClick={resetExecution}
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition"
              title="Reset"
            >
              <RotateCcw size={14} />
            </button>
          )}
          <button
            onClick={() => setShowExecution(false)}
            className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Progress Bar ────────────────────────────────────────── */}
      {isRunning && totalCount > 0 && (
        <div className="h-1 shrink-0 bg-[var(--color-bg-card)]">
          <div
            className="h-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-gemini)] transition-all duration-500"
            style={{ width: `${(completedCount / Math.max(totalCount, 1)) * 100}%` }}
          />
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────── */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto relative">
        {activeTab === 'logs' ? (
          <LogsView
            steps={executionSteps}
            currentAgentId={currentAgentId}
            agentOutputs={agentOutputs}
            executionError={executionError}
            isRunning={isRunning}
          />
        ) : (
          <ResultView />
        )}
      </div>
    </div>
  );
}

// ─── Logs Tab ─────────────────────────────────────────────────────

function LogsView({
  steps, currentAgentId, agentOutputs, executionError, isRunning,
}: {
  steps: ExecutionStep[];
  currentAgentId: string | null;
  agentOutputs: Record<string, string>;
  executionError: string | null;
  isRunning: boolean;
}) {
  if (steps.length === 0 && !isRunning && !executionError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Zap size={32} className="mx-auto mb-3 text-[var(--color-text-muted)]" />
          <p className="text-sm text-[var(--color-text-muted)]">Click "Run Workflow" to start</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Step timeline */}
      {steps.map((step, idx) => (
        <StepCard
          key={step.nodeId}
          step={step}
          stepNumber={idx + 1}
          totalSteps={steps.length}
          isActive={step.nodeId === currentAgentId}
          streamOutput={agentOutputs[step.nodeId]}
        />
      ))}

      {/* Error display */}
      {executionError && (
        <div className="rounded-lg bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle size={16} className="text-[var(--color-error)]" />
            <span className="text-sm font-semibold text-[var(--color-error)]">Execution Failed</span>
          </div>
          <p className="text-xs text-[var(--color-error)]/80 whitespace-pre-wrap">{executionError}</p>
        </div>
      )}

      {/* Waiting indicator */}
      {isRunning && !currentAgentId && steps.length === 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-[var(--color-bg-card)] p-4 border border-[var(--color-border)]">
          <Loader2 size={18} className="animate-spin text-[var(--color-accent)]" />
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Initializing workflow...</p>
            <p className="text-xs text-[var(--color-text-muted)]">Preparing agents and building execution graph</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step Card ────────────────────────────────────────────────────

function StepCard({
  step, stepNumber, totalSteps, isActive, streamOutput,
}: {
  step: ExecutionStep;
  stepNumber: number;
  totalSteps: number;
  isActive: boolean;
  streamOutput?: string;
}) {
  const providerBadge = `provider-${step.provider.toLowerCase()}`;
  const isCompleted = step.status === 'completed';
  const isFailed = step.status === 'failed';
  const isRunning = step.status === 'running' || step.status === 'streaming';
  const displayOutput = streamOutput || step.output;
  
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!displayOutput) return;
    navigator.clipboard.writeText(displayOutput);
    setCopied(true);
    // You could also add a toast here if you have a toast library
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-lg border p-4 transition-all ${
      isActive
        ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/5 shadow-lg shadow-[var(--color-accent)]/5'
        : isCompleted
        ? 'border-[var(--color-success)]/20 bg-[var(--color-bg-card)]'
        : isFailed
        ? 'border-[var(--color-error)]/20 bg-[var(--color-bg-card)]'
        : 'border-[var(--color-border)] bg-[var(--color-bg-card)]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          {/* Step indicator */}
          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
            isCompleted ? 'bg-[var(--color-success)] text-white' :
            isFailed ? 'bg-[var(--color-error)] text-white' :
            isRunning ? 'bg-[var(--color-accent)] text-white' :
            'bg-[var(--color-bg-input)] text-[var(--color-text-muted)]'
          }`}>
            {isCompleted ? '✓' : isRunning ? '⟳' : stepNumber}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              {step.agentName}
            </span>
            <ChevronRight size={12} className="text-[var(--color-text-muted)]" />
            <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${providerBadge}`}>
              {step.provider}
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)]">{step.model}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {step.durationMs && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
              <Clock size={10} /> {(step.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {displayOutput && (
            <button
              onClick={handleCopy}
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)] transition"
              title="Copy Log"
            >
              {copied ? <CheckCircle2 size={12} className="text-[var(--color-success)]" /> : <Copy size={12} />}
            </button>
          )}
          {isRunning && (
            <Loader2 size={14} className="animate-spin text-[var(--color-accent)]" />
          )}
        </div>
      </div>

      {/* Status message */}
      {isRunning && !displayOutput && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-accent)] mt-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
          {step.agentName} is thinking...
        </div>
      )}

      {/* Streaming / Completed output */}
      {displayOutput && (
        <div className={`mt-2 rounded-md bg-[var(--color-bg-primary)] border border-[var(--color-border)] p-3 max-h-40 overflow-y-auto`}>
          <pre className={`text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed font-[var(--font-sans)] ${
            isRunning ? 'streaming-cursor' : ''
          }`}>
            {displayOutput}
          </pre>
        </div>
      )}

      {/* Progress bar for individual step */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
        <span>Step {stepNumber} of {totalSteps}</span>
        {isCompleted && <span className="text-[var(--color-success)]">✓ completed</span>}
        {isFailed && <span className="text-[var(--color-error)]">✗ failed</span>}
      </div>
    </div>
  );
}

// ─── Result Tab ───────────────────────────────────────────────────

function ResultView() {
  const { finalResult, executionSteps, executionError } = useWorkflowStore();

  if (executionError) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 p-6 text-center">
          <XCircle size={40} className="mx-auto mb-3 text-[var(--color-error)]" />
          <h3 className="text-sm font-bold text-[var(--color-error)] mb-2">Execution Failed</h3>
          <p className="text-xs text-[var(--color-error)]/80">{executionError}</p>
        </div>
      </div>
    );
  }

  if (!finalResult && executionSteps.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <FileText size={32} className="mx-auto mb-3 text-[var(--color-text-muted)]" />
          <p className="text-sm text-[var(--color-text-muted)]">Results appear here after execution</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Final result */}
      {finalResult && (
        <div className="rounded-lg border border-[var(--color-success)]/20 bg-[var(--color-bg-card)] p-1">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)]">
            <CheckCircle2 size={14} className="text-[var(--color-success)]" />
            <span className="text-xs font-semibold text-[var(--color-success)]">Final Output</span>
            {executionSteps.length > 0 && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                — {executionSteps[executionSteps.length - 1]?.agentName}
              </span>
            )}
            <button
              onClick={() => navigator.clipboard.writeText(finalResult)}
              className="ml-auto rounded px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)] transition"
            >
              Copy
            </button>
          </div>
          <div className="p-4 max-h-72 overflow-y-auto">
            <pre className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed font-[var(--font-sans)]">
              {finalResult}
            </pre>
          </div>
        </div>
      )}

      {/* All intermediate outputs */}
      {executionSteps.length > 1 && (
        <div className="mt-4">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
            Intermediate Outputs
          </h4>
          <div className="flex flex-col gap-2">
            {executionSteps.slice(0, -1).map((step) => (
              <details key={step.nodeId} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]">
                <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)]">
                  <CheckCircle2 size={12} className="text-[var(--color-success)]" />
                  <span className="font-medium">{step.agentName}</span>
                  {step.durationMs && (
                    <span className="text-[var(--color-text-muted)]">({(step.durationMs / 1000).toFixed(1)}s)</span>
                  )}
                </summary>
                <div className="px-3 pb-3">
                  <pre className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                    {step.output.slice(0, 1000)}
                    {step.output.length > 1000 && '...'}
                  </pre>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
