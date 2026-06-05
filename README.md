# DataLake 3.0 - Offline Biometric Attendance System for Remote Field Operations

"An edge-first multimodal biometric authentication system that performs secure offline identity verification using a 5-signal liveness detection pipeline on standard Android hardware - no cloud inference, no special sensors."

![React Native](https://img.shields.io/badge/React_Native-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TensorFlow Lite](https://img.shields.io/badge/TensorFlow_Lite-FF6F00?style=flat-square&logo=tensorflow&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Android_8+-3DDC84?style=flat-square&logo=android&logoColor=white)
![Sensor](https://img.shields.io/badge/Sensor-RGB_Camera_Only-blue?style=flat-square)
![Backend](https://img.shields.io/badge/Backend-AWS_Sync-232F3E?style=flat-square&logo=amazon-aws&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

> Field workforce verification in GPS-denied and internet-denied remote environments renders cloud-dependent biometric systems inoperative. Enterprise anti-spoofing systems require dedicated depth sensors that are unavailable on low-cost field devices. This project implements a 5-signal software sensor fusion pipeline combining `EAR` blink detection, optical flow, facial parallax, `LBP` texture analysis, and weighted score fusion running entirely via `TFLite` on-device. The system targets low-cost `Android 8+` devices with delayed `AWS` synchronization when connectivity is restored.

## Problem Statement

**Connectivity-Denied Field Operations**
Remote construction sites, underground infrastructure, border installations, and disaster response zones present environments where cloud services are unavailable. Standard cloud-dependent face recognition systems fail completely in these environments because they cannot reach remote inference servers or databases. An edge-first architecture is necessary to ensure attendance and identity verification can proceed uninterrupted regardless of network conditions.

**Anti-Spoofing Without Depth Hardware**
The primary spoofing threat model includes printed photo attacks, video replay attacks, and screen-based presentation attacks. Single-signal liveness detection methods, such as blink-only checks, are defeatable by pre-recorded adversarial video, which makes multi-signal fusion necessary for secure verification. Hardware depth sensors such as infrared dot projectors or structured light sensors add cost and fragility that are incompatible with field deployment constraints. 

## System Architecture

```text
Worker Initiates Authentication
        |
        v
Adaptive Challenge Engine  -->  randomly selects 2 of 5 liveness challenges
        |
        v
Camera Frame Acquisition
        |
        |-- CLAHE Preprocessing  (adaptive illumination normalization)
        |
        v
MediaPipe BlazeFace  -->  face detection + bounding box
        |
        v
MobileFaceNet (TFLite INT8)  -->  128D face embedding
        |
        v
5-Signal Liveness Pipeline (parallel)
   |-- Signal 1: EAR Blink Detection      (MediaPipe Face Mesh, 6 landmarks/eye)
   |-- Signal 2: Optical Flow Analysis    (frame-to-frame motion vector field)
   |-- Signal 3: Facial Parallax          (468-point planarity deviation)
   |-- Signal 4: LBP Texture Analysis     (skin vs. print vs. screen histogram)
   |-- Signal 5: Weighted Score Fusion    (threshold: 0.75)
        |
        v
Identity Match  -->  cosine similarity vs. stored embeddings
        |
        v
Offline Attendance Log  -->  encrypted SQLite (~2KB/worker)
        |
        v
[On connectivity restored]
        |
        v
AWS Sync  -->  upload logs, purge local temp records, update central dashboard
```

Software sensor fusion replaces hardware depth sensing because physical objects and human faces interact with light and motion differently. A flat object such as a photo or screen behaves measurably differently from a 3D face across motion, geometry, and texture dimensions. These differences are detectable with a standard RGB camera without any specialized hardware.

## Liveness Detection - Technical Detail

| Signal | Method | What it Detects | What it Rejects |
|--------|--------|-----------------|-----------------|
| `EAR` Blink | `MediaPipe Face Mesh` (6 landmarks per eye) calculates vertical height divided by horizontal width. | A sharp `EAR` drop below `0.20` during a blink followed by recovery. | Printed photos where eye landmarks remain frozen across all frames. |
| Optical Flow | Frame-to-frame motion vector field analysis across consecutive camera frames. | Non-uniform flow caused by facial depth displacing the nose more than ears. | Flat photos moving physically that produce a uniform vector field. |
| Facial Parallax | 468-point planarity deviation measurement using `MediaPipe Face Mesh`. | High deviation from planarity indicating nose protrusion and eye socket recession. | Flat photos or screens where all landmarks remain coplanar. |
| `LBP` Texture | Local Binary Pattern converts a skin-region patch into a texture histogram. | Smooth organic histograms originating from micro-pores and surface variation. | Periodic spikes from halftone dot patterns or grid-like pixel artifacts. |
| Score Fusion | Weighted score fusion with an acceptance `threshold` of `0.75`. | Live subjects passing the fused multi-signal threshold. | Attackers unable to simultaneously defeat all four independent signals. |

## Performance Targets

| Metric | Target |
|--------|--------|
| Inference Time | Under `1` second. |
| Model Size | Approximately `9MB`. |
| RAM Usage | Under `500MB`. |
| Offline Support | Full verification with no internet required at authentication time. |
| Matching Accuracy | Above `95%` in controlled conditions. |
| Device Support | `Android 8` and above. |
| Storage per Worker | Approximately `2KB`. |

## Component Responsibilities

| Component | Technology | Role |
|-----------|------------|------|
| Face Detection | `MediaPipe BlazeFace` | Locates the face and provides a bounding box. |
| Face Embedding | `MobileFaceNet` | Generates a `128D` feature vector for facial matching. |
| Liveness Detection | Custom 5-Signal Pipeline | Prevents presentation attacks via software sensor fusion. |
| AI Runtime | `TensorFlow Lite` | Executes `INT8` quantized models on-device via CPU. |
| Local Storage | `SQLite` | Stores encrypted attendance logs and embeddings locally. |
| Cloud Sync | `AWS SDK` | Uploads logs and updates the central dashboard upon connectivity. |
| Frontend | `React Native` | Provides the cross-platform mobile user interface. |

## Hardware Requirements

**Compute Platform**
The system requires an `Android 8+` device. No GPU, depth sensor, or IR projector is required for operation. All inference runs on the CPU via `TFLite` `INT8` quantized models. The architecture has been tested on mid-range and low-end Android hardware.

**Sensor**
A standard front-facing RGB camera is the only required sensor. No special hardware is required. The liveness pipeline is designed explicitly for RGB-only inputs to maximize deployability on low-cost field devices.

## Software Dependencies

| Package | Version | Role |
|---------|---------|------|
| `React Native` | Latest | User interface and mobile application framework. |
| `TensorFlow Lite` | Latest | On-device execution of quantized machine learning models. |
| `MediaPipe` | Latest | Provides `BlazeFace` and `Face Mesh` landmark extraction. |
| `MobileFaceNet` | Quantized | Generates face embeddings for identity matching. |
| `SQLite` | Encrypted | Secure local storage for embeddings and attendance logs. |
| `AWS SDK` | Latest | Handles delayed synchronization of offline logs. |
| `OpenCV` | Latest | Executes `CLAHE` adaptive illumination preprocessing. |

## Installation

1. Clone the repository to your local machine.
```bash
git clone https://github.com/Avishkar-byte/NHAI-Innovation-Hackathon.git
cd NHAI-Innovation-Hackathon
```

2. Install the necessary JavaScript dependencies for the frontend interface.
```bash
npm install
```

3. Configure your AWS credentials to enable the synchronization pipeline.
```bash
export AWS_ACCESS_KEY_ID="your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key"
export AWS_REGION="your_aws_region"
```

4. Build the Android APK for device deployment.
```bash
cd android
./gradlew assembleRelease
```

## Usage

**Worker Enrollment**
The registration process requires a 5-angle capture flow to record the subject's face. The system computes a mean embedding across all 5 captures and stores it as the worker's reference embedding in the local `SQLite` database. No photographic images or videos are retained post-enrollment.

**Authentication**
Authentication utilizes the adaptive challenge engine to issue a randomized sequence of liveness checks. The system executes the 5-signal liveness check, calculates the cosine similarity match against the stored embedding, and writes an offline attendance log entry upon success.

**Sync**
A deferred upload flow triggers automatically when internet connectivity is restored. The system transmits the stored attendance logs to the AWS backend, executes a log purge from the local temporary store, and updates the centralized administrative dashboard.

## Security Model

### Anti-Spoofing
The 5-signal fusion approach forces an attacker to defeat multiple independent verification methods simultaneously. To achieve a passing score, an attacker must present a physical 3D replica of the face that also mimics skin texture and blinks, making flat printed photos and screen replays ineffective.

### Storage Security
All stored embeddings are protected by encryption at rest. The system strictly avoids any biometric media retention, ensuring that original face images cannot be extracted. The per-worker storage footprint remains extremely minimal at approximately `2KB`.

### Model Integrity
A `SHA-256` hash verification of all `TFLite` model files occurs immediately at application startup. The system validates the integrity of these files before any inference operations are permitted to execute.

## Demo Flow

1. Register a worker to capture 5 angles, generate a mean embedding, and store it securely.
2. Disable internet completely to simulate a remote field environment.
3. Authenticate a live worker through a face scan and complete 2 random liveness challenges. The system verifies the identity and accepts the attempt.
4. Attempt a spoof attack by presenting a printed photo or a phone screen replay. The system rejects the attempt and displays the rejection reason in the logs.
5. Restore the internet connection. Observe the automatic synchronization to AWS and confirm the log purge from the local temporary store.

## Deployment Context

This software operates as a government-grade edge biometric authentication framework designed for severe operational envelopes. Target deployments include remote construction sites, underground infrastructure inspection, border installations, disaster response zones, and field operations where cloud connectivity cannot be guaranteed. The AWS synchronization architecture functions as a deferred-consistency model that is appropriate for intermittent-connectivity environments.

## Roadmap

- [x] Offline face recognition with `MobileFaceNet` `INT8`
- [x] 5-signal multimodal liveness detection pipeline
- [x] Adaptive challenge engine for randomized prompt sequencing
- [x] `CLAHE` adaptive illumination preprocessing
- [x] 5-angle enrollment process generating a mean embedding
- [x] `SHA-256` model integrity check at application startup
- [x] Encrypted `SQLite` local storage implementation
- [x] Deferred `AWS` synchronization with automatic log purge
- [ ] `React Native` mobile application production `APK`
- [ ] On-device liveness threshold auto-calibration per device camera
- [ ] Administrative dashboard on `AWS` for centralized attendance management
- [ ] `MAVLink` or serial integration for access control hardware triggers
- [ ] `rosbag`-equivalent offline evaluation suite with ground-truth comparison
- [ ] `iOS` platform support

## License

This project is licensed under the MIT License.
