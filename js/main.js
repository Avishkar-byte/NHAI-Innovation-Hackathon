// ================================================================
// DataLake 3.0 — main.js
// Entry point: boots DB → seeds demo → inits MediaPipe → starts camera
//              → starts frame loop (only after both are ready)
// ================================================================

import { AppState } from './state.js';
import { openDB } from './db.js';
import { seedDemoData } from '../assets/demo-data.js';
import { initMediaPipe, startCamera, attachStreamToVideo, startFrameLoop, startVideoFallback } from './mediapipe.js';
import { switchScreen, showToast, initModal, showCameraError, hideCameraError, setStatus } from './ui.js';
import { initScanWatcher, cleanupScan, resetScan } from './screens/scan.js';
import { initEnrollScreen } from './screens/enroll-screen.js';
import { renderLogs, initSyncButton } from './screens/logs.js';
import { renderAdmin, initAdminScreen } from './screens/admin.js';

const $ = (id) => document.getElementById(id);

// ==================== BOOT ====================

async function boot() {
  try {
    console.log('[DataLake 3.0] Booting...');

    // 1. Open IndexedDB
    await openDB();
    console.log('[Boot] DB opened');

    // 2. Seed demo data if first run
    await seedDemoData();
    console.log('[Boot] Demo data ready');

    // 3. Init modal system
    initModal();

    // 4. Init tab bar
    initTabBar();

    // 5. Init screen modules
    initEnrollScreen(() => handleScreenSwitch('scan'));
    initSyncButton();
    initAdminScreen();

    // 6. Get DOM elements
    const scanVideo = $('scan-video');
    const scanCanvas = $('scan-canvas');
    const enrollVideo = $('enroll-video');
    const enrollCanvas = $('enroll-canvas');

    // Hide native video elements (we draw them on canvas)
    scanVideo.style.opacity = '0';
    enrollVideo.style.opacity = '0';

    // 7. Start camera FIRST (so video element has a stream)
    try {
      await startCamera(scanVideo);
      hideCameraError();
      attachStreamToVideo(enrollVideo);
      console.log('[Boot] Camera active');
    } catch (e) {
      console.error('[Boot] Camera error:', e);
      showCameraError();
    }

    // 8. Init MediaPipe SECOND (awaits WASM download + warmup)
    //    This can take several seconds on first load
    await initMediaPipe(scanVideo);
    console.log('[Boot] MediaPipe ready');

    // 9. NOW start the frame loop — both camera and faceMesh are ready
    startFrameLoop(scanVideo);
    console.log('[Boot] Frame loop started');

    // 10. Start scan watcher (polls for face detection → triggers liveness)
    initScanWatcher(scanVideo);

    // 11. Start video fallback (draws video when no face detected)
    startVideoFallback(scanVideo, scanCanvas, enrollVideo, enrollCanvas);

    // 12. Wire camera retry button
    const retryBtn = $('camera-error-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        hideCameraError();
        try {
          await startCamera(scanVideo);
          hideCameraError();
          attachStreamToVideo(enrollVideo);
          startFrameLoop(scanVideo);
        } catch (e) {
          showCameraError();
        }
      });
    }

    // 13. Wire + enroll button
    const scanAddBtn = $('scan-add-btn');
    if (scanAddBtn) {
      scanAddBtn.addEventListener('click', () => handleScreenSwitch('enroll'));
    }

    console.log('[DataLake 3.0] Boot complete ✓');

  } catch (err) {
    console.error('[DataLake 3.0] Boot error:', err);
    showToast('Initialization failed: ' + err.message, 'error');
  }
}

// ==================== TAB BAR ====================

function initTabBar() {
  document.querySelectorAll('.tab-item').forEach((tab) => {
    tab.addEventListener('click', () => {
      const screen = tab.dataset.screen;
      if (screen) handleScreenSwitch(screen);
    });
  });
}

function handleScreenSwitch(name) {
  const enrollVideo = $('enroll-video');

  switchScreen(name, () => {
    // Cleanup callback for leaving scan screen
    cleanupScan();
  });

  // Screen-specific setup
  if (name === 'scan' || name === 'enroll') {
    if (AppState.cameraStream) {
      if (name === 'enroll') attachStreamToVideo(enrollVideo);
    }
  }
  if (name === 'logs') renderLogs();
  if (name === 'admin') renderAdmin();
}

// ==================== START ====================

document.addEventListener('DOMContentLoaded', boot);
