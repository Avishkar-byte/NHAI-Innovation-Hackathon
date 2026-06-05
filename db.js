// ================================================================
// DataLake 3.0 — db.js
// Pure async IndexedDB wrapper. No UI code.
// Each function opens its own transaction to avoid stale-transaction bugs.
// ================================================================

const DB_NAME = 'datalake3';
const DB_VERSION = 1;
let _db = null;

export async function openDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('workers')) {
        db.createObjectStore('workers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('logs')) {
        db.createObjectStore('logs', { keyPath: 'logId' });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ==================== WORKERS ====================

export function getAllWorkers() {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('workers', 'readonly');
    const req = tx.objectStore('workers').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function getWorker(id) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('workers', 'readonly');
    const req = tx.objectStore('workers').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function putWorker(worker) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('workers', 'readwrite');
    tx.objectStore('workers').put(worker);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function clearWorkers() {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('workers', 'readwrite');
    tx.objectStore('workers').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ==================== LOGS ====================

export function getAllLogs() {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('logs', 'readonly');
    const req = tx.objectStore('logs').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function putLog(log) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('logs', 'readwrite');
    tx.objectStore('logs').put(log);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function clearLogs() {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('logs', 'readwrite');
    tx.objectStore('logs').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ==================== SYNC (RENDER) ====================

export async function syncDataToCloud(backendUrl) {
  if (!backendUrl) throw new Error("No backend URL configured.");
  
  const cleanUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;

  // 1. Sync Workers
  const workers = await getAllWorkers();
  if (workers.length > 0) {
    const wRes = await fetch(`${cleanUrl}/api/sync/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workers })
    });
    if (!wRes.ok) throw new Error("Failed to sync workers");
  }

  // 2. Sync Logs
  const logs = await getAllLogs();
  if (logs.length > 0) {
    const lRes = await fetch(`${cleanUrl}/api/sync/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs })
    });
    if (!lRes.ok) throw new Error("Failed to sync logs");
  }
}
