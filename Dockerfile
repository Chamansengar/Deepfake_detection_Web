# Production Dockerfile for Deepfake Detection AI Platform (Optimized for Hugging Face Spaces & Cloud Containers)
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=7860 \
    HOME=/home/user

# Install system dependencies for OpenCV, Librosa/Soundfile, and Audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    libsndfile1 \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set up user named "user" with UID 1000 (standard for Hugging Face Spaces)
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /home/user/app

# Upgrade pip
RUN pip install --no-cache-dir --user --upgrade pip

# Copy requirements and install CPU PyTorch dependencies
COPY --chown=user:user requirements.txt .
COPY --chown=user:user backend/requirements.txt ./backend/
RUN pip install --no-cache-dir --user -r backend/requirements.txt

# Copy source code
COPY --chown=user:user . .

# Ensure runs and checkpoints directories exist with write access
RUN mkdir -p backend/runs backend/checkpoints

EXPOSE 7860

# Launch FastAPI app with Uvicorn on 0.0.0.0
CMD ["sh", "-c", "uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-7860} --workers 1"]
