# Production Dockerfile for Deepfake Detection AI Platform (Optimized for Hugging Face Spaces & Docker)
FROM python:3.10-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
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

# Set up a new user named "user" with UID 1000 (Required by Hugging Face Spaces)
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /home/user/app

# Upgrade pip
RUN pip install --no-cache-dir --user --upgrade pip

# Copy requirements and install dependencies
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Copy application source code with correct ownership
COPY --chown=user:user . .

# Ensure runs and checkpoints directories exist with write access
RUN mkdir -p runs checkpoints

# Hugging Face Spaces listens on port 7860
EXPOSE 7860

# Launch FastAPI app with Uvicorn on 0.0.0.0 and port 7860
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-7860} --workers 1"]
