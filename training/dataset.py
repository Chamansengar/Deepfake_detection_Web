"""
dataset.py — PyTorch Dataset & Data Loading Pipeline for Deepfake Detection Fine-Tuning.

Supports:
1. Standard image directory structures:
   Option A (Pre-split):
     data_dir/
       train/
         real/  (authentic face images)
         fake/  (synthetic/manipulated face images)
       val/
         real/
         fake/

   Option B (Single directory with automatic train/val split):
     data_dir/
       real/  (images)
       fake/  (images)

2. Domain-specific Deepfake Data Augmentations:
   - JPEG Compression artifact simulation
   - Random Downscale/Upscale (re-encoding simulation)
   - Gaussian blur (blending boundary simulation)
   - Color jitter & subtle rotation
   - Cutout / Random Erasing
   - Normalization to [-1, 1] matching InceptionResnetV1

3. Automated MTCNN face detection/cropping (optional if images are uncropped).
4. Balanced class sampling (WeightedRandomSampler) to address real vs. fake imbalance.
5. Synthetic dummy dataset generator for rapid pipeline verification.
"""

import os
import io
import random
from pathlib import Path
from typing import Tuple, List, Optional

import torch
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from torchvision import transforms
from PIL import Image, ImageFilter, ImageDraw
import numpy as np


# ============================================================
# 1. Custom Deepfake Forensics Augmentation Transforms
# ============================================================

class JPEGCompression:
    """Simulate lossy JPEG compression artifacts common in re-shared deepfakes."""

    def __init__(self, quality_range: Tuple[int, int] = (30, 95)):
        self.quality_range = quality_range

    def __call__(self, img: Image.Image) -> Image.Image:
        quality = random.randint(*self.quality_range)
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=quality)
        buffer.seek(0)
        return Image.open(buffer).convert('RGB')


class RandomDownscaleUpscale:
    """Simulate resolution scaling and bilinear interpolation artifacts."""

    def __init__(self, scale_range: Tuple[float, float] = (0.4, 0.9)):
        self.scale_range = scale_range

    def __call__(self, img: Image.Image) -> Image.Image:
        w, h = img.size
        scale = random.uniform(*self.scale_range)
        small_size = (max(int(w * scale), 16), max(int(h * scale), 16))
        img = img.resize(small_size, Image.Resampling.BILINEAR)
        img = img.resize((w, h), Image.Resampling.BILINEAR)
        return img


class RandomGaussianBlur:
    """Simulate soft focus and post-processing boundary blending."""

    def __init__(self, radius_range: Tuple[float, float] = (0.5, 2.0), p: float = 0.3):
        self.radius_range = radius_range
        self.p = p

    def __call__(self, img: Image.Image) -> Image.Image:
        if random.random() < self.p:
            radius = random.uniform(*self.radius_range)
            img = img.filter(ImageFilter.GaussianBlur(radius=radius))
        return img


# ============================================================
# 2. Augmentation Pipelines
# ============================================================

def get_train_transforms(image_size: int = 256) -> transforms.Compose:
    """Aggressive training augmentations designed to improve generalization."""
    return transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomRotation(degrees=10),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.05),
        RandomGaussianBlur(p=0.3),
        JPEGCompression(quality_range=(30, 95)),
        RandomDownscaleUpscale(scale_range=(0.5, 0.9)),
        transforms.ToTensor(),
        transforms.RandomErasing(p=0.2, scale=(0.02, 0.1)),
    ])


def get_val_transforms(image_size: int = 256) -> transforms.Compose:
    """Deterministic validation transforms (no stochastic augmentations)."""
    return transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
    ])


# ============================================================
# 3. DeepfakeDataset
# ============================================================

class DeepfakeDataset(Dataset):
    """
    PyTorch Dataset for deepfake detection fine-tuning.
    Labels: 0 = Real / Authentic, 1 = Fake / Synthetic.
    """

    SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}

    def __init__(
        self,
        samples: Optional[List[Tuple[str, int]]] = None,
        root_dir: Optional[str] = None,
        transform: Optional[transforms.Compose] = None,
        use_mtcnn: bool = False,
        max_samples: Optional[int] = None,
        device: str = 'cpu'
    ):
        self.transform = transform
        self.use_mtcnn = use_mtcnn
        self.mtcnn = None

        if use_mtcnn:
            try:
                from facenet_pytorch import MTCNN
                self.mtcnn = MTCNN(
                    image_size=256,
                    margin=40,
                    select_largest=True,
                    post_process=False,
                    device=device
                )
            except Exception as e:
                print(f"[DeepfakeDataset] Warning: Could not initialize MTCNN: {e}")

        if samples is not None:
            self.samples = list(samples)
        elif root_dir is not None:
            self.samples = self._discover_samples(Path(root_dir))
        else:
            raise ValueError("Either 'samples' or 'root_dir' must be provided.")

        random.shuffle(self.samples)

        if max_samples is not None and max_samples > 0:
            self.samples = self.samples[:max_samples]

    def _discover_samples(self, root: Path) -> List[Tuple[str, int]]:
        samples = []
        real_dir = root / 'real'
        fake_dir = root / 'fake'

        if not real_dir.exists() or not fake_dir.exists():
            raise FileNotFoundError(
                f"Directory '{root}' must contain 'real/' and 'fake/' subdirectories."
            )

        for p in sorted(real_dir.iterdir()):
            if p.suffix.lower() in self.SUPPORTED_EXTENSIONS:
                samples.append((str(p), 0))

        for p in sorted(fake_dir.iterdir()):
            if p.suffix.lower() in self.SUPPORTED_EXTENSIONS:
                samples.append((str(p), 1))

        return samples

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        img_path, label = self.samples[idx]

        try:
            img = Image.open(img_path).convert('RGB')
        except Exception as e:
            print(f"[DeepfakeDataset] Error opening '{img_path}': {e}. Using blank frame.")
            img = Image.new('RGB', (256, 256), (0, 0, 0))

        # Optional MTCNN face extraction
        if self.mtcnn is not None:
            try:
                face = self.mtcnn(img)
                if face is not None:
                    face_np = face.permute(1, 2, 0).cpu().numpy().astype(np.uint8)
                    img = Image.fromarray(face_np)
            except Exception:
                pass

        if self.transform is not None:
            img_tensor = self.transform(img)
        else:
            img_tensor = transforms.ToTensor()(img)

        # Normalize [0, 1] -> [-1, 1] matching InceptionResnetV1 expectations
        img_tensor = (img_tensor - 0.5) / 0.5
        label_tensor = torch.tensor(label, dtype=torch.float32)

        return img_tensor, label_tensor


# ============================================================
# 4. DataLoader Factory with Auto-Split & Class Balancing
# ============================================================

def create_dataloaders(
    train_dir: Optional[str] = None,
    val_dir: Optional[str] = None,
    data_dir: Optional[str] = None,
    val_split: float = 0.2,
    batch_size: int = 32,
    num_workers: int = 2,
    image_size: int = 256,
    use_mtcnn: bool = False,
    balance_classes: bool = True
) -> Tuple[DataLoader, DataLoader]:
    """
    Constructs high-performance train and validation DataLoaders.

    Args:
        train_dir: Explicit path to train folder with real/ and fake/
        val_dir: Explicit path to validation folder with real/ and fake/
        data_dir: Single folder with real/ and fake/ (auto-splits by val_split)
        val_split: Fraction of data reserved for validation (if data_dir is used)
        batch_size: Training batch size
        num_workers: Number of background data loader workers
        image_size: Square dimension for model input (default 256)
        use_mtcnn: Run MTCNN face detector during loading
        balance_classes: Use WeightedRandomSampler to prevent imbalance bias
    """
    train_transforms = get_train_transforms(image_size)
    val_transforms = get_val_transforms(image_size)

    if data_dir:
        # Auto-split single directory into stratified train & val sets
        full_dataset = DeepfakeDataset(root_dir=data_dir)
        real_samples = [s for s in full_dataset.samples if s[1] == 0]
        fake_samples = [s for s in full_dataset.samples if s[1] == 1]

        random.shuffle(real_samples)
        random.shuffle(fake_samples)

        real_val_count = max(1, int(len(real_samples) * val_split))
        fake_val_count = max(1, int(len(fake_samples) * val_split))

        val_samples = real_samples[:real_val_count] + fake_samples[:fake_val_count]
        train_samples = real_samples[real_val_count:] + fake_samples[fake_val_count:]

        train_dataset = DeepfakeDataset(samples=train_samples, transform=train_transforms, use_mtcnn=use_mtcnn)
        val_dataset = DeepfakeDataset(samples=val_samples, transform=val_transforms, use_mtcnn=use_mtcnn)

    elif train_dir and val_dir:
        train_dataset = DeepfakeDataset(root_dir=train_dir, transform=train_transforms, use_mtcnn=use_mtcnn)
        val_dataset = DeepfakeDataset(root_dir=val_dir, transform=val_transforms, use_mtcnn=use_mtcnn)
    else:
        raise ValueError("Must provide either 'data_dir' OR both 'train_dir' and 'val_dir'.")

    # Class balancing sampler for training set
    sampler = None
    shuffle = True
    if balance_classes and len(train_dataset) > 0:
        labels = [lbl for _, lbl in train_dataset.samples]
        count_0 = max(labels.count(0), 1)
        count_1 = max(labels.count(1), 1)
        weights = [1.0 / count_0 if lbl == 0 else 1.0 / count_1 for lbl in labels]
        sampler = WeightedRandomSampler(weights, num_samples=len(weights), replacement=True)
        shuffle = False

    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=shuffle,
        sampler=sampler,
        num_workers=num_workers,
        pin_memory=torch.cuda.is_available(),
        drop_last=(len(train_dataset) > batch_size)
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=torch.cuda.is_available(),
        drop_last=False
    )

    print(f"[DataLoaders] Training set: {len(train_dataset)} samples | Validation set: {len(val_dataset)} samples")
    return train_loader, val_loader


# ============================================================
# 5. Synthetic Dummy Dataset Generator (Quick Verification)
# ============================================================

def generate_dummy_dataset(output_dir: str = "./data/sample_dataset", num_per_class: int = 10) -> str:
    """
    Creates a lightweight synthetic dataset with real/ and fake/ sample images
    so the entire fine-tuning pipeline can be verified immediately.
    """
    out_path = Path(output_dir)
    real_path = out_path / "real"
    fake_path = out_path / "fake"

    real_path.mkdir(parents=True, exist_ok=True)
    fake_path.mkdir(parents=True, exist_ok=True)

    for i in range(num_per_class):
        # Real sample: Soft gradient with a simulated facial oval
        img_real = Image.new("RGB", (256, 256), color=(220, 200, 180))
        draw_real = ImageDraw.Draw(img_real)
        draw_real.ellipse([60, 50, 196, 210], fill=(235, 210, 190), outline=(180, 140, 120))
        draw_real.ellipse([90, 95, 115, 115], fill=(50, 40, 30))   # left eye
        draw_real.ellipse([141, 95, 166, 115], fill=(50, 40, 30))  # right eye
        draw_real.line([128, 115, 128, 145], fill=(160, 120, 100), width=3) # nose
        draw_real.arc([105, 155, 151, 180], 0, 180, fill=(180, 60, 60), width=4) # mouth
        img_real.save(real_path / f"real_{i:03d}.jpg", quality=90)

        # Fake sample: Simulated image with high-frequency boundary artifacts
        img_fake = Image.new("RGB", (256, 256), color=(200, 220, 230))
        draw_fake = ImageDraw.Draw(img_fake)
        draw_fake.ellipse([60, 50, 196, 210], fill=(240, 190, 180), outline=(255, 50, 50), width=3)
        draw_fake.ellipse([90, 95, 115, 115], fill=(20, 20, 60))
        draw_fake.ellipse([141, 95, 166, 115], fill=(20, 20, 60))
        draw_fake.rectangle([110, 150, 146, 175], fill=(220, 50, 80)) # distorted mouth
        img_fake.save(fake_path / f"fake_{i:03d}.jpg", quality=75)

    print(f"[Dataset] Generated {num_per_class * 2} synthetic samples in '{output_dir}'.")
    return str(out_path)
