import { useHandTracking } from '@/hooks/useHandTracking';
import { useWorkflowStore } from '@/stores/workflowStore';

export default function GlobalHandTracking() {
  const { isHandTrackingEnabled, handCursorPosition, activeGesture, hoverClickProgress } = useWorkflowStore();
  const { videoRef } = useHandTracking();

  if (!isHandTrackingEnabled) return null;

  return (
    <>
      {/* Invisible Video Feed for MediaPipe (Must be in viewport to avoid throttling) */}
      <video 
        ref={videoRef} 
        className="fixed bottom-4 right-4 w-64 h-48 opacity-[0.01] pointer-events-none -z-50" 
        autoPlay 
        playsInline 
      />

      {/* Action Indicator (Bottom Left) */}
      <div className="fixed bottom-6 left-6 z-50 flex gap-2 pointer-events-none">
        {activeGesture === 'pinch_2' && <span className="bg-blue-500 text-white text-sm px-4 py-1.5 rounded-full font-bold shadow-lg shadow-blue-500/20 animate-pulse">DRAG</span>}
        {activeGesture === 'pinch_3' && <span className="bg-green-500 text-white text-sm px-4 py-1.5 rounded-full font-bold shadow-lg shadow-green-500/20 animate-pulse">CONNECT</span>}
        {activeGesture === 'fist' && <span className="bg-orange-500 text-white text-sm px-4 py-1.5 rounded-full font-bold shadow-lg shadow-orange-500/20 animate-pulse">PAN</span>}
        {activeGesture === 'open_palm' && <span className="bg-purple-500 text-white text-sm px-4 py-1.5 rounded-full font-bold shadow-lg shadow-purple-500/20 animate-pulse">ZOOM IN</span>}
        {activeGesture === 'pinch_5' && <span className="bg-purple-500 text-white text-sm px-4 py-1.5 rounded-full font-bold shadow-lg shadow-purple-500/20 animate-pulse">ZOOM OUT</span>}
        {activeGesture === 'scroll_up' && <span className="bg-teal-500 text-white text-sm px-4 py-1.5 rounded-full font-bold shadow-lg shadow-teal-500/20 animate-pulse">SCROLL UP</span>}
        {activeGesture === 'scroll_down' && <span className="bg-teal-500 text-white text-sm px-4 py-1.5 rounded-full font-bold shadow-lg shadow-teal-500/20 animate-pulse">SCROLL DOWN</span>}
        {(!videoRef.current || !videoRef.current.srcObject) && (
           <span className="bg-gray-500/50 backdrop-blur text-white text-sm px-4 py-1.5 rounded-full font-bold shadow-lg animate-pulse">Loading Hand Tracking...</span>
        )}
      </div>

      {/* Virtual Cursor */}
      {handCursorPosition && (
        <div 
          className="fixed pointer-events-none z-[100] transition-all duration-75"
          style={{ left: handCursorPosition.x, top: handCursorPosition.y, transform: 'translate(-50%, -50%)' }}
        >
          <div className={`w-6 h-6 rounded-full border-2 relative ${
            activeGesture === 'pinch_2' ? 'bg-blue-500 border-white scale-75' : 
            activeGesture === 'pinch_3' ? 'bg-green-500 border-white scale-75' :
            activeGesture === 'point' ? 'bg-[var(--color-accent)] border-white scale-100 drop-shadow-[0_0_10px_var(--color-accent)]' :
            'bg-transparent border-[var(--color-accent)] scale-150 opacity-50'
          } flex items-center justify-center transition-all duration-200`}>
             {(activeGesture === 'pinch_2' || activeGesture === 'pinch_3') && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
             
             {/* Dwell Click Progress Ring */}
             {hoverClickProgress > 0 && (
               <svg className="absolute w-10 h-10 pointer-events-none transition-opacity duration-200" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%) rotate(-90deg)' }}>
                 <circle cx="20" cy="20" r="16" fill="none" stroke="var(--color-accent)" strokeWidth="3" opacity="0.3" />
                 <circle cx="20" cy="20" r="16" fill="none" stroke="var(--color-accent)" strokeWidth="3" 
                    strokeDasharray="100" strokeDashoffset={100 - hoverClickProgress * 100} 
                    strokeLinecap="round" className="transition-all duration-100" />
               </svg>
             )}
          </div>
        </div>
      )}
    </>
  );
}
