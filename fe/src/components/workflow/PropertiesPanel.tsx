import { useWorkflowStore } from '@/stores/workflowStore';
import type { ProviderName } from '@/types';
import { X, Trash2 } from 'lucide-react';

const PROVIDERS: { value: ProviderName; label: string }[] = [
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'groq', label: 'Groq (Cloud)' },
  { value: 'gemini', label: 'Gemini (Google)' },
];

const MODELS: Record<ProviderName, string[]> = {
  ollama: ['phi3:mini', 'phi3', 'llama3', 'llama3:8b', 'mistral', 'gemma2', 'codellama'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  gemini: ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
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
      <div className="flex-1 overflow-y-auto p-4">
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
          <Field label="System Prompt">
            <textarea
              value={data.systemPrompt || ''}
              onChange={(e) => updateNodeData(node.id, { systemPrompt: e.target.value })}
              className="input-field min-h-[100px] resize-y"
              placeholder="Define the agent's behavior..."
              rows={4}
            />
          </Field>

          {/* Temperature */}
          <Field label={`Temperature (${data.temperature ?? 0.7})`}>
            <input
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
