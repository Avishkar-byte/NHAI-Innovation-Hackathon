// ================================================================
// DataLake 3.0 — screens/scan.js
// Scan screen orchestration: face detected → liveness → recognition → result
// ================================================================

import { AppState, resetScanState, computeFusedScore } from '../state.js';
import { putLog } from '../db.js';
import { runLivenessPipeline, abortLiveness } from '../liveness.js';
import { computeEmbedding, matchFace } from '../recognition.js';
import {
  setStatus, setFaceRingState, setSweepLine, hideInstruction,
  hideScanWarning, resetPills, updateProgressRing, animateConfidence,
  showResultCard, showScanWarning, showToast,
} from '../ui.js';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ==================== SCAN STATE MACHINE ====================

let detectTimer = null;

// Called by mediapipe.js indirectly through state — we poll via interval
export function initScanWatcher(videoEl) {
  // Watch for face detection → start liveness after 1.2s stable detection
  setInterval(() => {
    if (AppState.screen !== 'scan') return;

    if (AppState.scanState === 'detecting' && !AppState.livenessRunning && AppState.faceDetected) {
      const elapsed = performance.now() - AppState.faceFirstSeen;
      if (elapsed > 1200) {
        startScanLiveness(videoEl);
      }
    }
  }, 200);
}

async function startScanLiveness(videoEl) {
  setFaceRingState('liveness');
  setStatus('amber', 'Liveness check...');

  try {
    await runLivenessPipeline(videoEl, async (fusedScore) => {
      // Liveness complete — now decide
      if (fusedScore >= AppState.settings.livenessThreshold) {
        await runRecognition(fusedScore);
      } else {
        setFaceRingState('fail');
        setStatus('red', 'Spoof detected — Access denied');
        showResultCard('spoof', null, fusedScore);
        await logEntry(null, null, fusedScore, 0, 'SPOOF');
        await delay(3500);
        resetScan();
      }
    });
  } catch (e) {
    console.error('[Liveness pipeline error]', e);
    showToast('Liveness error — retrying', 'error');
    resetScan();
  }
}

async function runRecognition(livenessScore) {
  AppState.scanState = 'recognizing';
  setStatus('blue', 'Matching face...');

  if (!AppState.landmarks) {
    resetScan();
    return;
  }

  const embedding = computeEmbedding(AppState.landmarks);
  const result = await matchFace(embedding, AppState.settings.matchThreshold);

  if (result.matched) {
    setFaceRingState('success');
    setStatus('green', `${result.worker.name} — ${result.worker.id}`);
    showResultCard('success', result.worker, livenessScore, result.confidence);
    await logEntry(result.worker.id, result.worker.name, livenessScore, result.confidence, 'VERIFIED');
  } else {
    setFaceRingState('fail');
    setStatus('red', 'Face not enrolled');
    showResultCard('nomatch', null, livenessScore, result.confidence);
    await logEntry(null, 'Unknown', livenessScore, result.confidence, 'NO_MATCH');
  }

  await delay(3500);
  resetScan();
}

async function logEntry(workerId, workerName, livenessScore, matchScore, result) {
  try {
    await putLog({
      logId: uuid(),
      workerId: workerId || 'UNKNOWN',
      workerName: workerName || 'Unknown',
      timestamp: Date.now(),
      livenessScore: Math.round(livenessScore * 100) / 100,
      matchScore: Math.round(matchScore * 100) / 100,
      result,
      synced: false,
    });
  } catch (e) {
    console.error('[Log]', e);
  }
}

// ==================== RESET ====================

export function resetScan() {
  resetScanState();
  setFaceRingState('');
  setSweepLine(false);
  hideInstruction();
  hideScanWarning();
  resetPills();
  updateProgressRing(0);
  animateConfidence(0);
  if (AppState.mpLoaded) setStatus('green', 'Place face in frame');
}

// Called when switching away from scan screen
export function cleanupScan() {
  if (AppState.livenessRunning) abortLiveness('Screen changed');
  resetScan();
}
