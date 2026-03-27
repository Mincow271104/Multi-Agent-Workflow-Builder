import { AGENT_TEMPLATES } from '@/types';
import { GripVertical } from 'lucide-react';

export default function AgentSidebar() {
  const onDragStart = (e: React.DragEvent, template: typeof AGENT_TEMPLATES[0]) => {
    e.dataTransfer.setData('application/agentTemplate', JSON.stringify(template));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="flex w-56 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Agent Nodes
        </h2>
        <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">Drag onto canvas</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2">
          {AGENT_TEMPLATES.map((template) => (
            <div
              key={template.role}
              draggable
              onDragStart={(e) => onDragStart(e, template)}
              className="glass-card flex cursor-grab items-center gap-3 p-3 transition-all hover:border-[var(--color-border-bright)] hover:bg-[var(--color-bg-card-hover)] active:cursor-grabbing"
            >
              <GripVertical size={14} className="text-[var(--color-text-muted)] shrink-0" />
              <span className="text-lg shrink-0">{template.icon}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                  {template.label}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)]">
                  {template.defaultProvider}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="border-t border-[var(--color-border)] p-3">
        <div className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)] mb-2">Providers</div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[var(--color-ollama)]" />
            <span className="text-[10px] text-[var(--color-text-muted)]">Ollama (Local)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[var(--color-groq)]" />
            <span className="text-[10px] text-[var(--color-text-muted)]">Groq (Cloud)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[var(--color-gemini)]" />
            <span className="text-[10px] text-[var(--color-text-muted)]">Gemini (Google)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
