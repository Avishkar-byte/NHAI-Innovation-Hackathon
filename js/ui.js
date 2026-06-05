// ================================================================
// DataLake 3.0 — ui.js
// All DOM mutations. No business logic.
// ================================================================

import { AppState, PROGRESS_CIRCUMFERENCE } from './state.js';

const $ = (id) => document.getElementById(id);

// ==================== SCREEN SWITCHING ====================

export function switchScreen(name, onSwitchCallback) {
  // Cleanup previous screen
  if (AppState.screen === 'scan' && name !== 'scan') {
    if (onSwitchCallback) onSwitchCallback(); // let scan.js abort liveness
  }

  // Toggle screen visibility
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');

  // Toggle tab active state
  document.querySelectorAll('.tab-item').forEach((t) => t.classList.remove('active'));
  document.querySelector(`.tab-item[data-screen="${name}"]`).classList.add('active');

  AppState.screen = name;

  // Scroll content to top
  $('content-area').scrollTop = 0;
}

// ==================== SCAN UI ====================

export function setStatus(color, text) {
  const dot = $('status-dot');
  const txt = $('status-text');
  if (dot) dot.className = `status-dot ${color}`;
  if (txt) txt.textContent = text;
}

export function setFaceRingState(state) {
  const ring = $('face-guide-ring');
  if (ring) ring.className = `face-guide-ring${state ? ' ' + state : ''}`;
}

export function setSweepLine(active) {
  const el = $('sweep-line');
  if (!el) return;
  if (active) el.classList.add('active');
  else el.classList.remove('active');
}

export function showInstruction(text) {
  const card = $('instruction-card');
  const txt = $('instruction-text');
  if (txt) txt.textContent = text;
  if (card) card.classList.add('visible');
}

export function hideInstruction() {
  const card = $('instruction-card');
  if (card) card.classList.remove('visible');
}

export function setPill(id, state) {
  const pill = $(`pill-${id}`);
  if (pill) pill.className = `signal-pill ${state}`;
}

export function resetPills() {
  ['ear', 'flow', 'left', 'right', 'texture', 'depth'].forEach((id) => setPill(id, 'idle'));
}

export function updateProgressRing(pct) {
  const fill = $('progress-ring-fill');
  if (fill) {
    const offset = PROGRESS_CIRCUMFERENCE * (1 - pct);
    fill.setAttribute('stroke-dashoffset', offset);
  }
}

let confidenceAnimFrame = null;
export function animateConfidence(target) {
  if (confidenceAnimFrame) cancelAnimationFrame(confidenceAnimFrame);
  const el = $('confidence-value');
  if (!el) return;

  const start = AppState.displayedScore;
  const diff = target - start;
  const duration = 500;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = 1 - (1 - t) ** 3; // easeOutCubic
    const current = Math.round(start + diff * eased);
    AppState.displayedScore = current;
    el.textContent = current + '%';
    el.style.color =
      current >= 72 ? 'var(--accent-green)' :
      current >= 50 ? 'var(--accent-amber)' :
      'var(--text-muted)';
    if (t < 1) confidenceAnimFrame = requestAnimationFrame(step);
  }

  confidenceAnimFrame = requestAnimationFrame(step);
}

// ==================== RESULT CARD ====================

export function showResultCard(type, worker, livenessScore, matchScore) {
  const rc = $('result-card');
  if (!rc) return;
  rc.className = 'result-card visible';

  if (type === 'success') {
    rc.classList.add('success');
    $('result-name').textContent = worker.name;
    $('result-detail-1').textContent = worker.id + '  •  ' + worker.role;
    $('result-detail-2').textContent = new Date().toLocaleString();
    $('result-detail-3').textContent = `Confidence: ${Math.round(matchScore * 100)}%`;
    $('result-badge').textContent = 'ATTENDANCE RECORDED';
    $('result-badge').className = 'result-badge verified';
  } else if (type === 'spoof') {
    rc.classList.add('spoof');
    $('result-name').textContent = 'Spoof Detected';
    $('result-detail-1').textContent = 'Liveness check failed';
    $('result-detail-2').textContent = `Score: ${Math.round(livenessScore * 100)}%`;
    $('result-detail-3').textContent = new Date().toLocaleString();
    $('result-badge').textContent = 'ACCESS DENIED';
    $('result-badge').className = 'result-badge denied';
  } else {
    rc.classList.add('fail');
    $('result-name').textContent = 'No Match Found';
    $('result-detail-1').textContent = 'Face not enrolled in system';
    $('result-detail-2').textContent = `Best similarity: ${Math.round((matchScore || 0) * 100)}%`;
    $('result-detail-3').textContent = new Date().toLocaleString();
    $('result-badge').textContent = 'ACCESS DENIED';
    $('result-badge').className = 'result-badge denied';
  }

  setTimeout(() => { rc.className = 'result-card'; }, 3200);
}

// ==================== WARNINGS ====================

export function showScanWarning(text, color) {
  const el = $('scan-warning');
  if (!el) return;
  el.textContent = text;
  el.className = `warning-banner visible ${color}`;
}

export function hideScanWarning() {
  const el = $('scan-warning');
  if (el) el.className = 'warning-banner';
}

// ==================== CAMERA ERRORS ====================

export function showCameraError() {
  const el = $('camera-error');
  if (el) el.classList.add('visible');
  const el2 = $('enroll-camera-error');
  if (el2) el2.classList.add('visible');
}

export function hideCameraError() {
  const el = $('camera-error');
  if (el) el.classList.remove('visible');
  const el2 = $('enroll-camera-error');
  if (el2) el2.classList.remove('visible');
}

// ==================== LOADING ====================

export function hideLoading() {
  const el = $('mp-loading');
  if (el) el.classList.add('hidden');
}

export function showLoadingError() {
  const el = $('mp-loading');
  if (!el) return;
  const txt = el.querySelector('.loading-text');
  if (txt) txt.textContent = 'MODEL LOAD FAILED — RETRYING...';
}

// ==================== CANVAS RENDERING ====================

export function renderLandmarks(canvas, video, landmarks) {
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw mirrored video
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  // Draw landmark dots
  ctx.fillStyle = 'rgba(0, 229, 160, 0.5)';
  for (const lm of landmarks) {
    const x = (1 - lm.x) * canvas.width;
    const y = lm.y * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawVideoOnly(canvas, video) {
  if (video.readyState < 2) return;
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// ==================== TOAST ====================

export function showToast(message, type = 'info', duration = 3000) {
  const container = $('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ==================== MODAL ====================

let modalResolve = null;

export function showConfirm(title, message) {
  return new Promise((resolve) => {
    $('modal-title').textContent = title;
    $('modal-message').textContent = message;
    $('modal-overlay').classList.add('visible');
    modalResolve = resolve;
  });
}

export function initModal() {
  $('modal-cancel').onclick = () => {
    $('modal-overlay').classList.remove('visible');
    if (modalResolve) modalResolve(false);
  };
  $('modal-confirm').onclick = () => {
    $('modal-overlay').classList.remove('visible');
    if (modalResolve) modalResolve(true);
  };
}

// ==================== ENROLL UI ====================

export function setEnrollFaceGuide(state) {
  const guide = $('enroll-face-guide');
  if (guide) guide.className = `face-guide-ring${state ? ' ' + state : ''}`;
}

export function setCaptureButtonEnabled(enabled) {
  const btn = $('capture-btn');
  if (btn) btn.disabled = !enabled;
}
