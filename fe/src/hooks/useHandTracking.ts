import { useEffect, useRef, useCallback } from 'react';
import { Camera } from '@mediapipe/camera_utils';
import { Hands, Results, Landmark } from '@mediapipe/hands';
import { useWorkflowStore } from '@/stores/workflowStore';

export function useHandTracking() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const isRunningRef = useRef(false);

  // For Dwell click detection
  const hoverStartTime = useRef<number>(0);
  const hoverStartPos = useRef<{ x: number; y: number } | null>(null);

  // For Smooth Cursor (Exponential Moving Average filter)
  const smoothedPosRef = useRef<{ x: number; y: number } | null>(null);

  const {
    isHandTrackingEnabled,
    setHandTrackingEnabled,
    setHandCursorPosition,
    setActiveGesture,
    setHoverClickProgress,
  } = useWorkflowStore();

  const getDistance = (p1: Landmark, p2: Landmark) => {
    return Math.sqrt(
      Math.pow(p1.x - p2.x, 2) + 
      Math.pow(p1.y - p2.y, 2) + 
      Math.pow(p1.z - p2.z, 2)
    );
  };

  const onResults = useCallback((results: Results) => {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      setHandCursorPosition(null);
      setActiveGesture('none');
      smoothedPosRef.current = null; // Reset smoothing when hand is lost
      return;
    }

    const landmarks = results.multiHandLandmarks[0]; // Tracking first hand only

    // Index finger tip (landmark 8) maps to our cursor
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    // Convert MediaPipe normalized coordinates (0-1) to screen/viewport coordinates
    // We apply "Bounding Box Scaling" so the user doesn't have to reach the exact edge
    // of the camera FOV (where tracking usually drops).
    const xMin = 0.15, xMax = 0.85; // Hand must travel from 15% to 85% of camera width
    const yMin = 0.20, yMax = 0.80; // Hand must travel from 20% to 80% of camera height

    let normalizedX = (indexTip.x - xMin) / (xMax - xMin);
    let normalizedY = (indexTip.y - yMin) / (yMax - yMin);

    // Clamp coordinates to prevent cursor flying away
    normalizedX = Math.max(0, Math.min(1, normalizedX));
    normalizedY = Math.max(0, Math.min(1, normalizedY));

    // X is mirrored visually (x=0 corresponds to the right side of the user's body, depending on orientation, handled by mirror logic).
    const rawX = (1 - normalizedX) * window.innerWidth;
    const rawY = normalizedY * window.innerHeight;

    // Apply Exponential Moving Average (EMA) filter to reduce hand jitter
    const alpha = 0.15; // Smooths heavily for extreme stability
    let screenX = rawX;
    let screenY = rawY;

    if (smoothedPosRef.current) {
      screenX = smoothedPosRef.current.x + alpha * (rawX - smoothedPosRef.current.x);
      screenY = smoothedPosRef.current.y + alpha * (rawY - smoothedPosRef.current.y);
    }

    smoothedPosRef.current = { x: screenX, y: screenY };

    setHandCursorPosition({ x: screenX, y: screenY });

    // Gesture detection
    const pinchThreshold = 0.08; 
    const thumbIndexDistance = getDistance(thumbTip, indexTip);
    const indexMiddleDistance = getDistance(indexTip, middleTip);
    const thumbMiddleDistance = getDistance(thumbTip, middleTip);
    const thumbRingDistance = getDistance(thumbTip, ringTip);
    const thumbPinkyDistance = getDistance(thumbTip, pinkyTip);

    // Check if fingers are folded (y is greater than their PIP joints)
    const indexFolded = indexTip.y > landmarks[6].y;
    const middleFolded = middleTip.y > landmarks[10].y;
    const ringFolded = ringTip.y > landmarks[14].y;
    const pinkyFolded = pinkyTip.y > landmarks[18].y;

    // 1. Pinch 5 (All tips close to thumb)
    let currentGesture: 'none' | 'point' | 'pinch_2' | 'pinch_3' | 'pinch_5' | 'open_palm' | 'fist' | 'scroll_up' | 'scroll_down' = 'none';

    if (thumbIndexDistance < 0.1 && thumbMiddleDistance < 0.15 && thumbRingDistance < 0.15 && thumbPinkyDistance < 0.15) {
      currentGesture = 'pinch_5';
    } 
    // 2. Fist (All 4 fingers are folded down)
    else if (indexFolded && middleFolded && ringFolded && pinkyFolded) {
      currentGesture = 'fist';
    }
    // 3. Open Palm (All 4 fingers straight up and spread out)
    else if (!indexFolded && !middleFolded && !ringFolded && !pinkyFolded && indexMiddleDistance > 0.04) {
      currentGesture = 'open_palm';
    }
    // 4. Pinch 3 (Thumb, Index, Middle close together)
    else if (thumbIndexDistance < pinchThreshold && indexMiddleDistance < pinchThreshold && ringFolded && pinkyFolded) {
      currentGesture = 'pinch_3';
    } 
    // 5. Pinch 2 (Thumb + Index close together, others folded)
    else if (thumbIndexDistance < pinchThreshold && middleFolded && ringFolded && pinkyFolded) {
      currentGesture = 'pinch_2';
    } 
    // 6. Point (Index up, others folded)
    else if (!indexFolded && middleFolded && ringFolded && pinkyFolded) {
      currentGesture = 'point';
    } 
    
    // Check for Sidebar Scrolling first (Both Left and Right sidebars)
    if (currentGesture === 'open_palm' || currentGesture === 'fist' || currentGesture === 'pinch_5') {
       const el = document.elementFromPoint(screenX, screenY);
       const leftSidebar = el?.closest('#agent-sidebar-scroll');
       const rightSidebar = el?.closest('#agent-properties-scroll');
       const scrollTarget = leftSidebar || rightSidebar;
       
       if (scrollTarget) {
          if (currentGesture === 'open_palm') {
             scrollTarget.scrollBy({ top: -15, behavior: 'auto' });
             currentGesture = 'scroll_up';
          } else {
             scrollTarget.scrollBy({ top: 15, behavior: 'auto' });
             currentGesture = 'scroll_down';
          }
       }
    }

    // Check for Temperature Slider dragging (Pinch 2)
    if (currentGesture === 'pinch_2') {
       const el = document.elementFromPoint(screenX, screenY);
       const tempSlider = el?.closest('#temp-slider') as HTMLInputElement | null;
       
       if (tempSlider) {
          const rect = tempSlider.getBoundingClientRect();
          const percent = Math.max(0, Math.min(1, (screenX - rect.left) / rect.width));
          const min = parseFloat(tempSlider.min);
          const max = parseFloat(tempSlider.max);
          const step = parseFloat(tempSlider.step || "0.1");
          
          let newValue = min + percent * (max - min);
          // Snap to step
          newValue = Math.round(newValue / step) * step;
          
          if (parseFloat(tempSlider.value) !== newValue) {
            tempSlider.value = newValue.toString();
            // Trigger React's onChange
            const event = new Event('input', { bubbles: true });
            tempSlider.dispatchEvent(event);
            const changeEvent = new Event('change', { bubbles: true });
            tempSlider.dispatchEvent(changeEvent);
          }
       }
    }

    // Check for Dwell click simulation (3 seconds hold)
    if (currentGesture === 'none' || currentGesture === 'point') {
       if (!hoverStartPos.current) {
          hoverStartPos.current = { x: screenX, y: screenY };
          hoverStartTime.current = Date.now();
          setHoverClickProgress(0);
       } else {
          const dx = screenX - hoverStartPos.current.x;
          const dy = screenY - hoverStartPos.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist > 30) {
             hoverStartPos.current = { x: screenX, y: screenY };
             hoverStartTime.current = Date.now();
             setHoverClickProgress(0);
          } else {
             const duration = Date.now() - hoverStartTime.current;
             setHoverClickProgress(Math.min(duration / 3000, 1));
             
             if (duration >= 3000) {
                const el = document.elementFromPoint(screenX, screenY);
                if (el) {
                   const eventConfig = { view: window, bubbles: true, cancelable: true, clientX: screenX, clientY: screenY, screenX, screenY, pointerId: 1, isPrimary: true };
                   el.dispatchEvent(new PointerEvent('pointerdown', eventConfig));
                   el.dispatchEvent(new MouseEvent('mousedown', eventConfig));
                   el.dispatchEvent(new PointerEvent('pointerup', eventConfig));
                   el.dispatchEvent(new MouseEvent('mouseup', eventConfig));
                   
                   // Some elements need a literal click event dispatched to be considered a React onClick
                   el.dispatchEvent(new MouseEvent('click', eventConfig));
                   
                   // Fallback for native semantic tags
                   const clickable = el.closest('button, a, input, select') as HTMLElement;
                   if (clickable && typeof clickable.click === 'function') {
                      clickable.click();
                   }
                }
                // Reset to avoid double click
                hoverStartPos.current = { x: screenX, y: screenY };
                hoverStartTime.current = Date.now();
                setHoverClickProgress(0);
             }
          }
       }
    } else {
       hoverStartPos.current = null;
       setHoverClickProgress(0);
    }

    setActiveGesture(currentGesture);
  }, [setHandCursorPosition, setActiveGesture]);

  const initTracking = useCallback(async () => {
    if (handsRef.current || !videoRef.current) return;
    isRunningRef.current = true;

    try {
      const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1, // Faster model
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });

      hands.onResults(onResults);
      handsRef.current = hands;

      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current && isRunningRef.current) {
             await hands.send({ image: videoRef.current });
          }
        },
        width: 640,
        height: 480,
      });

      cameraRef.current = camera;
      await camera.start();
    } catch (e) {
      console.error('Failed to start camera/MediaPipe', e);
      setHandTrackingEnabled(false);
    }
  }, [onResults, setHandTrackingEnabled]);

  const stopTracking = useCallback(() => {
    isRunningRef.current = false;
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    if (handsRef.current) {
      handsRef.current.close();
      handsRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setHandCursorPosition(null);
    setActiveGesture('none');
  }, [setHandCursorPosition, setActiveGesture]);

  useEffect(() => {
    if (isHandTrackingEnabled) {
      initTracking();
    } else {
      stopTracking();
    }
    return () => {
      stopTracking();
    };
  }, [isHandTrackingEnabled, initTracking, stopTracking]);

  return {
    videoRef,
  };
}
