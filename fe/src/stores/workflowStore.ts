import { create } from 'zustand';
import { type Node, type Edge, applyNodeChanges, applyEdgeChanges, type NodeChange, type EdgeChange, addEdge, type Connection } from '@xyflow/react';
import type { AgentNodeData, AgentStepLog } from '@/types';

// ── Enhanced execution step for UI ──────────────────────────────

export interface ExecutionStep {
  nodeId: string;
  agentName: string;
  role: string;
  provider: string;
  model: string;
  status: 'pending' | 'running' | 'streaming' | 'completed' | 'failed';
  output: string;
  durationMs?: number;
  startedAt?: number;
  error?: string;
}

interface WorkflowState {
  // ── Canvas state ─────────────────────────────────────────────
  nodes: Node<AgentNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;

  // ── Execution state ──────────────────────────────────────────
  isRunning: boolean;
  executionId: string | null;
  agentOutputs: Record<string, string>;
  executionSteps: ExecutionStep[];
  executionLogs: AgentStepLog[];
  executionError: string | null;
  showExecution: boolean;
  activeTab: 'logs' | 'result';
  currentAgentId: string | null;
  finalResult: string;
  executionStartTime: number | null;

  // ── Canvas actions ───────────────────────────────────────────
  onNodesChange: (changes: NodeChange<Node<AgentNodeData>>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (node: Node<AgentNodeData>) => void;
  updateNodeData: (nodeId: string, data: Partial<AgentNodeData>) => void;
  setSelectedNode: (nodeId: string | null) => void;
  deleteNode: (nodeId: string) => void;
  setNodes: (nodes: Node<AgentNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;

  // ── Execution actions ────────────────────────────────────────
  startExecution: (executionId: string) => void;
  onAgentStarted: (data: { nodeId: string; agentName: string; role: string; provider: string; model: string }) => void;
  onAgentStream: (nodeId: string, chunk: string) => void;
  onAgentFinished: (data: { nodeId: string; agentName: string; role: string; output: string; durationMs: number }) => void;
  onExecutionCompleted: (result: Record<string, unknown>, logs: AgentStepLog[]) => void;
  onExecutionError: (error: string) => void;
  resetExecution: () => void;
  setShowExecution: (show: boolean) => void;
  setActiveTab: (tab: 'logs' | 'result') => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isRunning: false,
  executionId: null,
  agentOutputs: {},
  executionSteps: [],
  executionLogs: [],
  executionError: null,
  showExecution: false,
  activeTab: 'logs',
  currentAgentId: null,
  finalResult: '',
  executionStartTime: null,

  // ── Canvas actions ───────────────────────────────────────────

  onNodesChange: (changes) =>
    set({ nodes: applyNodeChanges(changes, get().nodes) }),

  onEdgesChange: (changes) =>
    set({ edges: applyEdgeChanges(changes, get().edges) }),

  onConnect: (connection) =>
    set({ edges: addEdge({ ...connection, animated: true }, get().edges) }),

  addNode: (node) =>
    set((s) => ({ nodes: [...s.nodes, node] })),

  updateNodeData: (nodeId, data) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    })),

  setSelectedNode: (nodeId) =>
    set({ selectedNodeId: nodeId }),

  deleteNode: (nodeId) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: s.selectedNodeId === nodeId ? null : s.selectedNodeId,
    })),

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  // ── Execution actions ────────────────────────────────────────

  startExecution: (executionId) =>
    set((s) => ({
      isRunning: true,
      executionId,
      agentOutputs: {},
      executionSteps: [],
      executionLogs: [],
      executionError: null,
      showExecution: true,
      activeTab: 'logs',
      currentAgentId: null,
      finalResult: '',
      executionStartTime: Date.now(),
      // Reset all node statuses to idle
      nodes: s.nodes.map((n) => ({
        ...n,
        data: { ...n.data, status: 'idle' as const, output: undefined },
      })),
    })),

  onAgentStarted: ({ nodeId, agentName, role, provider, model }) =>
    set((s) => ({
      currentAgentId: nodeId,
      executionSteps: [
        ...s.executionSteps,
        {
          nodeId,
          agentName,
          role,
          provider,
          model,
          status: 'running',
          output: '',
          startedAt: Date.now(),
        },
      ],
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, status: 'running' as const } } : n,
      ),
    })),

  onAgentStream: (nodeId, chunk) =>
    set((s) => {
      const current = s.agentOutputs[nodeId] || '';
      const newOutput = current + chunk;
      return {
        agentOutputs: { ...s.agentOutputs, [nodeId]: newOutput },
        executionSteps: s.executionSteps.map((step) =>
          step.nodeId === nodeId
            ? { ...step, status: 'streaming' as const, output: newOutput }
            : step,
        ),
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, status: 'streaming' as const } } : n,
        ),
      };
    }),

  onAgentFinished: ({ nodeId, agentName, role, output, durationMs }) =>
    set((s) => ({
      currentAgentId: null,
      agentOutputs: { ...s.agentOutputs, [nodeId]: output },
      executionSteps: s.executionSteps.map((step) =>
        step.nodeId === nodeId
          ? { ...step, status: 'completed' as const, output, durationMs }
          : step,
      ),
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, status: 'completed' as const, output } }
          : n,
      ),
      // Track last completed agent output as finalResult candidate
      finalResult: output,
      executionLogs: [
        ...s.executionLogs,
        { nodeId, agentName, role, provider: 'ollama' as const, model: '', status: 'completed' as const, input: '', output, durationMs },
      ],
    })),

  onExecutionCompleted: (_result, logs) =>
    set((s) => {
      // Find the last agent's output as the final result
      const lastStep = s.executionSteps[s.executionSteps.length - 1];
      return {
        isRunning: false,
        activeTab: 'result',
        executionLogs: logs.length > 0 ? logs : s.executionLogs,
        finalResult: lastStep?.output || s.finalResult,
      };
    }),

  onExecutionError: (error) =>
    set((s) => ({
      isRunning: false,
      executionError: error,
      currentAgentId: null,
      nodes: s.nodes.map((n) => {
        const step = s.executionSteps.find((st) => st.nodeId === n.id);
        if (step && step.status === 'running') {
          return { ...n, data: { ...n.data, status: 'failed' as const } };
        }
        return n;
      }),
    })),

  resetExecution: () =>
    set((s) => ({
      isRunning: false,
      executionId: null,
      agentOutputs: {},
      executionSteps: [],
      executionLogs: [],
      executionError: null,
      currentAgentId: null,
      finalResult: '',
      executionStartTime: null,
      nodes: s.nodes.map((n) => ({
        ...n,
        data: { ...n.data, status: 'idle' as const, output: undefined },
      })),
    })),

  setShowExecution: (show) => set({ showExecution: show }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
