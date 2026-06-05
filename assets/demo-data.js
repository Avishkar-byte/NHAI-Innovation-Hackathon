// ================================================================
// DataLake 3.0 — demo-data.js
// Pre-seeded workers and logs for demonstration
// ================================================================

import { getAllWorkers, putWorker, putLog } from '../js/db.js';

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateDemoEmbedding(seed) {
  const rng = mulberry32(seed * 73856093);
  const emb = new Array(128);
  for (let i = 0; i < 128; i++) emb[i] = rng() * 2 - 1;
  const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0)) || 1;
  return emb.map((v) => v / norm);
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const DEMO_WORKERS = [
  { id: 'EMP-1174', name: 'Avishkar Jaiswal', role: 'Lead Engineer',    embedding: generateDemoEmbedding(1), enrolledAt: Date.now(), captureCount: 5 },
  { id: 'EMP-1205', name: 'Samyak Jain',      role: 'Field Technician', embedding: generateDemoEmbedding(2), enrolledAt: Date.now(), captureCount: 5 },
  { id: 'EMP-1140', name: 'Harsh Yadav',      role: 'Site Supervisor',  embedding: generateDemoEmbedding(3), enrolledAt: Date.now(), captureCount: 5 },
];

export async function seedDemoData() {
  const existing = await getAllWorkers();
  if (existing.length > 0) return; // Already seeded

  for (const w of DEMO_WORKERS) {
    await putWorker(w);
  }

  const now = Date.now();
  const demoLogs = [
    { logId: uuid(), workerId: 'EMP-1174', workerName: 'Avishkar Jaiswal', timestamp: now - 3600000 * 5, livenessScore: 0.91, matchScore: 0.88, result: 'VERIFIED', synced: false },
    { logId: uuid(), workerId: 'EMP-1205', workerName: 'Samyak Jain',      timestamp: now - 3600000 * 4, livenessScore: 0.85, matchScore: 0.84, result: 'VERIFIED', synced: false },
    { logId: uuid(), workerId: 'EMP-1140', workerName: 'Harsh Yadav',      timestamp: now - 3600000 * 3, livenessScore: 0.32, matchScore: 0,    result: 'SPOOF',    synced: false },
    { logId: uuid(), workerId: 'EMP-1174', workerName: 'Avishkar Jaiswal', timestamp: now - 3600000 * 2, livenessScore: 0.89, matchScore: 0.86, result: 'VERIFIED', synced: false },
    { logId: uuid(), workerId: 'UNKNOWN',  workerName: 'Unknown',           timestamp: now - 3600000 * 1, livenessScore: 0.78, matchScore: 0.41, result: 'NO_MATCH', synced: false },
  ];

  for (const l of demoLogs) {
    await putLog(l);
  }

  console.log('[Demo] Seeded 3 workers, 5 logs');
}
