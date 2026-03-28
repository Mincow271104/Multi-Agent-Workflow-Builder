import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { AgentNodeData } from '@/types';
import { useWorkflowStore } from '@/stores/workflowStore';
import { Trash2 } from 'lucide-react';

type AgentNodeType = Node<AgentNodeData>;

function AgentNodeComponent({ id, data, selected }: NodeProps<AgentNodeType>) {
  const deleteNode = useWorkflowStore((s) => s.deleteNode);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);

  const providerClass = `provider-${data.provider}`;
  const isRunning = data.status === 'running' || data.status === 'streaming';
  const isCompleted = data.status === 'completed';
  const isFailed = data.status === 'failed';

  return (
    <div
      onClick={() => setSelectedNode(id)}
      className={`
        glass-card relative min-w-[180px] cursor-pointer p-3 transition-all
        ${selected ? 'border-[var(--color-accent)] shadow-lg shadow-[var(--color-accent)]/10' : ''}
        ${isRunning ? 'agent-running' : ''}
        ${isCompleted ? 'border-[var(--color-success)]/50' : ''}
        ${isFailed ? 'border-[var(--color-error)]/50' : ''}
      `}
    >
      {/* Input Handle (top) — from previous agent in linear chain */}
      {data.role.toLowerCase() !== 'orchestrator' && (
        <Handle
          type="target"
          position={Position.Top}
          id="top"
          className="!bg-[#06b6d4] !border-[var(--color-bg-card)]"
        />
      )}

      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getRoleIcon(data.role)}</span>
          <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate max-w-[120px]">
            {data.label}
          </span>
        </div>
      </div>

      {/* Provider badge */}
      <div className="flex items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${providerClass}`}>
          {data.provider}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] truncate">{data.model}</span>
      </div>

      {/* Status indicator */}
      {data.status && data.status !== 'idle' && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${
            isRunning ? 'bg-[var(--color-warning)] animate-pulse' :
            isCompleted ? 'bg-[var(--color-success)]' :
            'bg-[var(--color-error)]'
          }`} />
          <span className="text-[10px] text-[var(--color-text-muted)] capitalize">{data.status}</span>
        </div>
      )}

      {/* Output Handle (bottom) — to next agent in linear chain */}
      {data.role.toLowerCase() !== 'orchestrator' && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom"
          className="!bg-[#06b6d4] !border-[var(--color-bg-card)]"
        />
      )}
    </div>
  );
}

function getRoleIcon(role: string): string {
  const icons: Record<string, string> = {
    researcher: '🔍',
    writer: '✍️',
    critic: '🧐',
    publisher: '📢',
    orchestrator: '🎯',
    summarizer: '📝',
    coder: '💻',
    translator: '🌐',
    custom: '🤖',
  };
  return icons[role?.toLowerCase()] || '🤖';
}

export default memo(AgentNodeComponent);
