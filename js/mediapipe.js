// ================================================================
// DataLake 3.0 — mediapipe.js
// MediaPipe FaceMesh init + camera frame loop.
//
// CRITICAL FIX: Uses FaceMesh ONLY (no separate FaceDetection).
// FaceMesh has its own internal face detection. The old code used
// both FaceDetection and FaceMesh, but FaceDetection would flicker
// (briefly report no face), which stopped FaceMesh from being called,
// starving the liveness frame collector and hanging the pipeline.
//
// Face-lost is debounced with a grace period of 15 consecutive
// empty frames before declaring face truly lost.
//
// Frame loop uses manual rAF (not MediaPipe Camera utility) to avoid
// conflicts with our own getUserMedia stream.
// ================================================================

import { AppState, setFaceDetected, incrementConsecutiveLost } from './state.js';
import { pushLivenessFrame } from './liveness.js';
import {
  renderLandmarks, drawVideoOnly, setFaceRingState, setSweepLine,
  setStatus, hideScanWarning, showScanWarning, hideLoading, showLoadingError,
  setEnrollFaceGuide, setCaptureButtonEnabled,
} from './ui.js';

let faceMesh = null;
const FACE_LOST_GRACE = 15; // frames before declaring face truly lost

// ==================== WAIT FOR CDN GLOBALS ====================

function waitForMediaPipe(timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (typeof FaceMesh !== 'undefined') {
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        reject(new Error('MediaPipe CDN scripts did not load in time'));
      } else {
        setTimeout(check, 200);
      }
    };
    check();
  });
}

// ==================== INIT ====================

export async function initMediaPipe(videoEl) {
  try {
    console.log('[MediaPipe] Waiting for CDN scripts...');
    await waitForMediaPipe();
    console.log('[MediaPipe] CDN scripts loaded. Creating FaceMesh...');

    faceMesh = new FaceMesh({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results) => handleResults(results, videoEl));

    // Pre-warm: send a tiny canvas to trigger WASM download + compilation
    console.log('[MediaPipe] Warming up WASM...');
    const warmup = document.createElement('canvas');
    warmup.width = warmup.height = 10;
    warmup.getContext('2d').fillRect(0, 0, 10, 10);
    await faceMesh.send({ image: warmup });

    AppState.mpLoaded = true;
    hideLoading();
    setStatus('green', 'Place face in frame');

    console.log('[MediaPipe] FaceMesh initialized and warmed up');
    return true;
  } catch (e) {
    console.error('[MediaPipe] Init failed:', e);
    showLoadingError();
    // Retry after 3 seconds
    setTimeout(() => initMediaPipe(videoEl), 3000);
    return false;
  }
}

// ==================== CAMERA ====================

export async function startCamera(videoEl) {
  if (AppState.cameraStream) {
    videoEl.srcObject = AppState.cameraStream;
    AppState.cameraActive = true;
    return;
  }

  try {
    console.log('[Camera] Requesting getUserMedia...');
    AppState.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    });
    videoEl.srcObject = AppState.cameraStream;
    AppState.cameraActive = true;
    console.log('[Camera] Stream active');
  } catch (e) {
    console.error('[Camera]', e);
    AppState.cameraActive = false;
    throw e;
  }
}

export function attachStreamToVideo(videoEl) {
  if (AppState.cameraStream) {
    videoEl.srcObject = AppState.cameraStream;
  }
}

// ==================== FRAME LOOP ====================
// Manual requestAnimationFrame loop — only call AFTER both
// camera is active AND faceMesh is initialized.

let frameLoopRunning = false;
let processing = false;
let lastFrameTime = 0;

export function startFrameLoop(videoEl) {
  if (frameLoopRunning) return;
  if (!faceMesh) {
    console.warn('[FrameLoop] faceMesh not ready, deferring...');
    return;
  }
  frameLoopRunning = true;
  processing = false;
  lastFrameTime = 0;
  console.log('[FrameLoop] Starting rAF loop');

  function loop() {
    if (!frameLoopRunning) return;
    requestAnimationFrame(loop);

    if (processing || !AppState.mpLoaded || !AppState.cameraActive) return;

    const now = performance.now();
    if (now - lastFrameTime < 66) return; // ~15fps cap
    lastFrameTime = now;

    if (videoEl.readyState < 2) return;

    processing = true;
    faceMesh.send({ image: videoEl })
      .catch((e) => console.error('[Frame]', e))
      .finally(() => { processing = false; });
  }

  requestAnimationFrame(loop);
}

export function stopFrameLoop() {
  frameLoopRunning = false;
}

// ==================== FACE MESH RESULTS ====================

function handleResults(results, videoEl) {
  const hasLandmarks = results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0;
  const scanCanvas = document.getElementById('scan-canvas');
  const enrollCanvas = document.getElementById('enroll-canvas');
  const enrollVideo = document.getElementById('enroll-video');

  if (hasLandmarks) {
    const landmarks = results.multiFaceLandmarks[0];
    AppState.landmarks = landmarks;
    setFaceDetected(true);

    // Multi-face warning
    if (results.multiFaceLandmarks.length > 1) {
      showScanWarning('ONE PERSON AT A TIME', 'red');
    } else {
      hideScanWarning();
    }

    // Render landmarks on the active canvas
    if (AppState.screen === 'scan' && scanCanvas) {
      renderLandmarks(scanCanvas, videoEl, landmarks);
    }
    if (AppState.screen === 'enroll' && enrollCanvas && enrollVideo) {
      renderLandmarks(enrollCanvas, enrollVideo, landmarks);
    }

    // === SCAN SCREEN ===
    if (AppState.screen === 'scan') {
      if (AppState.scanState === 'idle') {
        AppState.scanState = 'detecting';
        AppState.faceFirstSeen = performance.now();
        setFaceRingState('detected');
        setSweepLine(true);
        setStatus('blue', 'Scanning...');
      }

      // Push frames for liveness collection
      if (AppState.livenessCollecting) {
        pushLivenessFrame(landmarks);
      }
    }

    // === ENROLL SCREEN ===
    if (AppState.screen === 'enroll') {
      setEnrollFaceGuide('detected');
      setCaptureButtonEnabled(true);
    }

  } else {
    // No landmarks found
    AppState.landmarks = null;
    incrementConsecutiveLost();

    // Grace period before declaring face lost
    if (AppState.consecutiveLost > FACE_LOST_GRACE) {
      setFaceDetected(false);
      AppState.faceFirstSeen = 0;

      if (AppState.screen === 'scan') {
        setFaceRingState('');
        setSweepLine(false);
        if (AppState.scanState === 'idle') setStatus('green', 'Place face in frame');
        if (scanCanvas) drawVideoOnly(scanCanvas, videoEl);
      }

      if (AppState.screen === 'enroll') {
        setEnrollFaceGuide('');
        setCaptureButtonEnabled(false);
        if (enrollCanvas && enrollVideo) drawVideoOnly(enrollCanvas, enrollVideo);
      }
    }
  }
}

// ==================== VIDEO FALLBACK ====================
// Keeps video feed visible when no face is detected

export function startVideoFallback(scanVideoEl, scanCanvasEl, enrollVideoEl, enrollCanvasEl) {
  setInterval(() => {
    if (!AppState.faceDetected && AppState.cameraActive) {
      if (AppState.screen === 'scan') drawVideoOnly(scanCanvasEl, scanVideoEl);
      if (AppState.screen === 'enroll') drawVideoOnly(enrollCanvasEl, enrollVideoEl);
    }
  }, 50);
}
