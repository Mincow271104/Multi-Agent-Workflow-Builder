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
  toastMessage: string | null;
  setToastMessage: (msg: string | null) => void;

  // ── Canvas actions ───────────────────────────────────────────
  onNodesChange: (changes: NodeChange<Node<AgentNodeData>>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (node: Node<AgentNodeData>) => void;
  updateNodeData: (nodeId: string, data: Partial<AgentNodeData>) => void;
  setSelectedNode: (nodeId: string | null) => void;
  deleteNode: (nodeId: string) => void;
  deleteEdge: (edgeId: string) => void;
  setNodes: (nodes: Node<AgentNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  addEdgeSmart: (connection: Connection) => void;

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
  hydrateExecution: (execution: Record<string, any>) => void;
  resetWorkflow: () => void;

  // ── Hand Tracking ─────────────────────────────────────────────
  isHandTrackingEnabled: boolean;
  setHandTrackingEnabled: (enabled: boolean) => void;
  handCursorPosition: { x: number; y: number } | null;
  setHandCursorPosition: (pos: { x: number; y: number } | null) => void;
  hoverClickProgress: number;
  setHoverClickProgress: (progress: number) => void;
  activeGesture: 'none' | 'point' | 'pinch_2' | 'pinch_3' | 'pinch_5' | 'open_palm' | 'fist' | 'scroll_up' | 'scroll_down';
  setActiveGesture: (gesture: 'none' | 'point' | 'pinch_2' | 'pinch_3' | 'pinch_5' | 'open_palm' | 'fist' | 'scroll_up' | 'scroll_down') => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
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
  toastMessage: null,
  setToastMessage: (msg: string | null) => {
    set({ toastMessage: msg });
    if (msg) {
      setTimeout(() => {
        if (get().toastMessage === msg) {
          set({ toastMessage: null });
        }
      }, 5000);
    }
  },

  isHandTrackingEnabled: localStorage.getItem('handTracking') === 'true',
  handCursorPosition: null,
  hoverClickProgress: 0,
  activeGesture: 'none',

  // ── Canvas actions ───────────────────────────────────────────

  onNodesChange: (changes) =>
    set({ nodes: applyNodeChanges(changes, get().nodes) }),

  onEdgesChange: (changes) =>
    set({ edges: applyEdgeChanges(changes, get().edges) }),

  onConnect: (connection) =>
    set({ edges: addEdge({ ...connection, animated: true }, get().edges) }),

  addEdgeSmart: (connection) => {
    const state = get();
    const sourceNode = state.nodes.find((n) => n.id === connection.source);
    const targetNode = state.nodes.find((n) => n.id === connection.target);

    // 1. Prohibit self-loops
    if (connection.source === connection.target) {
      state.setToastMessage("⚠️ Lỗi nối dây: Một Agent không thể tự nhận Data của chính mình!");
      return;
    }

    const sourceRole = (sourceNode?.data as AgentNodeData)?.role?.toLowerCase() || '';
    const targetRole = (targetNode?.data as AgentNodeData)?.role?.toLowerCase() || '';

    // 2. Prohibit Orchestrator connections (except feedback logic if needed, but per user request, block it)
    if (sourceRole === 'orchestrator' || targetRole === 'orchestrator') {
      state.setToastMessage("⚠️ Sai kiến trúc: Hệ thống không cho phép nối dây với Orchestrator! Hãy để Orchestrator đứng lơ lửng độc lập.");
      return;
    }

    // 3. Cycle Detection (DAG validation)
    const hasPath = (current: string, destination: string, visited: Set<string>): boolean => {
      if (current === destination) return true;
      if (visited.has(current)) return false;
      visited.add(current);
      
      const outs = state.edges.filter(e => e.source === current).map(e => e.target);
      for (const out of outs) {
        if (hasPath(out, destination, visited)) return true;
      }
      return false;
    };

    if (connection.source && connection.target && hasPath(connection.target, connection.source, new Set())) {
      state.setToastMessage("⚠️ Vòng lặp vô tận: Không thể cắm dây ngược dòng (tạo thành vòng khép kín). Luồng kết nối phải luôn đi tới!");
      return;
    }

    const involvesOrchestrator = sourceRole === 'orchestrator' || targetRole === 'orchestrator';

    const edgeType = involvesOrchestrator ? 'feedback' : 'pipeline';
    const label = involvesOrchestrator ? 'Feedback' : '';

    const newEdge: Edge = {
      id: `e-${connection.source}-${connection.target}-${Date.now()}`,
      source: connection.source!,
      target: connection.target!,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      type: edgeType,
      animated: !involvesOrchestrator,
      label,
      data: { edgeType },
    };

    set({ edges: [...state.edges, newEdge] });
  },

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

  deleteEdge: (edgeId) =>
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== edgeId),
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
      agentOutputs: { ...s.agentOutputs, [nodeId]: '' },
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
      
      const newSteps = [...s.executionSteps];
      for (let i = newSteps.length - 1; i >= 0; i--) {
        if (newSteps[i].nodeId === nodeId) {
          newSteps[i] = { ...newSteps[i], status: 'streaming', output: newOutput };
          break;
        }
      }

      return {
        agentOutputs: { ...s.agentOutputs, [nodeId]: newOutput },
        executionSteps: newSteps,
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, status: 'streaming' as const } } : n,
        ),
      };
    }),

  onAgentFinished: ({ nodeId, agentName, role, output, durationMs }) =>
    set((s) => {
      const newSteps = [...s.executionSteps];
      for (let i = newSteps.length - 1; i >= 0; i--) {
        if (newSteps[i].nodeId === nodeId) {
          newSteps[i] = { ...newSteps[i], status: 'completed', output, durationMs };
          break;
        }
      }

      return {
        currentAgentId: null,
        agentOutputs: { ...s.agentOutputs, [nodeId]: output },
        executionSteps: newSteps,
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
      };
    }),

  onExecutionCompleted: (_result, logs) =>
    set((s) => {
      // Find the last agent's output as the final result
      const lastStep = s.executionSteps[s.executionSteps.length - 1];
      return {
        isRunning: false,
        executionId: null, // Clear execution ID on completion
        activeTab: 'result' as const,
        executionLogs: logs.length > 0 ? logs : s.executionLogs,
        finalResult: lastStep?.output || s.finalResult,
      };
    }),

  onExecutionError: (error) =>
    set((s) => ({
      isRunning: false,
      executionId: null, // Clear execution ID on error
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

  hydrateExecution: (execution) => set((s) => {
    const logs = (execution.logs || []) as AgentStepLog[];
    const isRunning = execution.status === 'RUNNING' || execution.status === 'PENDING';
    const showExecution = true;
    
    // Map AgentStepLog to ExecutionStep for the UI panel
    const executionSteps: ExecutionStep[] = logs.map(log => ({
       nodeId: log.nodeId,
       agentName: log.agentName,
       role: log.role || 'agent',
       provider: log.provider || 'ollama',
       model: log.model || '',
       status: log.status,
       output: log.output || '',
       durationMs: log.durationMs,
       startedAt: log.startedAt ? new Date(log.startedAt).getTime() : undefined,
       error: log.error
    }));

    const finalResult = execution.result?.output || (logs.length > 0 ? logs[logs.length - 1].output : '');

    // Restore the agent text streaming outputs dict
    const agentOutputs: Record<string, string> = {};
    logs.forEach(l => {
      if (l.nodeId && l.output) agentOutputs[l.nodeId] = l.output;
    });

    return {
       executionId: execution.id || null,
       isRunning,
       showExecution,
       executionLogs: logs,
       executionSteps,
       agentOutputs,
       finalResult,
       activeTab: isRunning ? 'logs' : 'result',
       
       // Update node statuses on the canvas
       nodes: s.nodes.map(n => {
         // Find the last log for this node (in case of loops, take the latest)
         const nodeLogs = logs.filter(l => l.nodeId === n.id);
         const latestLog = nodeLogs.length > 0 ? nodeLogs[nodeLogs.length - 1] : null;
         
         if (latestLog) {
           return { ...n, data: { ...n.data, status: latestLog.status, output: latestLog.output } };
         }
         return { ...n, data: { ...n.data, status: 'idle', output: undefined } };
       })
    };
  }),

  resetWorkflow: () =>
    set({
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
    }),

  // ── Hand Tracking Logic ───────────────────────────────────────────

  setHandTrackingEnabled: (enabled) => {
    localStorage.setItem('handTracking', enabled.toString());
    set({ isHandTrackingEnabled: enabled });
  },

  setHandCursorPosition: (pos) => set({ handCursorPosition: pos }),
  
  setHoverClickProgress: (progress) => set({ hoverClickProgress: progress }),

  setActiveGesture: (gesture) => set({ activeGesture: gesture }),

  updateNodePosition: (nodeId, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, position } : n
      ),
    })),
}));
