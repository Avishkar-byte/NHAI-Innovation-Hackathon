// ================================================================
// DataLake 3.0 — screens/enroll-screen.js
// Enrollment capture flow: form + 5 captures + register
// ================================================================

import { AppState, ANGLE_INSTRUCTIONS, resetEnrollState } from '../state.js';
import { putWorker } from '../db.js';
import { computeEmbedding, computeMeanEmbedding } from '../recognition.js';
import { showToast } from '../ui.js';

const $ = (id) => document.getElementById(id);

export function initEnrollScreen(onSwitchToScan) {
  const captureBtn = $('capture-btn');
  const registerBtn = $('register-btn');

  if (captureBtn) {
    captureBtn.addEventListener('click', () => {
      if (!AppState.faceDetected || !AppState.landmarks) return;
      const idx = AppState.enrollCaptures.length;
      if (idx >= 5) return;

      const embedding = computeEmbedding(AppState.landmarks);
      AppState.enrollCaptures.push(embedding);

      // Update UI
      $('capture-count').textContent = AppState.enrollCaptures.length;
      const circles = document.querySelectorAll('.capture-circle');
      if (circles[idx]) circles[idx].classList.add('filled');

      if (AppState.enrollCaptures.length < 5) {
        $('angle-instruction').textContent = ANGLE_INSTRUCTIONS[AppState.enrollCaptures.length];
      } else {
        $('angle-instruction').textContent = 'ALL CAPTURES COMPLETE';
        captureBtn.disabled = true;
        registerBtn.classList.add('visible');
      }

      showToast(`Capture ${AppState.enrollCaptures.length}/5 saved`, 'success', 1500);
    });
  }

  if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
      const id = $('enroll-id').value.trim();
      const name = $('enroll-name').value.trim();
      const role = $('enroll-role').value.trim();

      if (!id || !name) {
        showToast('Employee ID and Name required', 'error');
        return;
      }
      if (AppState.enrollCaptures.length < 5) {
        showToast('Need 5 captures', 'error');
        return;
      }

      const mean = computeMeanEmbedding(AppState.enrollCaptures);

      const worker = {
        id,
        name,
        role,
        embedding: Array.from(mean),
        enrolledAt: Date.now(),
        captureCount: 5,
      };

      await putWorker(worker);

      const sizeKB = Math.round((JSON.stringify(worker).length / 1024) * 10) / 10 || 2;
      showToast(`${id} enrolled. ~${sizeKB}KB stored.`, 'success');

      resetEnrollUI();
      if (onSwitchToScan) onSwitchToScan();
    });
  }
}

export function resetEnrollUI() {
  resetEnrollState();
  $('enroll-id').value = '';
  $('enroll-name').value = '';
  $('enroll-role').value = '';
  $('capture-count').textContent = '0';
  $('angle-instruction').textContent = 'FACE FORWARD';
  $('register-btn').classList.remove('visible');
  $('capture-btn').disabled = true;
  document.querySelectorAll('.capture-circle').forEach((c) => c.classList.remove('filled'));
}
