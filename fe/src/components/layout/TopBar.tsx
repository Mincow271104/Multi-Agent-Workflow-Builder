import { Save, Play, Plus, LogOut, Loader2, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useNavigate } from 'react-router-dom';

interface TopBarProps {
  workflowName: string;
  onSave: () => void;
  onRun: () => void;
  isSaving: boolean;
}

export default function TopBar({ workflowName, onSave, onRun, isSaving }: TopBarProps) {
  const { user, logout } = useAuthStore();
  const { isRunning } = useWorkflowStore();
  const navigate = useNavigate();

  return (
    <div className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-lg font-bold text-[var(--color-accent)] hover:opacity-80 transition"
        >
          🤖 MAWB
        </button>
        <ChevronDown size={14} className="text-[var(--color-text-muted)]" />
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate max-w-60">
          {workflowName || 'Untitled Workflow'}
        </span>
      </div>

      {/* Center — Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)] transition"
        >
          <Plus size={14} /> New
        </button>

        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)] transition disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>

        <button
          onClick={onRun}
          disabled={isRunning}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-[var(--color-accent)]/20 hover:bg-[var(--color-accent-hover)] transition disabled:opacity-50"
        >
          {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {isRunning ? 'Running...' : 'Run Workflow'}
        </button>
      </div>

      {/* Right — User */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--color-text-muted)]">{user?.email}</span>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-error)] transition"
          title="Logout"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}
