import { useState } from 'react';
import { GripVertical, Search, Pin, Pencil, Trash2, Plus } from 'lucide-react';
import { useAgentTemplateStore, AgentTemplate } from '@/stores/agentTemplateStore';
import AgentTemplateModal from './AgentTemplateModal';

export default function AgentSidebar() {
  const { templates, deleteTemplate, togglePin } = useAgentTemplateStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<AgentTemplate | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filter and sort templates (Pinned first)
  const filteredTemplates = templates
    .filter((t) => t.label.toLowerCase().includes(searchQuery.toLowerCase()) || Object.values(t).some(v => typeof v === 'string' && v.toLowerCase().includes(searchQuery.toLowerCase())))
    .sort((a, b) => {
      if (a.isPinned === b.isPinned) return 0;
      return a.isPinned ? -1 : 1;
    });

  const onDragStart = (e: React.DragEvent, template: AgentTemplate) => {
    // We send the whole template data so the canvas can instantiate a node with these defaults
    e.dataTransfer.setData('application/agentTemplate', JSON.stringify(template));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleEdit = (template: AgentTemplate) => {
    setEditingTemplate(template);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingTemplate(null);
    setIsModalOpen(true);
  };

  return (
    <>
      <div className="flex w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] h-full">
        {/* Header & Actions */}
        <div className="border-b border-[var(--color-border)] px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-primary)]">
              Agent Library
            </h2>
            <button
              onClick={handleAddNew}
              className="p-1 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors"
              title="Create new agent template"
            >
              <Plus size={14} />
            </button>
          </div>
          
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-md py-1.5 pl-8 pr-3 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            />
          </div>
        </div>

        {/* Templates List */}
        <div id="agent-sidebar-scroll" className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          <div className="flex flex-col gap-2">
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-6 text-xs text-[var(--color-text-muted)] italic">
                No agents found.
              </div>
            ) : (
              filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  draggable
                  data-template-role={template.role}
                  onDragStart={(e) => onDragStart(e, template)}
                  className="group relative glass-card flex cursor-grab items-center gap-3 p-3 transition-all hover:border-[var(--color-border-bright)] hover:bg-[var(--color-bg-card-hover)] active:cursor-grabbing"
                >
                  <GripVertical size={14} className="text-[var(--color-text-muted)] shadow-none shrink-0" />
                  <span className="text-lg shrink-0 pointer-events-none">{template.icon}</span>
                  <div className="min-w-0 flex-1 pointer-events-none">
                    <div className="text-sm font-medium text-[var(--color-text-primary)] truncate" title={template.label}>
                      {template.label}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      {template.defaultProvider}
                    </div>
                  </div>

                  {/* Hover Actions */}
                  <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--color-bg-secondary)]/90 backdrop-blur-sm p-1 rounded-md shadow-md">
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(template.id); }}
                      className={`p-1 rounded hover:bg-[var(--color-bg-primary)] transition-colors ${template.isPinned ? 'text-yellow-500 opacity-100' : 'text-[var(--color-text-muted)]'}`}
                      title={template.isPinned ? "Unpin Agent" : "Pin Agent"}
                    >
                      <Pin size={12} className={template.isPinned ? "fill-current" : ""} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(template); }}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-blue-400 hover:bg-[var(--color-bg-primary)] transition-colors"
                      title="Edit Agent"
                    >
                      <Pencil size={12} />
                    </button>
                    {!(template.isDefault || ['orchestrator', 'researcher', 'writer', 'critic', 'publisher'].includes(template.role)) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteTemplate(template.id); }}
                        className="p-1 rounded text-[var(--color-text-muted)] hover:text-red-400 hover:bg-[var(--color-bg-primary)] transition-colors"
                        title="Delete Agent"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  {/* Persistent Pin Indicator (when not hovering) */}
                  {template.isPinned && (
                    <div className="group-hover:hidden text-yellow-500 absolute top-2 right-2">
                       <Pin size={10} className="fill-current" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="border-t border-[var(--color-border)] p-3 shrink-0 bg-[var(--color-bg-secondary)]/50">
          <div className="text-[9px] font-bold tracking-widest uppercase text-[var(--color-text-muted)] mb-2">Providers</div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[var(--color-ollama)] shadow-[0_0_8px_var(--color-ollama)]" />
              <span className="text-[10px] text-[var(--color-text-muted)]">Ollama (Local)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[var(--color-groq)] shadow-[0_0_8px_var(--color-groq)]" />
              <span className="text-[10px] text-[var(--color-text-muted)]">Groq (Cloud)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[var(--color-gemini)] shadow-[0_0_8px_var(--color-gemini)]" />
              <span className="text-[10px] text-[var(--color-text-muted)]">Gemini (Google)</span>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <AgentTemplateModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          existingTemplate={editingTemplate}
        />
      )}
    </>
  );
}
