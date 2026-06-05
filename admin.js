// ================================================================
// DataLake 3.0 — screens/admin.js
// Admin panel: model status, storage info, threshold sliders, danger zone
// ================================================================

import { AppState } from '../state.js';
import { getAllWorkers, clearWorkers, clearLogs, syncDataToCloud } from '../db.js';
import { seedDemoData } from '../../assets/demo-data.js';
import { showToast, showConfirm } from '../ui.js';
import { renderLogs } from './logs.js';

const $ = (id) => document.getElementById(id);

// ==================== RENDER ====================

export async function renderAdmin() {
  const workers = await getAllWorkers();
  const wc = $('admin-worker-count');
  if (wc) wc.textContent = workers.length;

  const estimatedBytes = workers.reduce((s, w) => s + JSON.stringify(w).length, 0);
  const kb = Math.round(estimatedBytes / 1024) || 0;

  const st = $('storage-text');
  if (st) st.textContent = `IndexedDB Usage: ~${kb}KB / ${workers.length} workers`;

  const sf = $('storage-bar-fill');
  if (sf) sf.style.width = Math.min(100, (kb / 50) * 100) + '%';

  // Model statuses
  const bf = $('model-blazeface');
  const fm = $('model-facemesh');
  if (bf) {
    bf.textContent = AppState.mpLoaded ? 'LOADED' : 'LOADING';
    bf.className = `model-status ${AppState.mpLoaded ? 'loaded' : 'simulated'}`;
  }
  if (fm) {
    fm.textContent = AppState.mpLoaded ? 'LOADED' : 'LOADING';
    fm.className = `model-status ${AppState.mpLoaded ? 'loaded' : 'simulated'}`;
  }
}

// ==================== INIT ====================

export function initAdminScreen() {
  // Threshold sliders
  const ls = $('liveness-slider');
  const ms = $('match-slider');

  if (ls) {
    ls.addEventListener('input', (e) => {
      const val = e.target.value / 100;
      AppState.settings.livenessThreshold = val;
      $('liveness-val').textContent = val.toFixed(2);
    });
  }

  if (ms) {
    ms.addEventListener('input', (e) => {
      const val = e.target.value / 100;
      AppState.settings.matchThreshold = val;
      $('match-val').textContent = val.toFixed(2);
    });
  }

  // Danger zone
  const clearEnrollBtn = $('clear-enrollments-btn');
  const clearLogsBtn = $('clear-logs-btn');

  if (clearEnrollBtn) {
    clearEnrollBtn.addEventListener('click', async () => {
      const ok = await showConfirm(
        'Clear Enrollments',
        'This will delete all enrolled workers. This cannot be undone.'
      );
      if (ok) {
        await clearWorkers();
        showToast('All enrollments cleared', 'warning');
        await seedDemoData(); // Re-seed for demo
        renderAdmin();
      }
    });
  }

  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', async () => {
      const ok = await showConfirm(
        'Clear Logs',
        'This will delete all attendance logs. This cannot be undone.'
      );
      if (ok) {
        await clearLogs();
        showToast('All logs cleared', 'warning');
        renderLogs();
      }
    });
  }

  // Cloud Sync
  const renderInput = $('render-url-input');
  const saveUrlBtn = $('save-url-btn');
  const syncBtn = $('sync-cloud-btn');

  if (renderInput) {
    const savedUrl = localStorage.getItem('renderBackendUrl');
    if (savedUrl) renderInput.value = savedUrl;
  }

  if (saveUrlBtn) {
    saveUrlBtn.addEventListener('click', () => {
      const url = renderInput.value.trim();
      if (url) {
        localStorage.setItem('renderBackendUrl', url);
        showToast('Render URL saved!', 'success');
      }
    });
  }

  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      const url = localStorage.getItem('renderBackendUrl');
      if (!url) {
        showToast('Please save a Render URL first', 'fail');
        return;
      }
      
      const originalText = syncBtn.textContent;
      syncBtn.textContent = 'SYNCING...';
      try {
        await syncDataToCloud(url);
        showToast('Successfully synced to cloud!', 'success');
      } catch (err) {
        showToast(err.message || 'Sync failed', 'fail');
      } finally {
        syncBtn.textContent = originalText;
      }
    });
  }
}
