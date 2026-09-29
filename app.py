import os
import sys
import time
import uuid
import tempfile
import base64
import io
import shutil
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from facenet_pytorch import MTCNN, InceptionResnetV1
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
from pytorch_grad_cam.utils.image import show_cam_on_image

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# ============================================================
# 0. Setup Paths & Support for Optional Temporal Model
# ============================================================
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
AI_MODEL_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'Ai model'))
if os.path.isdir(AI_MODEL_DIR) and AI_MODEL_DIR not in sys.path:
    sys.path.append(AI_MODEL_DIR)

temporal_model = None
temporal_seq_len = 16
TemporalDeepfakeModel = None
load_temporal_model = None

try:
    from temporal_model import TemporalDeepfakeModel, load_temporal_model  # type: ignore
except Exception as e:
    print(f"Notice: temporal_model not imported: {e}")

# Audio Deepfake Model
audio_detector_available = False
get_audio_detector = None
try:
    from audio_model import get_audio_detector
    audio_detector_available = True
    print("[*] Audio deepfake detector module loaded.")
except Exception as e:
    print(f"Notice: audio_model not imported: {e}")

# Directory to hold processed output videos
RUNS_DIR = os.path.join(BASE_DIR, 'runs')
os.makedirs(RUNS_DIR, exist_ok=True)

# ============================================================
# 1. Initialize Device (GPU if available, else CPU)
# ============================================================
device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
print(f"[*] Deepfake Detection Engine running on device: {device}")

# ============================================================
# 2. Initialize MTCNN for Face Detection
# ============================================================
# keep_all=False: extract single most prominent face tensor
mtcnn = MTCNN(
    select_largest=False,
    post_process=False,
    device=device,
    keep_all=False,
)

# MTCNN for video: bounding box detection
mtcnn_detect = MTCNN(
    select_largest=False,
    post_process=False,
    device=device,
    keep_all=True,
)

MAX_INPUT_DIMENSION = 1280

def cap_image_size(img_pil: Image.Image, max_dim: int = MAX_INPUT_DIMENSION):
    """Resize image if its longest side exceeds max_dim to speed up MTCNN."""
    w, h = img_pil.size
    longest = max(w, h)
    if longest <= max_dim:
        return img_pil, 1.0
    scale = max_dim / longest
    new_w, new_h = int(w * scale), int(h * scale)
    return img_pil.resize((new_w, new_h), Image.Resampling.LANCZOS), scale

# ============================================================
# 3. Initialize InceptionResnetV1 Model
# ============================================================
CHECKPOINT_CANDIDATES = [
    os.path.join(BASE_DIR, 'checkpoints', 'best_model.pth'),
    os.path.join(AI_MODEL_DIR, 'checkpoints', 'best_model.pth'),
]
CHECKPOINT_PATH = next((p for p in CHECKPOINT_CANDIDATES if os.path.isfile(p)), None)

resnet = InceptionResnetV1(
    pretrained='vggface2',
    classify=True,
    num_classes=1,
    device=device
)

checkpoint_info = {
    "loaded": False,
    "path": None,
    "epoch": None,
    "val_metrics": {}
}

if CHECKPOINT_PATH and os.path.isfile(CHECKPOINT_PATH):
    print(f"[*] Loading fine-tuned checkpoint: {CHECKPOINT_PATH}")
    checkpoint = torch.load(CHECKPOINT_PATH, map_location=device, weights_only=True)
    resnet.load_state_dict(checkpoint['model_state_dict'])
    val_metrics = checkpoint.get('val_metrics', {})
    checkpoint_info = {
        "loaded": True,
        "path": CHECKPOINT_PATH,
        "epoch": checkpoint.get('epoch', '?'),
        "val_metrics": {
            "auc": round(float(val_metrics.get('auc', 0)), 4) if 'auc' in val_metrics else None,
            "accuracy": round(float(val_metrics.get('accuracy', 0)), 4) if 'accuracy' in val_metrics else None,
        }
    }
    print(f"  Checkpoint epoch: {checkpoint_info['epoch']} | AUC: {checkpoint_info['val_metrics'].get('auc')}")
else:
    print("[!] No fine-tuned checkpoint found. Operating with base VGGFace2 pretrained weights.")

resnet.eval()

# ============================================================
# 3b. Initialize Temporal Model (if checkpoints exist)
# ============================================================
TEMPORAL_CANDIDATES = [
    os.path.join(BASE_DIR, 'checkpoints', 'best_temporal_model.pth'),
    os.path.join(BASE_DIR, 'checkpoints', 'best_temporal_clips_model.pth'),
    os.path.join(AI_MODEL_DIR, 'checkpoints', 'best_temporal_model.pth'),
    os.path.join(AI_MODEL_DIR, 'checkpoints', 'best_temporal_clips_model.pth'),
]
_temporal_ckpt_path = next((p for p in TEMPORAL_CANDIDATES if os.path.isfile(p)), None)

if _temporal_ckpt_path and load_temporal_model is not None:
    try:
        print(f"[*] Loading temporal model from: {_temporal_ckpt_path}")
        _ckpt = torch.load(_temporal_ckpt_path, map_location=device, weights_only=True)
        _temporal_head = _ckpt.get('temporal_head', 'transformer')
        temporal_seq_len = _ckpt.get('seq_len', 16)
        temporal_model = load_temporal_model(
            checkpoint_path=_temporal_ckpt_path,
            temporal_head=_temporal_head,
            device=device,
            seq_len=temporal_seq_len
        )
        temporal_model.to(device)
        temporal_model.eval()
        print(f"  Temporal model loaded successfully (head={_temporal_head}, seq_len={temporal_seq_len})")
    except Exception as e:
        print(f"[!] Failed to load temporal model: {e}")
        temporal_model = None
else:
    print("[*] Temporal model not active (requires temporal checkpoint).")

# ============================================================
# 4. Grad-CAM Setup for Model Explainability
# ============================================================
target_layers = [resnet.block8.branch1[-1].conv]
grad_cam = GradCAM(model=resnet, target_layers=target_layers)

# ============================================================
# Helper Functions: Image Conversion & Prediction
# ============================================================
def pil_to_base64_data_url(pil_img: Image.Image, format: str = "JPEG") -> str:
    """Convert a PIL Image to a base64 Data URL."""
    buffered = io.BytesIO()
    pil_img.save(buffered, format=format, quality=90)
    img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
    mime = "image/jpeg" if format.upper() == "JPEG" else "image/png"
    return f"data:{mime};base64,{img_b64}"

def classify_face(face_tensor, threshold=0.5, with_cam=True, use_tta=False):
    """
    Given MTCNN face tensor ([3, H, W], range [0, 255]),
    returns (label, confidence, grad_cam_rgb_array or None, face_crop_pil).
    """
    # Interpolate to 256x256
    face = F.interpolate(
        face_tensor.unsqueeze(0), size=(256, 256),
        mode='bilinear', align_corners=False
    )
    face_for_viz = face.clone()

    # Crop preview image
    face_np = face_for_viz.squeeze(0).permute(1, 2, 0).cpu().detach().numpy()
    face_np = np.clip(face_np, 0, 255).astype(np.uint8)
    face_crop_pil = Image.fromarray(face_np)

    # Normalize from [0, 255] to [-1, 1] for InceptionResnetV1
    face = (face - 127.5) / 128.0
    face = face.to(device)

    visualization = None

    if with_cam:
        face_grad = face.detach().requires_grad_(True)
        targets = [ClassifierOutputTarget(0)]
        grayscale_cam = grad_cam(input_tensor=face_grad, targets=targets)
        grayscale_cam = grayscale_cam[0, :]

        # Normalize face to [0, 1] for Grad-CAM overlay
        face_img_plot = face_for_viz.squeeze(0).permute(1, 2, 0).cpu().detach().numpy()
        face_img_plot = np.clip(face_img_plot / 255.0, 0, 1).astype(np.float32)
        visualization = show_cam_on_image(face_img_plot, grayscale_cam, use_rgb=True)

    with torch.no_grad():
        prediction = resnet(face)
        pred_value = torch.sigmoid(prediction).item()

        if use_tta:
            face_flipped = torch.flip(face, dims=[-1])
            prediction_flipped = resnet(face_flipped)
            pred_value_flipped = torch.sigmoid(prediction_flipped).item()
            pred_value = (pred_value + pred_value_flipped) / 2.0

    if pred_value < threshold:
        label = "Real"
        confidence = (1 - pred_value) * 100
        is_deepfake = False
    else:
        label = "Fake"
        confidence = pred_value * 100
        is_deepfake = True

    return label, is_deepfake, confidence, visualization, face_crop_pil

# ============================================================
# FastAPI Application Initialization
# ============================================================
app = FastAPI(
    title="Deepfake Detection API",
    description="FastAPI Backend for Deepfake Detection with InceptionResnetV1, MTCNN, and Grad-CAM",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------
# System Status Endpoint
# ------------------------------------------------------------
@app.get("/api/status")
async def get_status():
    return {
        "status": "online",
        "device": device,
        "model": "InceptionResnetV1",
        "checkpoint": checkpoint_info,
        "temporal_model_available": temporal_model is not None,
        "audio_model_available": audio_detector_available,
        "grad_cam_ready": True
    }

# ------------------------------------------------------------
# Image Prediction Endpoint
# ------------------------------------------------------------
@app.post("/api/detect-image")
async def detect_image(
    file: UploadFile = File(...),
    threshold: float = Form(0.5),
    use_tta: bool = Form(True)
):
    valid_exts = ('.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff')
    is_valid_type = (file.content_type and file.content_type.startswith("image/")) or (file.filename and file.filename.lower().endswith(valid_exts))
    if not is_valid_type:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image format.")

    start_time = time.perf_counter()

    try:
        contents = await file.read()
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read image: {e}")

    orig_width, orig_height = pil_img.size
    capped_img, _ = cap_image_size(pil_img)

    # Detect face
    try:
        face = mtcnn(capped_img)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MTCNN detection error: {e}")

    if face is None:
        elapsed = round(time.perf_counter() - start_time, 3)
        return JSONResponse(
            status_code=200,
            content={
                "success": False,
                "face_detected": False,
                "message": "No human face was detected in the uploaded image. Please upload a clear photo containing a face.",
                "processing_time": elapsed,
                "resolution": f"{orig_width}x{orig_height}"
            }
        )

    # Classify & generate Grad-CAM
    label, is_deepfake, confidence, cam_viz, face_crop = classify_face(
        face, threshold=threshold, with_cam=True, use_tta=use_tta
    )

    elapsed = round(time.perf_counter() - start_time, 3)

    # Convert visualizations to base64
    cam_base64 = None
    if cam_viz is not None:
        cam_pil = Image.fromarray(cam_viz)
        cam_base64 = pil_to_base64_data_url(cam_pil)

    face_crop_base64 = pil_to_base64_data_url(face_crop)

    model_label = "InceptionResnetV1 (Fine-tuned)" if checkpoint_info["loaded"] else "InceptionResnetV1 (VGGFace2 Pretrained)"

    return {
        "success": True,
        "face_detected": True,
        "label": label,
        "is_deepfake": is_deepfake,
        "confidence": round(confidence, 2),
        "threshold": threshold,
        "use_tta": use_tta,
        "grad_cam": cam_base64,
        "face_crop": face_crop_base64,
        "processing_time": elapsed,
        "resolution": f"{orig_width}x{orig_height}",
        "model_name": model_label
    }

# ------------------------------------------------------------
# Video Prediction Endpoint
# ------------------------------------------------------------
@app.post("/api/detect-video")
async def detect_video(
    file: UploadFile = File(...),
    frame_skip: int = Form(5),
    threshold: float = Form(0.5),
    use_tta: bool = Form(False),
    use_temporal: bool = Form(False)
):
    valid_vid_exts = ('.mp4', '.avi', '.mov', '.mkv', '.webm')
    is_valid_vid = (file.content_type and file.content_type.startswith("video/")) or (file.filename and file.filename.lower().endswith(valid_vid_exts))
    if not is_valid_vid:
        raise HTTPException(status_code=400, detail="Uploaded file is not a supported video format.")

    start_time = time.perf_counter()

    # Save uploaded video to temp file
    suffix = Path(file.filename).suffix or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_in:
        input_video_path = temp_in.name
        contents = await file.read()
        temp_in.write(contents)

    cap = cv2.VideoCapture(input_video_path)
    if not cap.isOpened():
        if os.path.exists(input_video_path):
            os.remove(input_video_path)
        raise HTTPException(status_code=400, detail="Could not open video file.")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_skip = max(1, int(frame_skip))

    video_id = str(uuid.uuid4())
    output_filename = f"annotated_{video_id}.mp4"
    output_path = os.path.join(RUNS_DIR, output_filename)

    # Choose video codec - try avc1 or mp4v
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    # --- Processing Mode: Temporal or Frame-by-Frame ---
    if use_temporal and temporal_model is not None:
        # Sample sequence of frames
        seq_len = temporal_seq_len
        if total_frames <= seq_len:
            frame_indices = list(range(max(1, total_frames)))
        else:
            start = max(1, int(total_frames * 0.02))
            end = min(total_frames - 1, int(total_frames * 0.98))
            if end <= start:
                start, end = 0, max(0, total_frames - 1)
            frame_indices = np.linspace(start, end, num=seq_len, dtype=int).tolist()

        face_frames = []
        face_boxes_per_frame = {}

        for idx in frame_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if not ret:
                continue
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img_pil = Image.fromarray(frame_rgb)
            img_pil_resized, scale = cap_image_size(img_pil)

            face = mtcnn(img_pil_resized)
            if face is not None:
                face_resized = F.interpolate(
                    face.unsqueeze(0), size=(256, 256),
                    mode='bilinear', align_corners=False
                ).squeeze(0)
                face_normalized = (face_resized - 127.5) / 128.0
                face_frames.append(face_normalized)

                boxes, _ = mtcnn_detect.detect(img_pil_resized)
                if boxes is not None:
                    face_boxes_per_frame[idx] = (boxes, scale)

        if len(face_frames) == 0:
            cap.release()
            out.release()
            if os.path.exists(input_video_path):
                os.remove(input_video_path)
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "face_detected": False,
                    "message": "No faces were detected in the sampled video frames.",
                    "total_frames": total_frames,
                    "processing_time": round(time.perf_counter() - start_time, 2)
                }
            )

        while len(face_frames) < seq_len:
            face_frames.append(face_frames[len(face_frames) % len(face_frames)])
        face_frames = face_frames[:seq_len]

        frames_tensor = torch.stack(face_frames, dim=0).unsqueeze(0).to(device)

        with torch.no_grad():
            logits = temporal_model(frames_tensor).squeeze()
            pred_value = torch.sigmoid(logits).item()

        if pred_value < threshold:
            label = "Real"
            is_deepfake = False
            confidence = (1 - pred_value) * 100
        else:
            label = "Fake"
            is_deepfake = True
            confidence = pred_value * 100

        # Annotate output video
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        color = (0, 0, 255) if is_deepfake else (0, 255, 0)
        text = f"Temporal: {label} ({confidence:.1f}%)"

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            cv2.putText(frame, text, (25, 45), cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 2)

            nearest_analyzed = min(face_boxes_per_frame.keys(), key=lambda x: abs(x - frame_idx), default=None) if face_boxes_per_frame else None
            if nearest_analyzed is not None and abs(nearest_analyzed - frame_idx) < fps:
                boxes, scale = face_boxes_per_frame[nearest_analyzed]
                for box in boxes:
                    x1, y1, x2, y2 = [int(c / scale) for c in box]
                    cv2.rectangle(frame, (max(0, x1), max(0, y1)), (min(width - 1, x2), min(height - 1, y2)), color, 2)

            out.write(frame)
            frame_idx += 1

        cap.release()
        out.release()

        fake_frames = seq_len if is_deepfake else 0
        real_frames = 0 if is_deepfake else seq_len
        fake_pct = 100.0 if is_deepfake else 0.0
        real_pct = 0.0 if is_deepfake else 100.0
        verdict = "LIKELY FAKE" if is_deepfake else "LIKELY REAL"
        model_name = "Temporal InceptionResnetV1 + Transformer"
        analyzed_count = len(face_frames)

    else:
        # Standard Frame-by-Frame Detection
        total_analyzed = 0
        fake_count = 0
        real_count = 0
        confidence_scores = []

        last_label = None
        last_confidence = 0.0
        last_boxes = None
        scale = 1.0

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_skip == 0:
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                img_pil = Image.fromarray(frame_rgb)
                img_pil_resized, scale = cap_image_size(img_pil)

                boxes, _ = mtcnn_detect.detect(img_pil_resized)

                if boxes is not None and len(boxes) > 0:
                    face = mtcnn(img_pil_resized)
                    if face is not None:
                        label, is_df, conf, _, _ = classify_face(
                            face, threshold=threshold, with_cam=False, use_tta=use_tta
                        )
                        last_label = label
                        last_confidence = conf
                        last_boxes = boxes
                        total_analyzed += 1
                        confidence_scores.append(conf)

                        if is_df:
                            fake_count += 1
                        else:
                            real_count += 1
                    else:
                        last_boxes = None
                else:
                    last_boxes = None

            # Draw overlay annotations
            if last_boxes is not None and last_label is not None:
                color = (0, 0, 255) if last_label == "Fake" else (0, 255, 0)
                for box in last_boxes:
                    x1, y1, x2, y2 = [int(c / scale) for c in box]
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(width - 1, x2), min(height - 1, y2)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    txt = f"{last_label} {last_confidence:.1f}%"
                    cv2.putText(frame, txt, (x1, max(y1 - 10, 25)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.75, color, 2)

            out.write(frame)
            frame_idx += 1

        cap.release()
        out.release()

        if total_analyzed == 0:
            if os.path.exists(input_video_path):
                os.remove(input_video_path)
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "face_detected": False,
                    "message": f"Processed {frame_idx} frames. No faces were detected in any sampled frame.",
                    "total_frames": frame_idx,
                    "processing_time": round(time.perf_counter() - start_time, 2)
                }
            )

        fake_pct = (fake_count / total_analyzed) * 100
        real_pct = (real_count / total_analyzed) * 100
        confidence = float(np.mean(confidence_scores))
        is_deepfake = fake_pct > 50
        verdict = "LIKELY FAKE" if is_deepfake else "LIKELY REAL"
        label = "Fake" if is_deepfake else "Real"
        fake_frames = fake_count
        real_frames = real_count
        analyzed_count = total_analyzed
        model_name = "InceptionResnetV1 (Frame-by-Frame)"

    # Clean up input temporary file
    if os.path.exists(input_video_path):
        os.remove(input_video_path)

    elapsed = round(time.perf_counter() - start_time, 2)

    return {
        "success": True,
        "face_detected": True,
        "verdict": verdict,
        "label": label,
        "is_deepfake": is_deepfake,
        "confidence": round(confidence, 1),
        "total_frames": total_frames,
        "frames_analyzed": analyzed_count,
        "fake_frames": fake_frames,
        "real_frames": real_frames,
        "fake_pct": round(fake_pct, 1),
        "real_pct": round(real_pct, 1),
        "video_url": f"/api/video-results/{output_filename}",
        "processing_time": elapsed,
        "resolution": f"{width}x{height}",
        "fps": round(fps, 1),
        "model_name": model_name
    }

# ------------------------------------------------------------
# Voice / Audio Deepfake Detection Endpoint
# ------------------------------------------------------------
@app.post("/api/detect-audio")
async def detect_audio(
    file: UploadFile = File(...),
    threshold: float = Form(0.5),
    chunk_duration: float = Form(3.5)
):
    if not audio_detector_available or get_audio_detector is None:
        raise HTTPException(status_code=503, detail="Audio detection model is not available on this server.")

    valid_audio_exts = ('.wav', '.mp3', '.m4a', '.flac', '.ogg', '.webm', '.aac', '.wma', '.opus')
    is_valid_type = (file.content_type and (file.content_type.startswith("audio/") or "webm" in file.content_type or "ogg" in file.content_type)) or \
                    (file.filename and file.filename.lower().endswith(valid_audio_exts))
    if not is_valid_type:
        raise HTTPException(status_code=400, detail="Uploaded file is not a supported audio format.")

    start_time = time.perf_counter()

    suffix = Path(file.filename).suffix or ".wav"
    if not suffix or suffix == ".":
        suffix = ".webm" if (file.content_type and "webm" in file.content_type) else ".wav"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_in:
        input_audio_path = temp_in.name
        contents = await file.read()
        temp_in.write(contents)

    try:
        detector = get_audio_detector()
        result = detector.predict(
            input_audio_path,
            chunk_duration=chunk_duration,
            threshold=threshold
        )
    except Exception as e:
        if os.path.exists(input_audio_path):
            os.remove(input_audio_path)
        raise HTTPException(status_code=500, detail=f"Audio analysis error: {str(e)}")

    if os.path.exists(input_audio_path):
        os.remove(input_audio_path)

    elapsed = round(time.perf_counter() - start_time, 2)

    plot_b64 = None
    if result.get("plot_image_path") and os.path.isfile(result["plot_image_path"]):
        try:
            with open(result["plot_image_path"], "rb") as img_f:
                plot_data = img_f.read()
                plot_b64 = f"data:image/png;base64,{base64.b64encode(plot_data).decode('utf-8')}"
            try:
                os.remove(result["plot_image_path"])
            except Exception:
                pass
        except Exception as e:
            print(f"Notice: Failed to encode plot image: {e}")

    is_fake = (result["verdict"].lower() == "fake")
    confidence_val = float(result.get("confidence_percent", 0.0))
    fake_prob_val = round(float(result.get("fake_prob", 0.0)) * 100, 1)
    real_prob_val = round(float(result.get("real_prob", 0.0)) * 100, 1)

    return {
        "success": True,
        "is_deepfake": is_fake,
        "verdict": result["verdict"],
        "label": "Fake" if is_fake else "Real",
        "confidence": confidence_val,
        "fake_prob": fake_prob_val,
        "real_prob": real_prob_val,
        "threshold": threshold,
        "chunk_duration": chunk_duration,
        "summary_text": result.get("summary_text", ""),
        "forensic_metrics": result.get("forensic_metrics", {}),
        "segment_results": result.get("segment_results", []),
        "plot_image": plot_b64,
        "processing_time": elapsed,
        "model_name": "Wav2Vec2 Speech Transformer + Multi-Domain Acoustic Forensics"
    }

# ------------------------------------------------------------
# Video Result Stream / Download Endpoint
# ------------------------------------------------------------
@app.get("/api/video-results/{filename}")
async def get_video_result(filename: str):
    video_file = os.path.join(RUNS_DIR, filename)
    if not os.path.isfile(video_file):
        raise HTTPException(status_code=404, detail="Processed video not found.")
    return FileResponse(video_file, media_type="video/mp4")

# ============================================================
# Static Files Serving for the Web Frontend
# ============================================================
@app.get("/")
async def serve_index():
    index_path = os.path.join(BASE_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return {"message": "Deepfake Detection API is running. index.html not found."}

# Mount directory to serve style.css, script.js, and static assets
app.mount("/", StaticFiles(directory=BASE_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    print("\n==================================================")
    print("🚀 Deepfake Detection Web Application Starting")
    print(f"👉 Local URL: http://127.0.0.1:8000")
    print("👉 API Docs:  http://127.0.0.1:8000/docs")
    print("==================================================\n")
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
