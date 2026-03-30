import { useState, useEffect } from 'react';
import { X, Save, Sparkles, Loader2 } from 'lucide-react';
import { useAgentTemplateStore, AgentTemplate } from '@/stores/agentTemplateStore';
import { agentApi } from '@/lib/api';
import { ProviderName } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  existingTemplate: AgentTemplate | null;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
];

export default function AgentTemplateModal({ isOpen, onClose, existingTemplate }: Props) {
  const { addTemplate, updateTemplate } = useAgentTemplateStore();

  const [formData, setFormData] = useState<Omit<AgentTemplate, 'id' | 'isPinned'>>({
    label: '',
    role: '',
    icon: '🤖',
    color: '#6366f1',
    defaultProvider: 'ollama',
    defaultModel: 'qwen2.5:14b',
    defaultTemperature: 0.5,
    defaultPrompt: '',
  });

  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (existingTemplate) {
      setFormData({
        label: existingTemplate.label,
        role: existingTemplate.role,
        icon: existingTemplate.icon,
        color: existingTemplate.color,
        defaultProvider: existingTemplate.defaultProvider,
        defaultModel: existingTemplate.defaultModel,
        defaultTemperature: existingTemplate.defaultTemperature ?? 0.5,
        defaultPrompt: existingTemplate.defaultPrompt,
      });
    }
  }, [existingTemplate]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Auto-generate role string if empty based on label
    const finalRole = formData.role.trim() || formData.label.toLowerCase().replace(/\\s+/g, '-');
    const finalData = { ...formData, role: finalRole };

    if (existingTemplate) {
      updateTemplate(existingTemplate.id, finalData);
    } else {
      addTemplate(finalData);
    }
    onClose();
  };

  const handleGeneratePrompt = async () => {
    const roleId = formData.role.trim() || formData.label.toLowerCase().replace(/\s+/g, '-');
    if (!roleId) {
      alert("Please enter an Agent Name or Role first.");
      return;
    }

    setIsGenerating(true);
    try {
      const res = await agentApi.generatePrompt({
        role: roleId,
        provider: formData.defaultProvider.toUpperCase(),
        model: formData.defaultModel
      });

      if (res?.data?.prompt) {
        setFormData(prev => ({ ...prev, defaultPrompt: res.data!.prompt }));
      }
    } catch (err: any) {
      console.error(err);
      alert("Failed to generate prompt. Check backend logs.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {existingTemplate ? 'Edit Agent Template' : 'Create New Agent'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <form id="agent-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Agent Name</label>
                <input
                  type="text"
                  required
                  value={formData.label}
                  onChange={e => setFormData({ ...formData, label: e.target.value })}
                  placeholder="e.g. Lead Developer"
                  className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-md px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Role ID (Internal)</label>
                <input
                  type="text"
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value.toLowerCase().replace(/\\s+/g, '-') })}
                  placeholder="e.g. lead-dev (Auto-generated if empty)"
                  className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-md px-3 py-2 text-sm text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-[80px_1fr] gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Icon</label>
                <input
                  type="text"
                  required
                  value={formData.icon}
                  onChange={e => setFormData({ ...formData, icon: e.target.value })}
                  className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-md px-3 py-2 text-center text-xl focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Theme Color</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${formData.color === color ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">AI Provider</label>
                <select
                  value={formData.defaultProvider}
                  onChange={e => setFormData({ ...formData, defaultProvider: e.target.value as ProviderName })}
                  className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-md px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                >
                  <option value="ollama">Ollama (Local)</option>
                  <option value="groq">Groq (Cloud)</option>
                  <option value="gemini">Gemini (Google)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Model</label>
                <input
                  type="text"
                  required
                  value={formData.defaultModel}
                  onChange={e => setFormData({ ...formData, defaultModel: e.target.value })}
                  placeholder="e.g. qwen2.5:14b"
                  className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-md px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Temperature ({formData.defaultTemperature})</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={formData.defaultTemperature}
                  onChange={e => setFormData({ ...formData, defaultTemperature: parseFloat(e.target.value) })}
                  className="mt-2"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 h-full">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">System Prompt Configuration</label>
                <button
                  type="button"
                  onClick={handleGeneratePrompt}
                  disabled={isGenerating || !formData.defaultModel}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-[var(--color-accent)] bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)] hover:text-white rounded transition-colors disabled:opacity-50"
                  title="Uses the configured AI model below to generate an optimal JSON-compliant prompt for this specific role."
                >
                  {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {isGenerating ? 'Synthesizing...' : 'Auto-Generate Setup'}
                </button>
              </div>
              <textarea
                required
                value={formData.defaultPrompt}
                onChange={e => setFormData({ ...formData, defaultPrompt: e.target.value })}
                placeholder="You are an expert... Your task is to..."
                className="bg-[var(--color-bg-primary)] font-mono text-xs border border-[var(--color-border)] rounded-md p-3 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)] transition-colors min-h-[200px] resize-y"
              />
              <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                For Dynamic / Hybrid workflows, ensure the prompt instructs the agent to output the strict JSON reflection format, including <code className="bg-black/30 px-1 rounded text-purple-400">quality_score</code> and <code className="bg-black/30 px-1 rounded text-purple-400">needs_revision</code>.
              </p>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]/50 flex justify-end gap-3 rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="agent-form"
            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-md shadow-lg shadow-[var(--color-primary)]/20 transition-all active:scale-95"
          >
            <Save size={16} />
            Save Agent
          </button>
        </div>
      </div>
    </div>
  );
}
