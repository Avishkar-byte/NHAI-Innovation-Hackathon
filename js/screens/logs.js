// ================================================================
// DataLake 3.0 — screens/logs.js
// Log list rendering + AWS sync animation
// ================================================================

import { getAllLogs, clearLogs } from '../db.js';
import { showToast } from '../ui.js';

const $ = (id) => document.getElementById(id);

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatTimestamp(ts) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ==================== RENDER ====================

export async function renderLogs() {
  const logs = await getAllLogs();
  logs.sort((a, b) => b.timestamp - a.timestamp);

  const list = $('log-list');
  if (!list) return;
  list.innerHTML = '';

  if (logs.length === 0) {
    list.innerHTML = '<div class="empty-state">No log entries yet</div>';
  }

  const today = new Date().toDateString();
  let todayCount = 0, spoofCount = 0, pendingCount = 0;

  for (const log of logs) {
    if (new Date(log.timestamp).toDateString() === today) todayCount++;
    if (log.result === 'SPOOF') spoofCount++;
    if (!log.synced) pendingCount++;

    const dotColor = log.result === 'VERIFIED' ? 'var(--accent-green)' : 'var(--accent-red)';
    const badgeClass = log.result === 'VERIFIED' ? 'verified' : log.result === 'SPOOF' ? 'spoof' : 'nomatch';
    const badgeText = log.result === 'VERIFIED' ? 'VERIFIED' : log.result === 'SPOOF' ? 'SPOOF' : 'NO MATCH';

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
      <div class="log-entry-top">
        <div class="log-dot" style="background:${dotColor};box-shadow:0 0 6px ${dotColor}40"></div>
        <span class="log-name">${log.workerName}</span>
        <span class="log-id">— ${log.workerId}</span>
      </div>
      <div class="log-entry-bottom">
        <span class="log-meta">${formatTimestamp(log.timestamp)}</span>
        <span class="log-meta">•</span>
        <span class="log-meta">Score: ${Math.round(log.livenessScore * 100)}%</span>
        <span class="log-result-badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
    list.appendChild(entry);
  }

  const st = $('stat-today');
  const ss = $('stat-spoofs');
  const sp = $('stat-pending');
  if (st) st.textContent = todayCount;
  if (ss) ss.textContent = spoofCount;
  if (sp) sp.textContent = pendingCount;
}

// ==================== SYNC ====================

export function initSyncButton() {
  const btn = $('sync-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const progress = $('sync-progress');
    const fill = $('sync-progress-fill');

    btn.classList.add('syncing');
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> SYNCING...';
    if (progress) progress.classList.add('visible');

    // Progress animation
    for (let i = 0; i <= 100; i += 5) {
      if (fill) fill.style.width = i + '%';
      await delay(40);
    }

    const logs = await getAllLogs();
    await delay(500);
    showToast(`${logs.length} records uploaded`, 'success');
    await delay(800);

    await clearLogs();
    showToast('Local logs purged', 'info');

    const badge = $('sync-badge');
    if (badge) {
      badge.className = 'sync-badge synced';
      badge.textContent = 'SYNCED';
    }

    btn.classList.remove('syncing');
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6M3 22v-6h6"/><path d="M21 12A9 9 0 006 5.3L3 8M3 12a9 9 0 0015 6.7l3-2.7"/></svg> SYNC TO AWS`;

    if (progress) progress.classList.remove('visible');
    if (fill) fill.style.width = '0%';

    renderLogs();

    setTimeout(() => {
      if (badge) {
        badge.className = 'sync-badge offline';
        badge.textContent = 'OFFLINE';
      }
    }, 5000);
  });
}
