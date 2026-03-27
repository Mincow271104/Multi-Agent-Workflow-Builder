import { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/stores/workflowStore';
import AgentNode from './AgentNode';
import type { AgentTemplate, AgentNodeData } from '@/types';

// Register custom node types
const nodeTypes = { agentNode: AgentNode };

export default function WorkflowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, setSelectedNode } = useWorkflowStore();
  const rfWrapper = useRef<HTMLDivElement>(null);
  const rfInstanceRef = useRef<{ screenToFlowPosition: (pos: {x: number; y: number}) => {x: number; y: number} } | null>(null);

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
          temperature: 0.7,
          maxTokens: 2048,
          status: 'idle',
        } as AgentNodeData,
      };

      addNode(newNode);
    },
    [addNode],
  );

  return (
    <div className="flex-1" ref={rfWrapper}>
      <ReactFlow<Node<AgentNodeData>, Edge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange as never}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={(instance) => { rfInstanceRef.current = instance; }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneClick={() => setSelectedNode(null)}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
        className="bg-[var(--color-bg-primary)]"
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: 'var(--color-border-bright)', strokeWidth: 2 },
        }}
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
