import { useState, useEffect } from 'react';
import { Save, Play, Plus, LogOut, Loader2, ChevronDown, Square } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '@/lib/socket';

interface TopBarProps {
  workflowName: string;
  onSave: () => void;
  onRun: () => void;
  isSaving: boolean;
}

export default function TopBar({ workflowName, onSave, onRun, isSaving }: TopBarProps) {
  const { user, logout } = useAuthStore();
  const { isRunning, executionId } = useWorkflowStore();
  const [isStopping, setIsStopping] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isRunning) setIsStopping(false);
  }, [isRunning]);

  const handleStop = () => {
    setIsStopping(true);
    const socket = getSocket();
    if (socket && executionId) {
      socket.emit('stopExecution', { executionId });
    }
  };

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

        {isRunning ? (
          <button
            onClick={handleStop}
            disabled={isStopping}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-error)] px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-[var(--color-error)]/20 hover:bg-[var(--color-error)]/80 transition disabled:opacity-50"
          >
            {isStopping ? <Loader2 size={14} className="animate-spin" /> : <Square fill="currentColor" size={12} />}
            {isStopping ? 'Stopping...' : 'Stop Workflow'}
          </button>
        ) : (
          <button
            onClick={onRun}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-[var(--color-accent)]/20 hover:bg-[var(--color-accent-hover)] transition"
          >
            <Play size={14} />
            Run Workflow
          </button>
        )}
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
