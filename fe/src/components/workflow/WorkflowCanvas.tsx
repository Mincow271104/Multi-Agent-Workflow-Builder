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
import { useAgentTemplateStore } from '@/stores/agentTemplateStore';
import type { AgentTemplate, AgentNodeData } from '@/types';

// Register custom node types
const nodeTypes = { agentNode: AgentNode };

// Register custom edge types
const edgeTypes = {
  pipeline: PipelineEdge,
  feedback: FeedbackEdge,
};

export default function WorkflowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, addNode, setSelectedNode, toastMessage, setToastMessage } = useWorkflowStore();

  // ── Hand Tracking Integration ──────────────────────────────────────────
  const { templates } = useAgentTemplateStore();
  const { isHandTrackingEnabled, handCursorPosition, activeGesture } = useWorkflowStore();
  const draggedNodeIdRef = useRef<string | null>(null);
  const draggedTemplateRoleRef = useRef<string | null>(null);
  const connectNodeIdRef = useRef<string | null>(null);
  const lastHandPosRef = useRef<{ x: number; y: number } | null>(null);
  const [forceRender, setForceRender] = useState(0); // For forcing SVG line render if needed

  useEffect(() => {
    if (!handCursorPosition || !rfInstanceRef.current || !isHandTrackingEnabled) {
       draggedNodeIdRef.current = null;
       draggedTemplateRoleRef.current = null;
       connectNodeIdRef.current = null;
       return;
    }

    const flowPos = rfInstanceRef.current.screenToFlowPosition({
      x: handCursorPosition.x,
      y: handCursorPosition.y,
    });
    
    const stateNodes = useWorkflowStore.getState().nodes;

    if (activeGesture === 'pinch_2') {
       connectNodeIdRef.current = null;
       
       if (!draggedNodeIdRef.current && !draggedTemplateRoleRef.current) {
          const targetElement = document.elementFromPoint(handCursorPosition.x, handCursorPosition.y);
          const templateEl = targetElement?.closest('[data-template-role]');
          
          if (templateEl) {
             draggedTemplateRoleRef.current = templateEl.getAttribute('data-template-role');
          } else {
             let closest = null;
             let minDist = 200;
             for (const n of stateNodes) {
                const centerX = n.position.x + 150;
                const centerY = n.position.y + 75;
                const dist = Math.sqrt(Math.pow(centerX - flowPos.x, 2) + Math.pow(centerY - flowPos.y, 2));
                if (dist < minDist) { minDist = dist; closest = n.id; }
             }
             if (closest) draggedNodeIdRef.current = closest;
          }
       } else if (draggedNodeIdRef.current) {
          useWorkflowStore.getState().updateNodePosition(draggedNodeIdRef.current, { x: flowPos.x - 150, y: flowPos.y - 75 });
       }
       
       if (draggedTemplateRoleRef.current) {
          setForceRender(prev => prev + 1); // trigger ghost re-render
       }
    } else {
       if (draggedTemplateRoleRef.current) {
          const role = draggedTemplateRoleRef.current;
          
          // Must fetch latest templates to ensure custom agents are recognized by hand tracking
          const template = useAgentTemplateStore.getState().templates.find(t => t.role === role);
          
          if (template && handCursorPosition.x > 224) { // Only drop if over the canvas area
             const newNode = {
               id: `agent_${Date.now()}`,
               type: 'agentNode',
               position: { x: flowPos.x - 150, y: flowPos.y - 75 },
               data: {
                 label: template.label,
                 role: template.role,
                 provider: template.defaultProvider || 'ollama',
                 model: template.defaultModel || 'qwen2.5:14b',
                 systemPrompt: template.defaultPrompt || '',
                 temperature: template.defaultTemperature ?? 0.7,
                 maxTokens: 2048,
                 status: 'idle',
                 isLocked: template.role !== 'custom',
               }
             };
             useWorkflowStore.getState().addNode(newNode as any);
          }
          draggedTemplateRoleRef.current = null;
          setForceRender(prev => prev + 1); 
       }
       draggedNodeIdRef.current = null;
    }

    if (activeGesture === 'pinch_3') {
       if (!connectNodeIdRef.current) {
          let closest = null;
          let minDist = 200;
          for (const n of stateNodes) {
             const centerX = n.position.x + 150;
             const centerY = n.position.y + 75;
             const dist = Math.sqrt(Math.pow(centerX - flowPos.x, 2) + Math.pow(centerY - flowPos.y, 2));
             if (dist < minDist) { minDist = dist; closest = n.id; }
          }
          if (closest) connectNodeIdRef.current = closest;
       }
       // Force a render so the SVG line updates to follow the hand cursor
       setForceRender(prev => prev + 1);
    } else if (connectNodeIdRef.current) {
       let closest = null;
       let minDist = 200;
       for (const n of stateNodes) {
         if (n.id === connectNodeIdRef.current) continue;
         const centerX = n.position.x + 150;
         const centerY = n.position.y + 75;
         const dist = Math.sqrt(Math.pow(centerX - flowPos.x, 2) + Math.pow(centerY - flowPos.y, 2));
         if (dist < minDist) { minDist = dist; closest = n.id; }
       }
       if (closest) {
         useWorkflowStore.getState().addEdgeSmart({
           source: connectNodeIdRef.current,
           target: closest,
           sourceHandle: 'bottom',
           targetHandle: 'top'
         } as any);
       }
       connectNodeIdRef.current = null;
    }

    // ── Pan and Zoom ──────────────────────────────────────────────────────────
    if (activeGesture === 'fist') {
       if (lastHandPosRef.current && rfInstanceRef.current) {
          const dx = handCursorPosition.x - lastHandPosRef.current.x;
          const dy = handCursorPosition.y - lastHandPosRef.current.y;
          const currentViewport = rfInstanceRef.current.getViewport();
          rfInstanceRef.current.setViewport({
             ...currentViewport,
             x: currentViewport.x + dx,
             y: currentViewport.y + dy,
          });
       }
       lastHandPosRef.current = { ...handCursorPosition };
    } else {
       lastHandPosRef.current = null;
    }

    if (activeGesture === 'open_palm') {
       if (rfInstanceRef.current) {
          const vp = rfInstanceRef.current.getViewport();
          const newZoom = Math.min(Math.max(vp.zoom + 0.008, 0.1), 2.5);
          
          const rect = document.querySelector('.react-flow')?.getBoundingClientRect();
          if (rect) {
             const mouseX = handCursorPosition.x - rect.left;
             const mouseY = handCursorPosition.y - rect.top;
             const multiplier = newZoom / vp.zoom;
             rfInstanceRef.current.setViewport({ 
                x: mouseX - (mouseX - vp.x) * multiplier, 
                y: mouseY - (mouseY - vp.y) * multiplier, 
                zoom: newZoom 
             });
          }
       }
    }

    if (activeGesture === 'pinch_5') {
       if (rfInstanceRef.current) {
          const vp = rfInstanceRef.current.getViewport();
          const newZoom = Math.max(vp.zoom - 0.008, 0.1);
          
          const rect = document.querySelector('.react-flow')?.getBoundingClientRect();
          if (rect) {
             const mouseX = handCursorPosition.x - rect.left;
             const mouseY = handCursorPosition.y - rect.top;
             const multiplier = newZoom / vp.zoom;
             rfInstanceRef.current.setViewport({ 
                x: mouseX - (mouseX - vp.x) * multiplier, 
                y: mouseY - (mouseY - vp.y) * multiplier, 
                zoom: newZoom 
             });
          }
       }
    }
    // ────────────────────────────────────────────────────────────────────────
  }, [handCursorPosition, activeGesture, isHandTrackingEnabled]);
  // ───────────────────────────────────────────────────────────────────────

  const resetWorkflow = useWorkflowStore((s) => s.resetWorkflow);
  const rfWrapper = useRef<HTMLDivElement>(null);
  const rfInstanceRef = useRef<any>(null);
  const { id } = useParams<{ id: string }>();

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

  // Connect nodes using the store's addEdgeSmart (which contains validation)
  const onConnect = useCallback(
    (connection: Connection) => {
      useWorkflowStore.getState().addEdgeSmart(connection);
    },
    [],
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

      {/* Hand Tracking Edge Connector & Drag Outline */}
      {isHandTrackingEnabled && (
        <>
          {connectNodeIdRef.current && handCursorPosition && rfInstanceRef.current && (
             <svg className="fixed top-0 left-0 w-full h-full pointer-events-none z-[40]">
               {(() => {
                 const el = document.querySelector(`[data-id="${connectNodeIdRef.current}"]`);
                 if (!el) return null;
                 const rect = el.getBoundingClientRect();
                 const startX = rect.left + rect.width / 2;
                 const startY = rect.bottom;
                 
                 return (
                   <path 
                     d={`M ${startX} ${startY}` +
                       ` C ${startX} ${(startY + handCursorPosition.y)/2},` +
                       ` ${handCursorPosition.x} ${(startY + handCursorPosition.y)/2},` + 
                       ` ${handCursorPosition.x} ${handCursorPosition.y}`
                     }
                     fill="none" stroke="var(--color-success)" strokeWidth="3" strokeDasharray="5,5" className="animate-pulse"
                   />
                 );
               })()}
             </svg>
          )}

          {/* Ghost Agent Template Dragging */}
          {draggedTemplateRoleRef.current && handCursorPosition && (
            <div 
              className="fixed pointer-events-none z-[90] opacity-70 glass-card bg-[var(--color-bg-card)] border border-[var(--color-accent)] rounded-xl flex items-center justify-center shadow-2xl px-4 py-2"
              style={{ left: handCursorPosition.x, top: handCursorPosition.y, transform: 'translate(-50%, -50%)', width: 250 }}
            >
               <span className="font-bold text-sm text-[var(--color-accent)] animate-pulse">
                 Dropping {templates.find((t: AgentTemplate) => t.role === draggedTemplateRoleRef.current)?.label || 'Agent'}...
               </span>
            </div>
          )}
        </>
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
