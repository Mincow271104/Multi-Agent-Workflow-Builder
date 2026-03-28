// ===================================================================
// CustomEdge.tsx — Two edge variants: Pipeline (cyan solid) & Feedback (amber dashed)
// ===================================================================

import { type EdgeProps, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';
import { useWorkflowStore } from '@/stores/workflowStore';

// ── Pipeline Edge: Solid cyan with glow ──────────────────────────

export function PipelineEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, style = {},
}: EdgeProps) {
  const deleteEdge = useWorkflowStore((s) => s.deleteEdge);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      {/* Glow layer */}
      <path
        d={edgePath}
        fill="none"
        stroke="#06b6d4"
        strokeWidth={6}
        strokeOpacity={0.15}
        className="react-flow__edge-path"
      />
      {/* Main edge */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke="#06b6d4"
        strokeWidth={2.5}
        className="react-flow__edge-path animated-pipeline"
        style={style}
      />
      {/* Arrow marker */}
      <circle
        cx={targetX}
        cy={targetY}
        r={4}
        fill="#06b6d4"
        stroke="#0f0f23"
        strokeWidth={2}
      />
      {/* Delete Button */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button
            onClick={() => deleteEdge(id)}
            style={{ width: 14, height: 14, cursor: 'pointer', borderRadius: '50%', background: '#ef4444', color: 'white', border: '1px solid #7f1d1d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 'bold' }}
            title="Delete connection"
          >
            ✕
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// ── Feedback Edge: Dashed amber ──────────────────────────────────

export function FeedbackEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, style = {},
  label,
}: EdgeProps) {
  const deleteEdge = useWorkflowStore((s) => s.deleteEdge);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      {/* Glow layer */}
      <path
        d={edgePath}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={5}
        strokeOpacity={0.1}
      />
      {/* Main edge */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={2}
        strokeDasharray="8 4"
        className="react-flow__edge-path animated-feedback"
        style={style}
      />
      {/* Arrow marker */}
      <circle
        cx={targetX}
        cy={targetY}
        r={3}
        fill="#f59e0b"
        stroke="#0f0f23"
        strokeWidth={2}
      />
      {/* Label and Delete Button */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
          className="nodrag nopan"
        >
          {label && (
            <div className="edge-label-feedback" style={{ pointerEvents: 'none' }}>
              {String(label)}
            </div>
          )}
          <button
            onClick={() => deleteEdge(id)}
            style={{ width: 12, height: 12, cursor: 'pointer', borderRadius: '50%', background: '#ef4444', color: 'white', border: '1px solid #7f1d1d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 'bold' }}
            title="Delete connection"
          >
            ✕
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
