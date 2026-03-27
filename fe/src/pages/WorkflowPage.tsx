// ===================================================================
// WorkflowPage — Main builder layout with split-view execution panel
// Integrates Socket.io for real-time agent execution events
// ===================================================================

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import { workflowApi, executionApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useWorkflowStore } from '@/stores/workflowStore';
import TopBar from '@/components/layout/TopBar';
import AgentSidebar from '@/components/workflow/AgentSidebar';
import WorkflowCanvas from '@/components/workflow/WorkflowCanvas';
import PropertiesPanel from '@/components/workflow/PropertiesPanel';
import ExecutionPanel from '@/components/workflow/ExecutionPanel';
import type { Workflow, AgentStepLog } from '@/types';

export default function WorkflowPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [inputPrompt, setInputPrompt] = useState('');
  const [showInputModal, setShowInputModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const {
    nodes, edges, setNodes, setEdges,
    startExecution, onAgentStarted, onAgentStream, onAgentFinished,
    onExecutionCompleted, onExecutionError,
    showExecution, resetExecution,
  } = useWorkflowStore();

  // ── Show toast notification ─────────────────────────────────
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Load workflow from API ──────────────────────────────────
  useEffect(() => {
    if (!id) return;
    workflowApi.getById(id).then((res) => {
      if (res.data) {
        setWorkflow(res.data);
        if (res.data.config?.nodes) setNodes(res.data.config.nodes);
        if (res.data.config?.edges) setEdges(res.data.config.edges);
      }
    }).catch(() => navigate('/'));
  }, [id, navigate, setNodes, setEdges]);

  // ── Socket.io — Real-time execution events ──────────────────
  useEffect(() => {
    if (!id) return;
    const socket = getSocket();

    // Join the workflow room for scoped events
    socket.emit('joinWorkflow', { workflowId: id });

    // Agent lifecycle events (emitted by orchestrator)
    socket.on('agent:output', (data) => {
      const nodeId = data.nodeId || data.agentId || '';
      
      switch (data.status) {
        case 'running':
          console.log('[Exec] Agent started:', data.agentName);
          onAgentStarted({
            nodeId,
            agentName: data.agentName || data.name || 'Agent',
            role: data.role || 'agent',
            provider: data.provider || 'ollama',
            model: data.model || 'unknown',
          });
          break;
          
        case 'streaming':
          if (data.chunk) {
            onAgentStream(nodeId, data.chunk);
          }
          break;
          
        case 'completed':
          console.log('[Exec] Agent finished:', data.agentName);
          onAgentFinished({
            nodeId,
            agentName: data.agentName || data.name || 'Agent',
            role: data.role || 'agent',
            output: data.output || data.fullOutput || '',
            durationMs: data.durationMs || 0,
          });
          break;
          
        case 'failed':
          console.error(`[Exec] Agent ${data.agentName} failed:`, data.error);
          showToast(`Agent failed: ${data.error}`, 'error');
          break;
      }
    });

    // Execution workflow wrapper events
    socket.on('executionStarted', (data) => {
      console.log('[Exec] Started:', data);
    });

    socket.on('executionCompleted', (data) => {
      console.log('[Exec] Completed:', data);
      onExecutionCompleted(
        data.result || {},
        (data.logs || []) as AgentStepLog[],
      );
      showToast('✅ Workflow execution completed!', 'success');
    });

    socket.on('executionError', (data) => {
      console.error('[Exec] Error:', data.error);
      onExecutionError(data.error || 'Unknown error occurred');
      showToast(`❌ Execution failed: ${data.error}`, 'error');
    });

    return () => {
      socket.emit('leaveWorkflow', { workflowId: id });
      socket.off('executionStarted');
      socket.off('agent:output');
      socket.off('executionCompleted');
      socket.off('executionError');
    };
  }, [id, onAgentStarted, onAgentStream, onAgentFinished, onExecutionCompleted, onExecutionError, showToast]);

  // ── Save workflow config ────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      await workflowApi.update(id, {
        config: { nodes, edges } as never,
      });
      showToast('💾 Workflow saved successfully!');
    } catch {
      showToast('Failed to save workflow', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [id, nodes, edges, showToast]);

  // ── Run workflow ────────────────────────────────────────────
  const handleRun = useCallback(() => {
    // Reset previous execution before opening modal
    resetExecution();
    setShowInputModal(true);
  }, [resetExecution]);

  const executeWorkflow = useCallback(async () => {
    if (!id || !inputPrompt.trim()) return;
    setShowInputModal(false);

    try {
      // Auto-save before executing
      await workflowApi.update(id, {
        config: { nodes, edges } as never,
      });

      const res = await executionApi.start({ workflowId: id, input: inputPrompt });
      if (res.data?.executionId) {
        startExecution(res.data.executionId);
        showToast('🚀 Workflow execution started!');
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to start execution';
      showToast(msg, 'error');
    }
  }, [id, inputPrompt, nodes, edges, startExecution, showToast]);

  // ── Loading state ───────────────────────────────────────────
  if (!workflow) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
          <span className="text-xs text-[var(--color-text-muted)]">Loading workflow...</span>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="flex h-screen flex-col bg-[var(--color-bg-primary)]">
        <TopBar
          workflowName={workflow.name}
          onSave={handleSave}
          onRun={handleRun}
          isSaving={isSaving}
        />

        {/* ── Main Content Area ────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Agent Sidebar */}
          <AgentSidebar />

          {/* Center: Canvas + Execution Panel (split view) */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <WorkflowCanvas />
            {showExecution && <ExecutionPanel />}
          </div>

          {/* Right: Properties Panel */}
          <PropertiesPanel />
        </div>

        {/* ── Input Modal ──────────────────────────────────────── */}
        {showInputModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="glass-card w-full max-w-lg p-6 shadow-2xl shadow-[var(--color-accent)]/10">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-accent)]/10">
                  <span className="text-xl">🚀</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Run Workflow</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {nodes.length} agent{nodes.length !== 1 ? 's' : ''} configured
                  </p>
                </div>
              </div>

              <p className="mb-3 text-sm text-[var(--color-text-secondary)]">
                Enter your prompt — this will flow through all agents in the pipeline.
              </p>

              <textarea
                autoFocus
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) executeWorkflow();
                }}
                placeholder="E.g. Research the latest trends in AI and write a comprehensive blog post..."
                className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] p-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] resize-y min-h-[120px] placeholder:text-[var(--color-text-muted)]"
                rows={5}
              />

              <p className="mb-4 text-[10px] text-[var(--color-text-muted)]">
                Ctrl+Enter to execute • Config will be auto-saved before running
              </p>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowInputModal(false)}
                  className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={executeWorkflow}
                  disabled={!inputPrompt.trim()}
                  className="rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-[var(--color-accent)]/20 hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition"
                >
                  🚀 Execute
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Toast Notification ────────────────────────────────── */}
        {toast && (
          <div className={`fixed bottom-6 right-6 z-50 animate-slide-up rounded-lg border px-4 py-3 shadow-xl backdrop-blur-sm ${
            toast.type === 'error'
              ? 'border-[var(--color-error)]/30 bg-[var(--color-error)]/10 text-[var(--color-error)]'
              : 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]'
          }`}>
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        )}
      </div>
    </ReactFlowProvider>
  );
}
