import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AGENT_TEMPLATES as LEGACY_TEMPLATES, ProviderName } from '@/types';

export interface AgentTemplate {
  id: string; // Dynamic ID since it's now CRUD
  role: string; // Used as the unique string map for node types internally
  label: string;
  icon: string;
  defaultProvider: ProviderName;
  defaultModel: string;
  defaultPrompt: string;
  defaultTemperature?: number;
  color: string;
  isPinned?: boolean;
  isDefault?: boolean;
}

interface AgentTemplateState {
  templates: AgentTemplate[];
  addTemplate: (template: Omit<AgentTemplate, 'id'>) => void;
  updateTemplate: (id: string, updates: Partial<AgentTemplate>) => void;
  deleteTemplate: (id: string) => void;
  togglePin: (id: string) => void;
}

// Map the static legacy templates into dynamic objects with UUIDs so they can be managed
const DEFAULT_INITIAL_TEMPLATES: AgentTemplate[] = LEGACY_TEMPLATES.map((t) => ({
  ...t,
  id: crypto.randomUUID(),
  isPinned: false,
  isDefault: true,
}));

export const useAgentTemplateStore = create<AgentTemplateState>()(
  persist(
    (set) => ({
      templates: DEFAULT_INITIAL_TEMPLATES,

      addTemplate: (templateData) =>
        set((state) => ({
          templates: [...state.templates, { ...templateData, id: crypto.randomUUID() }],
        })),

      updateTemplate: (id, updates) =>
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        })),

      deleteTemplate: (id) =>
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
        })),

      togglePin: (id) =>
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id ? { ...t, isPinned: !t.isPinned } : t
          ),
        })),
    }),
    {
      name: 'agent-templates-storage',
      // persist uniquely using local storage
      storage: createJSONStorage(() => localStorage),
    }
  )
);
