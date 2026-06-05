// ================================================================
// DataLake 3.0 — recognition.js
// Geometric face embedding generation and cosine similarity matching.
// No DOM access.
// ================================================================

import { getAllWorkers } from './db.js';
import { EMBED_LANDMARKS } from './state.js';

// ==================== GEOMETRY ====================

function dist3d(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
}

function angle3(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const mag = Math.sqrt(ba.x ** 2 + ba.y ** 2) * Math.sqrt(bc.x ** 2 + bc.y ** 2) || 1;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) / Math.PI;
}

// ==================== EMBEDDING ====================

export function computeEmbedding(landmarks) {
  const pts = {};
  for (const [name, idx] of Object.entries(EMBED_LANDMARKS)) {
    pts[name] = landmarks[idx];
  }

  // 20 primary inter-landmark distances
  const dists = [
    dist3d(pts.leftEyeOuter, pts.rightEyeOuter),
    dist3d(pts.leftEyeInner, pts.rightEyeInner),
    dist3d(pts.noseTip, pts.chin),
    dist3d(pts.forehead, pts.chin),
    dist3d(pts.leftCheek, pts.rightCheek),
    dist3d(pts.noseBridge, pts.noseTip),
    dist3d(pts.leftMouth, pts.rightMouth),
    dist3d(pts.upperLip, pts.lowerLip),
    dist3d(pts.leftEyeOuter, pts.leftMouth),
    dist3d(pts.rightEyeOuter, pts.rightMouth),
    dist3d(pts.leftEyebrowOuter, pts.leftEyeOuter),
    dist3d(pts.rightEyebrowOuter, pts.rightEyeOuter),
    dist3d(pts.noseLeft, pts.noseRight),
    dist3d(pts.forehead, pts.noseBridge),
    dist3d(pts.noseTip, pts.upperLip),
    dist3d(pts.leftEyeInner, pts.noseBridge),
    dist3d(pts.rightEyeInner, pts.noseBridge),
    dist3d(pts.leftEyebrowInner, pts.rightEyebrowInner),
    dist3d(pts.chin, pts.leftMouth),
    dist3d(pts.chin, pts.rightMouth),
  ];

  // Normalize by face width for scale invariance
  const fw = dists[4] || 0.001;
  const nd = dists.map((d) => d / fw);

  const features = [];

  // Normalized distances (20)
  features.push(...nd);

  // Ratios (20)
  for (let i = 0; i < 10; i++) {
    features.push(nd[i] / (nd[i + 10] || 0.001));
    features.push(nd[i + 10] / (nd[i] || 0.001));
  }

  // Squared distances (20)
  for (let i = 0; i < 20; i++) features.push(nd[i] * nd[i]);

  // Cross products (10)
  for (let i = 0; i < 10; i++) features.push(nd[i] * nd[19 - i]);

  // Sqrt distances (20)
  for (let i = 0; i < 20; i++) features.push(Math.sqrt(Math.abs(nd[i])));

  // Angles (8)
  features.push(angle3(pts.leftEyeOuter, pts.noseTip, pts.rightEyeOuter));
  features.push(angle3(pts.leftMouth, pts.noseTip, pts.rightMouth));
  features.push(angle3(pts.forehead, pts.noseTip, pts.chin));
  features.push(angle3(pts.leftEyeInner, pts.noseBridge, pts.rightEyeInner));
  features.push(angle3(pts.leftCheek, pts.chin, pts.rightCheek));
  features.push(angle3(pts.leftEyebrowOuter, pts.forehead, pts.rightEyebrowOuter));
  features.push(angle3(pts.upperLip, pts.noseTip, pts.chin));
  features.push(angle3(pts.leftMouth, pts.chin, pts.rightMouth));

  // More derived features (30)
  for (let i = 0; i < 15; i++) features.push((nd[i] + nd[i + 5]) / 2);
  for (let i = 0; i < 15; i++) features.push(Math.abs(nd[i] - nd[19 - i]));

  // Truncate/pad to 128
  const emb = new Array(128);
  for (let i = 0; i < 128; i++) emb[i] = i < features.length ? features[i] || 0 : 0;

  // L2 normalize
  const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0)) || 1;
  return emb.map((v) => v / norm);
}

// ==================== SIMILARITY ====================

export function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ==================== MATCHING ====================

export async function matchFace(embedding, threshold) {
  const workers = await getAllWorkers();
  let best = null, bestSim = -1;

  for (const w of workers) {
    const sim = cosineSimilarity(embedding, w.embedding);
    if (sim > bestSim) {
      bestSim = sim;
      best = w;
    }
  }

  if (bestSim >= threshold && best) {
    return { matched: true, worker: best, confidence: bestSim };
  }
  return { matched: false, worker: null, confidence: bestSim };
}

// ==================== ENROLLMENT ====================

export function computeMeanEmbedding(embeddings) {
  const len = 128;
  const mean = new Array(len).fill(0);

  for (const emb of embeddings) {
    for (let i = 0; i < len; i++) mean[i] += emb[i];
  }
  for (let i = 0; i < len; i++) mean[i] /= embeddings.length;

  // L2 normalize
  const norm = Math.sqrt(mean.reduce((s, v) => s + v * v, 0)) || 1;
  return mean.map((v) => v / norm);
}
