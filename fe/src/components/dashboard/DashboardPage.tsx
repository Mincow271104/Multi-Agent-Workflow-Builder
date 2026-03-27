import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { workflowApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { Workflow } from '@/types';
import { Plus, Trash2, Bot, LogOut, Clock, Layers } from 'lucide-react';

export default function DashboardPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const loadWorkflows = async () => {
    try {
      const res = await workflowApi.getAll();
      setWorkflows(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWorkflows(); }, []);

  const createWorkflow = async () => {
    if (!newName.trim()) return;
    await workflowApi.create({ name: newName.trim() });
    setNewName('');
    setShowCreate(false);
    loadWorkflows();
  };

  const deleteWorkflow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this workflow?')) return;
    await workflowApi.delete(id);
    loadWorkflows();
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
          {loading ? (
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
              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  onClick={() => navigate(`/workflow/${wf.id}`)}
                  className="glass-card group cursor-pointer p-5 transition-all hover:border-[var(--color-accent)]/50 hover:shadow-lg hover:shadow-[var(--color-accent)]/5"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)] truncate pr-4">{wf.name}</h3>
                    <button
                      onClick={(e) => deleteWorkflow(wf.id, e)}
                      className="rounded p-1 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--color-error)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {wf.description && (
                    <p className="mb-3 text-xs text-[var(--color-text-muted)] line-clamp-2">{wf.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-muted)]">
                    <span className={`rounded-md px-2 py-0.5 font-semibold uppercase ${
                      wf.status === 'ACTIVE' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' :
                      wf.status === 'DRAFT' ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' :
                      'bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)]'
                    }`}>
                      {wf.status}
                    </span>
                    <span className="flex items-center gap-1"><Bot size={10} /> {wf._count?.agents || 0} agents</span>
                    <span className="flex items-center gap-1"><Clock size={10} /> {new Date(wf.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
