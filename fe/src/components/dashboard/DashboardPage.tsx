import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { workflowApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { Workflow } from '@/types';
import { Plus, Trash2, Bot, LogOut, Clock, Layers, Pin } from 'lucide-react';

export default function DashboardPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const loadWorkflows = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const res = await workflowApi.getAll();
      setWorkflows(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => { 
    loadWorkflows(true); 
  }, []);

  // Polling for concurrent background executions
  useEffect(() => {
    const interval = setInterval(() => {
      loadWorkflows(false);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const createWorkflow = async () => {
    if (!newName.trim()) return;
    await workflowApi.create({ name: newName.trim() });
    setNewName('');
    setShowCreate(false);
    loadWorkflows(true);
  };

  const togglePin = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await workflowApi.togglePin(id);
      loadWorkflows(false);
    } catch (error: any) {
      console.error(error);
    }
  };

  const deleteWorkflow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this workflow?')) return;
    try {
      await workflowApi.delete(id);
      loadWorkflows(true);
    } catch (error: any) {
      console.error(error);
      alert(error.response?.data?.message || 'Failed to delete workflow. Ensure the server is running.');
    }
  };

  const getRunStatus = (wf: Workflow): 'Running' | 'Done' | 'Boring' => {
    const latestRun = wf.executions?.[0];
    if (!latestRun) return 'Boring';
    
    if (latestRun.status === 'RUNNING' || latestRun.status === 'PENDING') {
      return 'Running';
    }
    
    if (latestRun.status === 'COMPLETED' || latestRun.status === 'FAILED' || latestRun.status === 'CANCELLED') {
      const viewed = JSON.parse(localStorage.getItem('viewed_executions') || '[]');
      if (viewed.includes(latestRun.id)) {
        return 'Boring';
      }
      return 'Done';
    }
    
    return 'Boring';
  };

  const getRunStatusText = (wf: Workflow, baseStatus: string) => {
    if (baseStatus === 'Running') {
      const logs = wf.executions?.[0]?.logs || [];
      const total = wf._count?.agents || 1;
      const currentStep = logs.length > 0 ? logs.length : 1;
      const currentAgent = logs.length > 0 ? (logs[logs.length - 1] as any).agentName : 'Preparing';
      return `Running: ${currentStep}/${total} - ${currentAgent}`;
    }
    return baseStatus;
  };

  const handleOpenWorkflow = (wf: Workflow) => {
    const latestRun = wf.executions?.[0];
    if (latestRun && (latestRun.status === 'COMPLETED' || latestRun.status === 'FAILED' || latestRun.status === 'CANCELLED')) {
      const viewed = JSON.parse(localStorage.getItem('viewed_executions') || '[]');
      if (!viewed.includes(latestRun.id)) {
        viewed.push(latestRun.id);
        localStorage.setItem('viewed_executions', JSON.stringify(viewed));
      }
    }
    navigate(`/workflow/${wf.id}`);
  };

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent)] text-white">
            <Bot size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Workflow Builder</h1>
            <p className="text-xs text-[var(--color-text-muted)]">Multi-Agent Orchestration Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--color-text-secondary)]">Welcome, {user?.name}</span>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-error)] transition"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Your Workflows</h2>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[var(--color-accent)]/20 hover:bg-[var(--color-accent-hover)] transition"
            >
              <Plus size={16} /> New Workflow
            </button>
          </div>

          {/* Create Dialog */}
          {showCreate && (
            <div className="glass-card mb-6 flex items-center gap-3 p-4">
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createWorkflow()}
                placeholder="Workflow name..."
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
              />
              <button onClick={createWorkflow} className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-hover)]">
                Create
              </button>
              <button onClick={() => setShowCreate(false)} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)]">
                Cancel
              </button>
            </div>
          )}

          {/* Workflow Grid */}
          {loading && workflows.length === 0 ? (
            <div className="flex justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
            </div>
          ) : workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Layers size={48} className="mb-4 text-[var(--color-text-muted)]" />
              <p className="text-lg font-medium text-[var(--color-text-secondary)]">No workflows yet</p>
              <p className="text-sm text-[var(--color-text-muted)]">Create your first workflow to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workflows.map((wf) => {
                const runStatus = getRunStatus(wf);
                return (
                  <div
                    key={wf.id}
                    onClick={() => handleOpenWorkflow(wf)}
                    className={`glass-card group cursor-pointer p-5 transition-all hover:shadow-lg ${
                      runStatus === 'Running' ? 'border-[var(--color-accent)] shadow-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)]/50' : 
                      runStatus === 'Done' ? 'border-[var(--color-success)] shadow-[var(--color-success)]/10' :
                      'hover:border-[var(--color-accent)]/50 hover:shadow-[var(--color-accent)]/5'
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex items-center gap-2 overflow-hidden flex-1">
                        {wf.isPinned && <Pin size={14} className="text-[var(--color-accent)] fill-[var(--color-accent)] shrink-0 rotate-45" />}
                        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{wf.name}</h3>
                      </div>
                      <div className="flex items-center gap-1 opacity-100 lg:opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={(e) => togglePin(wf.id, e)}
                          className={`rounded p-1 transition-colors ${wf.isPinned ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-accent)]'}`}
                        >
                          <Pin size={14} className={`${wf.isPinned ? 'fill-[var(--color-accent)]' : ''} ${wf.isPinned ? 'rotate-45' : ''}`} />
                        </button>
                        <button
                          onClick={(e) => deleteWorkflow(wf.id, e)}
                          className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {wf.description && (
                      <p className="mb-3 text-xs text-[var(--color-text-muted)] line-clamp-2">{wf.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-muted)] font-medium">
                      
                      {/* Run Status Badge */}
                      <span className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 uppercase tracking-wider ${
                        runStatus === 'Running' ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]' :
                        runStatus === 'Done' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' :
                        'bg-[var(--color-bg-card-hover)] text-[var(--color-text-muted)]'
                      }`}>
                        {runStatus === 'Running' && <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-ping" />}
                        {runStatus === 'Done' && <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />}
                        {runStatus === 'Boring' && <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)]" />}
                        {getRunStatusText(wf, runStatus)}
                      </span>
                      
                      <span className="flex items-center gap-1"><Bot size={10} /> {wf._count?.agents || 0} agents</span>
                      <span className="flex items-center gap-1"><Clock size={10} /> {new Date(wf.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
