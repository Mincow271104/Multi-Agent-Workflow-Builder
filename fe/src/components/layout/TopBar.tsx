import { useState, useEffect, useRef } from 'react';
import { Save, Play, Plus, LogOut, Loader2, ChevronDown, Square, Search, Pin, Hand } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useNavigate, useParams } from 'react-router-dom';
import { getSocket } from '@/lib/socket';
import { workflowApi } from '@/lib/api';
import type { Workflow } from '@/types';

interface TopBarProps {
  workflowName: string;
  onSave: () => void;
  onRun: () => void;
  isSaving: boolean;
}

export default function TopBar({ workflowName, onSave, onRun, isSaving }: TopBarProps) {
  const { user, logout } = useAuthStore();
  const { isRunning, executionId, setShowExecution, isHandTrackingEnabled, setHandTrackingEnabled } = useWorkflowStore();
  const [isStopping, setIsStopping] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { id: currentId } = useParams<{ id: string }>();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch workflows when dropdown opens
  useEffect(() => {
    if (showDropdown) {
      setLoading(true);
      workflowApi.getAll().then((res) => {
        setWorkflows(res.data || []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [showDropdown]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isRunning) setIsStopping(false);
  }, [isRunning]);

  const handleStop = () => {
    if (isStopping) return;
    setIsStopping(true);
    // Removed: setShowExecution(false) so the user can continue reading the stopped logs
    const socket = getSocket();
    if (socket && executionId) {
      socket.emit('stopExecution', { executionId });
    }
    setTimeout(() => setIsStopping(false), 2000);
  };

  const getRunStatus = (wf: Workflow): 'Running' | 'Done' | 'Boring' => {
    const latestRun = wf.executions?.[0];
    if (!latestRun) return 'Boring';
    if (latestRun.status === 'RUNNING' || latestRun.status === 'PENDING') return 'Running';
    if (latestRun.status === 'COMPLETED' || latestRun.status === 'FAILED' || latestRun.status === 'CANCELLED') {
      const viewed = JSON.parse(localStorage.getItem('viewed_executions') || '[]');
      if (viewed.includes(latestRun.id)) return 'Boring';
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

  const sortedWorkflows = [...workflows].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const filteredWorkflows = sortedWorkflows.filter(w => 
    w.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4">
      {/* Left */}
      <div className="flex items-center gap-2 relative" ref={dropdownRef}>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-lg font-bold text-[var(--color-accent)] hover:opacity-80 transition"
        >
          🤖 MAWB
        </button>
        
        <div className="flex items-center gap-1.5 ml-1">
          <div className="h-4 w-[1px] bg-[var(--color-border)] mx-1" />
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className={`flex items-center gap-2 rounded-lg px-2 py-1 transition-all hover:bg-[var(--color-bg-card)] ${showDropdown ? 'bg-[var(--color-bg-card)]' : ''}`}
          >
            <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate max-w-40 lg:max-w-60">
              {workflowName || 'Untitled Workflow'}
            </span>
            <ChevronDown size={14} className={`text-[var(--color-text-muted)] transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Workflow Switcher Dropdown */}
        {showDropdown && (
          <div className="glass-card absolute top-full left-0 z-50 mt-2 w-80 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-2">
            <div className="p-3 border-b border-[var(--color-border)]">
              <div className="relative flex items-center">
                <Search size={14} className="absolute left-3 text-[var(--color-text-muted)]" />
                <input 
                  autoFocus
                  type="text"
                  placeholder="Search workflows..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] py-1.5 pl-9 pr-3 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                />
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto p-1 py-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-[var(--color-text-muted)]" />
                </div>
              ) : filteredWorkflows.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-[var(--color-text-muted)]">
                  No workflows found
                </div>
              ) : (
                filteredWorkflows.map((wf) => {
                  const runStatus = getRunStatus(wf);
                  return (
                    <button
                      key={wf.id}
                      onClick={() => {
                        if (wf.id !== currentId) {
                          const latestRun = wf.executions?.[0];
                          if (latestRun) {
                            const viewed = JSON.parse(localStorage.getItem('viewed_executions') || '[]');
                            if (!viewed.includes(latestRun.id)) {
                              viewed.push(latestRun.id);
                              localStorage.setItem('viewed_executions', JSON.stringify(viewed));
                            }
                          }
                          navigate(`/workflow/${wf.id}`);
                        }
                        setShowDropdown(false);
                      }}
                      className={`flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition hover:bg-[var(--color-bg-card-hover)] ${
                        wf.id === currentId ? 'bg-[var(--color-accent)]/10' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          {wf.isPinned && <Pin size={10} className="text-[var(--color-accent)] fill-[var(--color-accent)] shrink-0 rotate-45" />}
                          <span className={`text-xs font-semibold truncate ${wf.id === currentId ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]'}`}>
                            {wf.name}
                          </span>
                        </div>
                        {wf.id === currentId && (
                          <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
                        <span className={`flex items-center gap-1 uppercase tracking-tighter ${
                          runStatus === 'Running' ? 'text-[var(--color-accent)]' :
                          runStatus === 'Done' ? 'text-[var(--color-success)]' :
                          'text-[var(--color-text-muted)] opacity-70'
                        }`}>
                          {runStatus === 'Running' && <div className="h-1 w-1 rounded-full bg-[var(--color-accent)] animate-ping" />}
                          {runStatus === 'Done' && <div className="h-1 w-1 rounded-full bg-[var(--color-success)]" />}
                          {getRunStatusText(wf, runStatus)}
                        </span>
                        <span>•</span>
                        <span>{new Date(wf.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <button 
              onClick={() => { navigate('/'); setShowDropdown(false); }}
              className="flex w-full items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] transition"
            >
              <Plus size={14} /> View all in Dashboard
            </button>
          </div>
        )}
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
            className="flex items-center justify-center gap-1.5 min-w-[130px] rounded-lg bg-[var(--color-error)] px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-[var(--color-error)]/20 hover:bg-[var(--color-error)]/80 transition-all duration-200 disabled:opacity-50"
          >
            {isStopping ? <Loader2 size={14} className="animate-spin" /> : <Square fill="currentColor" size={12} />}
            {isStopping ? 'Stopping...' : 'Stop Workflow'}
          </button>
        ) : (
          <button
            onClick={onRun}
            className="flex items-center justify-center gap-1.5 min-w-[130px] rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-[var(--color-accent)]/20 hover:bg-[var(--color-accent-hover)] transition-all duration-200"
          >
            <Play size={14} />
            Run Workflow
          </button>
        )}
      </div>

      {/* Right — User & Features */}
      <div className="flex items-center gap-3">
        
        {/* Hand Tracking Toggle */}
        <button
          onClick={() => setHandTrackingEnabled(!isHandTrackingEnabled)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-300 ${
            isHandTrackingEnabled 
              ? 'border-transparent bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20 shadow-[0_0_12px_var(--color-success)]/20' 
              : 'border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-bright)]'
          }`}
          title={isHandTrackingEnabled ? "Turn off Hand Tracking" : "Turn on Hand Tracking"}
        >
          <div className="relative flex items-center justify-center">
            <Hand size={14} className={isHandTrackingEnabled ? 'animate-pulse' : ''} />
            {isHandTrackingEnabled && (
               <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-success)]"></span>
               </span>
            )}
          </div>
          {isHandTrackingEnabled ? 'Hand Tracking ON' : 'Hand Tracking OFF'}
        </button>

        <div className="h-4 w-[1px] bg-[var(--color-border)] mx-1" />

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
