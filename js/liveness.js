// ================================================================
// DataLake 3.0 — liveness.js
// 5 signal algorithms + ACE challenge sequencer.
// Only math + state mutations. UI calls go through ui.js imports.
// ================================================================

import {
  AppState, LIVENESS_CHALLENGES, EYE_LEFT, EYE_RIGHT,
  setSignalScore, computeFusedScore,
} from './state.js';
import {
  showInstruction, hideInstruction, setPill, resetPills, setStatus,
  updateProgressRing, animateConfidence, showToast,
} from './ui.js';

// ==================== FRAME COLLECTION ====================
// Promise-based frame collector that resolves when enough frames arrive
// or times out after maxWait ms.

function collectFrames(numFrames, maxWaitMs = 6000) {
  return new Promise((resolve) => {
    AppState.livenessFrameBuffer = [];
    AppState.livenessFrameTarget = numFrames;
    AppState.livenessCollecting = true;

    const timeout = setTimeout(() => {
      // Timeout: use whatever partial frames we have
      AppState.livenessCollecting = false;
      const partial = [...AppState.livenessFrameBuffer];
      AppState.livenessResolve = null;
      resolve(partial.length >= 3 ? partial : null);
    }, maxWaitMs);

    AppState.livenessResolve = (frames) => {
      clearTimeout(timeout);
      resolve(frames);
    };
  });
}

// Called by mediapipe.js on each frame when livenessCollecting is true
export function pushLivenessFrame(landmarks) {
  if (!AppState.livenessCollecting) return;

  AppState.livenessFrameBuffer.push({
    landmarks: landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z || 0 })),
    ts: performance.now(),
  });

  if (
    AppState.livenessFrameBuffer.length >= AppState.livenessFrameTarget &&
    AppState.livenessResolve
  ) {
    const resolve = AppState.livenessResolve;
    AppState.livenessResolve = null;
    AppState.livenessCollecting = false;
    resolve([...AppState.livenessFrameBuffer]);
  }
}

// ==================== SIGNAL ALGORITHMS ====================

function dist2d(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function computeEAR(lm, eyeIdx) {
  const p = eyeIdx.map((i) => lm[i]);
  const v1 = dist2d(p[1], p[5]);
  const v2 = dist2d(p[2], p[4]);
  const h = dist2d(p[0], p[3]);
  return (v1 + v2) / (2 * h + 0.0001);
}

function earScore(frames) {
  let minEAR = 1;
  const ears = [];
  for (const f of frames) {
    const lEAR = computeEAR(f.landmarks, EYE_LEFT);
    const rEAR = computeEAR(f.landmarks, EYE_RIGHT);
    const avg = (lEAR + rEAR) / 2;
    ears.push(avg);
    if (avg < minEAR) minEAR = avg;
  }
  if (minEAR < 0.20) return 1.0;
  if (minEAR < 0.24) return 0.7;
  const mean = ears.reduce((s, v) => s + v, 0) / ears.length;
  const variance = ears.reduce((s, v) => s + (v - mean) ** 2, 0) / ears.length;
  if (variance > 0.0005) return 0.5;
  return 0.1;
}

function flowScore(frames) {
  if (frames.length < 8) return 0.5;
  const nose = frames.map((f) => f.landmarks[1]);
  const lE = frames.map((f) => f.landmarks[234]);
  const rE = frames.map((f) => f.landmarks[454]);

  const variance = (arr) => {
    const mx = arr.reduce((s, p) => s + p.x, 0) / arr.length;
    const my = arr.reduce((s, p) => s + p.y, 0) / arr.length;
    return arr.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / arr.length;
  };

  const nv = variance(nose);
  const ev = (variance(lE) + variance(rE)) / 2;
  const ratio = ev > 1e-7 ? nv / ev : 1;

  if (ratio > 1.4) return 1.0;
  if (ratio > 1.2) return 0.7;
  if (ratio > 1.05) return 0.4;
  return 0.1;
}

function parallaxScore(frames) {
  if (frames.length < 8) return 0.5;
  const noseX = frames.map((f) => f.landmarks[1].x);
  const lEarX = frames.map((f) => f.landmarks[234].x);
  const rEarX = frames.map((f) => f.landmarks[454].x);

  const disp = (a) => {
    let m = 0;
    for (let i = 1; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - a[0]));
    return m;
  };

  const nD = disp(noseX);
  const eD = (disp(lEarX) + disp(rEarX)) / 2;
  const ratio = eD > 0.0001 ? nD / eD : 1;

  if (ratio > 1.3) return 1.0;
  if (ratio > 1.15) return 0.7;
  if (ratio > 1.05) return 0.4;
  return 0.15;
}

function textureScore(video, landmarks) {
  if (!video || video.readyState < 2 || !landmarks) return 0.5;

  const oc = document.createElement('canvas');
  oc.width = 64;
  oc.height = 64;
  const octx = oc.getContext('2d');

  let mnX = 1, mnY = 1, mxX = 0, mxY = 0;
  for (const l of landmarks) {
    mnX = Math.min(mnX, l.x);
    mnY = Math.min(mnY, l.y);
    mxX = Math.max(mxX, l.x);
    mxY = Math.max(mxY, l.y);
  }

  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  const sx = mnX * vw, sy = mnY * vh;
  const sw = (mxX - mnX) * vw, sh = (mxY - mnY) * vh;

  if (sw < 10 || sh < 10) return 0.5;

  octx.drawImage(video, sx, sy, sw, sh, 0, 0, 64, 64);
  const imgData = octx.getImageData(0, 0, 64, 64).data;

  const gray = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) {
    gray[i] = 0.299 * imgData[i * 4] + 0.587 * imgData[i * 4 + 1] + 0.114 * imgData[i * 4 + 2];
  }

  const blurred = new Float32Array(4096);
  for (let y = 1; y < 63; y++) {
    for (let x = 1; x < 63; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          s += gray[(y + dy) * 64 + (x + dx)];
        }
      }
      blurred[y * 64 + x] = s / 9;
    }
  }

  let sum = 0, sqSum = 0, cnt = 0;
  for (let y = 1; y < 63; y++) {
    for (let x = 1; x < 63; x++) {
      const r = Math.abs(gray[y * 64 + x] - blurred[y * 64 + x]);
      sum += r;
      sqSum += r * r;
      cnt++;
    }
  }

  const mean = sum / cnt;
  const variance = sqSum / cnt - mean * mean;
  return Math.max(0.05, Math.min(1.0, Math.exp(-((variance - 25) ** 2) / (2 * 144))));
}

function depthScore(frames) {
  let totalSpread = 0;
  for (const f of frames) {
    let minZ = Infinity, maxZ = -Infinity;
    for (const lm of f.landmarks) {
      const z = lm.z || 0;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    totalSpread += maxZ - minZ;
  }
  return Math.min(1.0, totalSpread / frames.length / 0.05);
}

// ==================== PIPELINE ====================

function shuffleMiddle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// onComplete(fusedScore) is called when pipeline finishes
export async function runLivenessPipeline(videoElement, onComplete) {
  AppState.livenessRunning = true;
  AppState.scanState = 'liveness';

  // Reset signals
  for (const k of Object.keys(AppState.livenessSignals)) AppState.livenessSignals[k] = null;
  resetPills();
  updateProgressRing(0);
  animateConfidence(0);

  // Build challenge order: EAR first, DEPTH last, middle randomized
  const order = [LIVENESS_CHALLENGES[0]]; // EAR first
  const middle = [LIVENESS_CHALLENGES[1], LIVENESS_CHALLENGES[2], LIVENESS_CHALLENGES[3], LIVENESS_CHALLENGES[4]];
  shuffleMiddle(middle);
  order.push(...middle);
  order.push(LIVENESS_CHALLENGES[5]); // DEPTH last

  for (let i = 0; i < order.length; i++) {
    const ch = order[i];
    AppState.currentChallenge = ch;

    // Show instruction
    showInstruction(ch.instruction);
    setPill(ch.id, 'checking');
    setStatus('amber', ch.instruction);

    await delay(500);

    // Check face is still present
    if (!AppState.faceDetected && AppState.consecutiveLost > 15) {
      abortLiveness('Face lost');
      return;
    }

    // Collect frames
    const frames = await collectFrames(ch.frames, 6000);

    if (!frames || frames.length < 3) {
      abortLiveness('Insufficient data');
      return;
    }

    // Compute score
    let score = 0;
    switch (ch.id) {
      case 'ear':      score = earScore(frames); break;
      case 'flow':     score = flowScore(frames); break;
      case 'left':     score = parallaxScore(frames); break;
      case 'right':    score = parallaxScore(frames); break;
      case 'texture':  score = textureScore(videoElement, AppState.landmarks); break;
      case 'depth':    score = depthScore(frames); break;
    }

    setSignalScore(ch.id, score);
    setPill(ch.id, score >= 0.45 ? 'passed' : 'failed');

    const running = computeFusedScore();
    updateProgressRing(running);
    animateConfidence(Math.round(running * 100));

    hideInstruction();

    if (i < order.length - 1) await delay(1200);
  }

  // Final
  const fused = computeFusedScore();
  AppState.fusedScore = fused;
  animateConfidence(Math.round(fused * 100));
  updateProgressRing(fused);

  if (onComplete) onComplete(fused);
}

export function abortLiveness(reason) {
  hideInstruction();
  AppState.livenessCollecting = false;
  AppState.livenessResolve = null;
  AppState.livenessRunning = false;
  showToast(reason || 'Liveness interrupted', 'warning');
}
