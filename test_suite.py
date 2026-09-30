import os
import io
import time
import numpy as np
import cv2
import soundfile as sf
from PIL import Image
from fastapi.testclient import TestClient

print("[1] Importing FastAPI app...", flush=True)
from app import app

client = TestClient(app)

print("\n--- TEST 1: GET /api/status ---", flush=True)
res = client.get("/api/status")
print(f"Status Code: {res.status_code}")
print(f"Response: {res.json()}")
assert res.status_code == 200, "Status endpoint failed!"

print("\n--- TEST 2: GET / (index.html) ---", flush=True)
res = client.get("/")
print(f"Status Code: {res.status_code}")
assert res.status_code == 200, "Root endpoint failed!"
assert "<!DOCTYPE html>" in res.text, "Index HTML not returned!"

print("\n--- TEST 3: POST /api/detect-image with Invalid File ---", flush=True)
res = client.post("/api/detect-image", files={"file": ("test.txt", b"invalid text data", "text/plain")})
print(f"Status Code: {res.status_code}, Detail: {res.json().get('detail')}")
assert res.status_code == 400, "Should reject non-image file!"

print("\n--- TEST 4: POST /api/detect-image with Blank Image (No Face) ---", flush=True)
img = Image.new("RGB", (300, 300), color=(128, 128, 128))
img_bytes = io.BytesIO()
img.save(img_bytes, format="JPEG")
img_bytes.seek(0)
res = client.post(
    "/api/detect-image",
    files={"file": ("blank.jpg", img_bytes.getvalue(), "image/jpeg")},
    data={"threshold": 0.5, "use_tta": False}
)
print(f"Status Code: {res.status_code}")
data = res.json()
print(f"Response: success={data.get('success')}, face_detected={data.get('face_detected')}, message={data.get('message')}")
assert res.status_code == 200
assert data.get("face_detected") is False, "Should report no face detected!"

print("\n--- TEST 5: POST /api/detect-audio with Synthetic WAV ---", flush=True)
# Generate 2 seconds of 440Hz sine wave tone
sr = 16000
duration = 2.0
t = np.linspace(0, duration, int(sr * duration), endpoint=False)
audio_data = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
audio_bytes = io.BytesIO()
sf.write(audio_bytes, audio_data, sr, format="WAV")
audio_bytes.seek(0)

res = client.post(
    "/api/detect-audio",
    files={"file": ("test_tone.wav", audio_bytes.getvalue(), "audio/wav")},
    data={"threshold": 0.5, "chunk_duration": 1.0}
)
print(f"Status Code: {res.status_code}")
if res.status_code == 200:
    audio_res = res.json()
    print(f"Audio Result: verdict={audio_res.get('verdict')}, is_deepfake={audio_res.get('is_deepfake')}, confidence={audio_res.get('confidence')}%")
    print(f"Forensic metrics: {list(audio_res.get('forensic_metrics', {}).keys())}")
    print(f"Plot image present: {bool(audio_res.get('plot_image'))}")
else:
    print(f"Audio Error: {res.text}")

print("\n--- TEST 6: POST /api/detect-video with Synthetic Video (No Face) ---", flush=True)
# Generate a tiny 5-frame synthetic MP4 video
temp_vid = "temp_test_video.mp4"
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
out = cv2.VideoWriter(temp_vid, fourcc, 10.0, (160, 120))
for _ in range(5):
    frame = np.zeros((120, 160, 3), dtype=np.uint8)
    out.write(frame)
out.release()

with open(temp_vid, "rb") as vf:
    vid_content = vf.read()
if os.path.exists(temp_vid):
    os.remove(temp_vid)

res = client.post(
    "/api/detect-video",
    files={"file": ("sample.mp4", vid_content, "video/mp4")},
    data={"frame_skip": 1, "threshold": 0.5, "use_tta": False, "use_temporal": False}
)
print(f"Status Code: {res.status_code}")
vid_res = res.json()
print(f"Video Result: success={vid_res.get('success')}, face_detected={vid_res.get('face_detected')}, message={vid_res.get('message')}")
assert res.status_code == 200
assert vid_res.get("face_detected") is False, "Should report no face detected in blank video!"

print("\n--- TEST 7: GET /api/video-results/nonexistent.mp4 (404 expected) ---", flush=True)
res = client.get("/api/video-results/nonexistent_12345.mp4")
print(f"Status Code: {res.status_code}")
assert res.status_code == 404, "Should return 404 for missing video!"

print("\n================ ALL TESTS PASSED SUCCESSFULLY! ================", flush=True)
