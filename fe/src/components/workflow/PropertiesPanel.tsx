import { useWorkflowStore } from '@/stores/workflowStore';
import type { ProviderName } from '@/types';
import { X, Trash2, Lock, LockOpen } from 'lucide-react';

const PROVIDERS: { value: ProviderName; label: string }[] = [
  { value: 'ollama', label: 'Ollama (Local)' },
];

const MODELS: Record<ProviderName, string[]> = {
  ollama: ['qwen2.5:14b'],
  groq: [],
  gemini: [],
};

export default function PropertiesPanel() {
  const { nodes, selectedNodeId, updateNodeData, setSelectedNode, deleteNode } = useWorkflowStore();
  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) {
    return (
      <div className="flex w-72 flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-sm text-[var(--color-text-muted)]">
            Select an agent node<br />to edit its properties
          </p>
        </div>
      </div>
    );
  }

  const data = node.data;

  return (
    <div className="flex w-72 flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Agent Properties
        </h2>
        <button
          onClick={() => setSelectedNode(null)}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
        >
          <X size={14} />
        </button>
      </div>

      {/* Form */}
      <div id="agent-properties-scroll" className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {/* Name */}
          <Field label="Agent Name">
            <input
              type="text"
              value={data.label}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
              className="input-field"
            />
          </Field>

          {/* Role */}
          <Field label="Role">
            <input
              type="text"
              value={data.role}
              onChange={(e) => updateNodeData(node.id, { role: e.target.value })}
              className="input-field"
              placeholder="e.g. Researcher, Writer, Coder"
            />
          </Field>

          {/* Provider */}
          <Field label="AI Provider">
            <select
              value={data.provider}
              onChange={(e) => {
                const provider = e.target.value as ProviderName;
                updateNodeData(node.id, {
                  provider,
                  model: MODELS[provider][0],
                });
              }}
              className="input-field"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </Field>

          {/* Model */}
          <Field label="Model">
            <select
              value={data.model}
              onChange={(e) => updateNodeData(node.id, { model: e.target.value })}
              className="input-field"
            >
              {MODELS[data.provider]?.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>

          {/* System Prompt */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                System Prompt
              </label>
              <button
                onClick={() => updateNodeData(node.id, { isLocked: !data.isLocked })}
                className={`rounded p-1 transition-colors ${data.isLocked ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-accent)]'}`}
                title={data.isLocked ? "Unlock to edit" : "Lock prompt"}
              >
                {data.isLocked ? <Lock size={12} fill="currentColor" className="fill-opacity-10" /> : <LockOpen size={12} />}
              </button>
            </div>
            <textarea
              value={data.systemPrompt || ''}
              readOnly={data.isLocked}
              onChange={(e) => updateNodeData(node.id, { systemPrompt: e.target.value })}
              className={`input-field min-h-[140px] resize-y transition-all ${
                data.isLocked 
                ? 'opacity-60 cursor-not-allowed bg-[var(--color-bg-secondary)] border-dashed border-[var(--color-border)]' 
                : 'focus:border-[var(--color-accent)]'
              }`}
              placeholder="Define the agent's behavior..."
              rows={6}
            />
            {data.isLocked && (
              <p className="text-[10px] text-[var(--color-text-muted)] italic">
                Standard prompt locked. Unlock to customize behavior.
              </p>
            )}
          </div>

          {/* Temperature */}
          <Field label={`Temperature (${data.temperature ?? 0.7})`}>
            <input
              id="temp-slider"
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={data.temperature ?? 0.7}
              onChange={(e) => updateNodeData(node.id, { temperature: parseFloat(e.target.value) })}
              className="w-full accent-[var(--color-accent)]"
            />
          </Field>

          {/* Max Tokens */}
          <Field label="Max Tokens">
            <input
              type="number"
              value={data.maxTokens ?? 2048}
              onChange={(e) => updateNodeData(node.id, { maxTokens: parseInt(e.target.value) || 2048 })}
              className="input-field"
              min={100}
              max={32000}
            />
          </Field>
        </div>
      </div>

      {/* Delete Button */}
      <div className="border-t border-[var(--color-border)] p-4">
        <button
          onClick={() => deleteNode(node.id)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-3 py-2 text-xs font-medium text-[var(--color-error)] transition hover:bg-[var(--color-error)]/20"
        >
          <Trash2 size={14} /> Delete Agent
        </button>
      </div>

      <style>{`
        .input-field {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--color-border);
          background: var(--color-bg-input);
          padding: 8px 12px;
          font-size: 13px;
          color: var(--color-text-primary);
          outline: none;
          transition: border-color 0.2s;
        }
        .input-field:focus {
          border-color: var(--color-accent);
        }
        .input-field option {
          background: var(--color-bg-secondary);
          color: var(--color-text-primary);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}
