// ================================================================
// DataLake 3.0 — state.js
// Single source of truth. No DOM access. No DB access.
// ================================================================

const LIVENESS_WEIGHTS = { ear: 0.22, flow: 0.18, left: 0.13, right: 0.13, texture: 0.18, depth: 0.16 };

export const ANGLE_INSTRUCTIONS = [
  'FACE FORWARD',
  'SLIGHT LEFT TURN',
  'SLIGHT RIGHT TURN',
  'LOOK UP SLIGHTLY',
  'NEUTRAL AGAIN',
];

export const LIVENESS_CHALLENGES = [
  { id: 'ear',     label: 'EAR',   instruction: 'BLINK NATURALLY',  frames: 45 },
  { id: 'flow',    label: 'FLOW',  instruction: 'HOLD STILL',       frames: 25 },
  { id: 'left',    label: 'LEFT',  instruction: 'TURN HEAD LEFT',   frames: 35 },
  { id: 'right',   label: 'RIGHT', instruction: 'TURN HEAD RIGHT',  frames: 35 },
  { id: 'texture', label: 'TEX',   instruction: 'HOLD STILL',       frames: 15 },
  { id: 'depth',   label: 'DEPTH', instruction: 'FACE FORWARD',     frames: 15 },
];

export const EYE_LEFT  = [33, 160, 158, 133, 153, 144];
export const EYE_RIGHT = [362, 385, 387, 263, 373, 380];

export const EMBED_LANDMARKS = {
  noseTip: 1, chin: 152, leftEyeInner: 133, rightEyeInner: 362,
  leftEyeOuter: 33, rightEyeOuter: 263, noseBridge: 6, leftCheek: 234,
  rightCheek: 454, upperLip: 13, lowerLip: 14, leftMouth: 61,
  rightMouth: 291, forehead: 10, leftEyebrowInner: 107,
  rightEyebrowInner: 336, leftEyebrowOuter: 70, rightEyebrowOuter: 300,
  noseLeft: 48, noseRight: 278,
};

export const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * 104; // ≈ 653.45

// ==================== APP STATE ====================
export const AppState = {
  screen: 'scan',
  scanState: 'idle',       // 'idle' | 'detecting' | 'liveness' | 'recognizing' | 'result'
  faceDetected: false,
  landmarks: null,
  currentChallenge: null,
  livenessSignals: { ear: null, flow: null, left: null, right: null, texture: null, depth: null },
  fusedScore: 0,
  displayedScore: 0,
  result: null,

  enrollCaptures: [],

  settings: {
    livenessThreshold: 0.72,
    matchThreshold: 0.82,
  },

  cameraActive: false,
  cameraStream: null,
  mpLoaded: false,
  livenessRunning: false,
  noFaceTimer: null,

  // Liveness frame collection
  livenessFrameBuffer: [],
  livenessFrameTarget: 0,
  livenessResolve: null,
  livenessCollecting: false,

  // Face-lost debounce
  consecutiveLost: 0,
  faceFirstSeen: 0,
};

// ==================== MUTATION HELPERS ====================
export function setScanPhase(phase) {
  AppState.scanState = phase;
}

export function setFaceDetected(detected) {
  AppState.faceDetected = detected;
  if (detected) {
    AppState.consecutiveLost = 0;
    if (!AppState.faceFirstSeen) {
      AppState.faceFirstSeen = performance.now();
    }
  }
}

export function incrementConsecutiveLost() {
  AppState.consecutiveLost++;
}

export function setSignalScore(key, score) {
  AppState.livenessSignals[key] = score;
}

export function resetScanState() {
  AppState.scanState = 'idle';
  AppState.livenessRunning = false;
  AppState.currentChallenge = null;
  AppState.fusedScore = 0;
  AppState.livenessCollecting = false;
  AppState.livenessResolve = null;
  AppState.livenessFrameBuffer = [];
  AppState.faceFirstSeen = 0;
  for (const k of Object.keys(AppState.livenessSignals)) {
    AppState.livenessSignals[k] = null;
  }
}

export function resetEnrollState() {
  AppState.enrollCaptures = [];
}

// ==================== FUSED SCORE ====================
export function computeFusedScore() {
  let score = 0, totalWeight = 0;
  for (const [key, weight] of Object.entries(LIVENESS_WEIGHTS)) {
    if (AppState.livenessSignals[key] !== null) {
      score += weight * AppState.livenessSignals[key];
      totalWeight += weight;
    }
  }
  return totalWeight > 0 ? score / totalWeight : 0;
}
