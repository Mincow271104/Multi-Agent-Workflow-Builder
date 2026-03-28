import { useCallback, useRef, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ConnectionMode,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/stores/workflowStore';
import AgentNode from './AgentNode';
import { PipelineEdge, FeedbackEdge } from './CustomEdge';
import type { AgentTemplate, AgentNodeData } from '@/types';

// Register custom node types
const nodeTypes = { agentNode: AgentNode };

// Register custom edge types
const edgeTypes = {
  pipeline: PipelineEdge,
  feedback: FeedbackEdge,
};

export default function WorkflowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, addNode, setSelectedNode } = useWorkflowStore();
  const addEdge = useWorkflowStore((s) => s.addEdgeSmart);
  const resetWorkflow = useWorkflowStore((s) => s.resetWorkflow);
  const rfWrapper = useRef<HTMLDivElement>(null);
  const rfInstanceRef = useRef<{ screenToFlowPosition: (pos: {x: number; y: number}) => {x: number; y: number} } | null>(null);
  const { id } = useParams<{ id: string }>();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  }, []);

  // Clear workflow state entirely when unmounting or switching to another workflow
  useEffect(() => {
    return () => {
      resetWorkflow();
    };
  }, [id, resetWorkflow]);

  // Handle drop from sidebar
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/agentTemplate');
      if (!raw || !rfInstanceRef.current) return;

      const template: AgentTemplate = JSON.parse(raw);

      // Convert screen position to React Flow position
      const position = rfInstanceRef.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const newNode = {
        id: `agent_${Date.now()}`,
        type: 'agentNode',
        position,
        data: {
          label: template.label,
          role: template.role,
          provider: template.defaultProvider,
          model: template.defaultModel,
          systemPrompt: template.defaultPrompt,
          temperature: template.defaultTemperature ?? 0.7,
          maxTokens: 2048,
          status: 'idle',
          isLocked: template.role !== 'custom',
        } as AgentNodeData,
      };

      addNode(newNode);
    },
    [addNode],
  );

  // Smart connect: auto-detect edge type based on source/target roles & block invalid connections
  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      const sourceRole = (sourceNode?.data as AgentNodeData)?.role?.toLowerCase() || '';
      const targetRole = (targetNode?.data as AgentNodeData)?.role?.toLowerCase() || '';

      if (sourceRole === 'orchestrator' || targetRole === 'orchestrator') {
        showToast("⚠️ Sai kiến trúc: Hệ thống không cho phép nối dây với Orchestrator! Hãy để Orchestrator đứng lơ lửng độc lập (chế độ giám sát Hybrid), hoặc xóa tất cả dây (chế độ động Dynamic).");
        return;
      }

      // Check self-loop
      if (connection.source === connection.target) {
        showToast("⚠️ Lỗi nối dây: Một Agent không thể tự nhận Data của chính mình!");
        return;
      }

      // Detect cycles (DAG validation)
      const hasPath = (current: string, destination: string, visited: Set<string>): boolean => {
        if (current === destination) return true;
        if (visited.has(current)) return false;
        visited.add(current);
        
        const outs = edges.filter(e => e.source === current).map(e => e.target);
        for (const out of outs) {
          if (hasPath(out, destination, visited)) return true;
        }
        return false;
      };

      if (connection.source && connection.target && hasPath(connection.target, connection.source, new Set())) {
        showToast("⚠️ Vòng lặp vô tận: Không thể cắm dây ngược dòng (tạo thành vòng khép kín). Luồng kết nối phải luôn đi tới (Linear)!");
        return;
      }

      addEdge(connection);
    },
    [nodes, edges, addEdge, showToast],
  );

  const [connectingHandle, setConnectingHandle] = useState<{
    nodeId: string;
    handleId: string | null;
    type: 'source' | 'target';
  } | null>(null);

  const onConnectStart = useCallback((_: any, { nodeId, handleId, handleType }: any) => {
    setConnectingHandle({ nodeId, handleId, type: handleType });
  }, []);

  const onConnectEnd = useCallback(
    (event: any) => {
      if (!connectingHandle) return;

      const targetElement = document.elementFromPoint(event.clientX, event.clientY);
      const nodeElement = targetElement?.closest('.react-flow__node');

      if (nodeElement) {
        const targetNodeId = nodeElement.getAttribute('data-id');
        const targetIsHandle = targetElement?.classList.contains('react-flow__handle');

        // If dropped on the node body (not the handle itself), we manually trigger the connection
        if (targetNodeId && targetNodeId !== connectingHandle.nodeId && !targetIsHandle) {
          const isFromSource = connectingHandle.type === 'source';
          
          onConnect({
            source: isFromSource ? connectingHandle.nodeId : targetNodeId,
            sourceHandle: isFromSource ? (connectingHandle.handleId || 'bottom') : 'bottom',
            target: isFromSource ? targetNodeId : connectingHandle.nodeId,
            targetHandle: isFromSource ? 'top' : (connectingHandle.handleId || 'top'),
          });
        }
      }

      setConnectingHandle(null);
    },
    [connectingHandle, onConnect],
  );

  return (
    <div className="flex-1 relative" ref={rfWrapper}>
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex animate-in slide-in-from-top-4 fade-in items-center gap-3 rounded-lg bg-[#7f1d1d]/95 border border-[#dc2626] px-4 py-3 text-[13px] font-medium text-white shadow-2xl backdrop-blur text-left max-w-md w-full leading-relaxed">
          <AlertCircle size={20} className="shrink-0 text-red-300" />
          <span>{toastMessage}</span>
        </div>
      )}
      <ReactFlow<Node<AgentNodeData>, Edge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange as never}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onInit={(instance) => { rfInstanceRef.current = instance; }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneClick={() => setSelectedNode(null)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
        className="bg-[var(--color-bg-primary)]"
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: 'var(--color-border-bright)', strokeWidth: 2 },
        }}
        connectionMode={ConnectionMode.Loose}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.05)" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(n) => {
            const d = n.data as unknown as AgentNodeData;
            if (d.status === 'running' || d.status === 'streaming') return 'var(--color-warning)';
            if (d.status === 'completed') return 'var(--color-success)';
            if (d.status === 'failed') return 'var(--color-error)';
            return 'var(--color-accent)';
          }}
          style={{ background: 'var(--color-bg-secondary)' }}
        />
      </ReactFlow>
    </div>
  );
}
