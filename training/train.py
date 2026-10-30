"""
train.py — Complete Fine-Tuning Pipeline for InceptionResnetV1 Deepfake Detection.

Features:
- Fine-tunes InceptionResnetV1 (pretrained on VGGFace2) on face images.
- Selective unfreezing (train top blocks + head, or full fine-tuning).
- Supports resuming from existing checkpoints (e.g. checkpoints/best_model.pth).
- Automatic Mixed Precision (AMP) for GPU acceleration.
- Cosine Annealing learning rate schedule.
- Comprehensive metric tracking: Loss, Accuracy, ROC-AUC, PR-AUC, Precision, Recall, F1-Score.
- Confusion matrix logging.
- Early stopping based on validation ROC-AUC.
- Checkpoint format 100% compatible with app.py.
- Built-in --dummy_run mode for instantaneous pipeline verification without external data.

Usage examples:
  1. Quick test run with auto-generated synthetic data:
     python train.py --dummy_run --epochs 2

  2. Fine-tuning on a single data folder (auto 80/20 train/val split):
     python train.py --data_dir ./data/my_faces --epochs 25 --batch_size 32

  3. Fine-tuning with pre-split directories:
     python train.py --train_dir ./data/train --val_dir ./data/val --epochs 20 --lr 1e-4

  4. Resume training from an existing checkpoint:
     python train.py --data_dir ./data/my_faces --resume ./checkpoints/best_model.pth --epochs 15
"""

import os
import sys
import time
import argparse
from pathlib import Path
from typing import Dict, Any, Tuple

# Ensure Windows PowerShell console doesn't fail on Unicode characters
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import torch
import torch.nn as nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from facenet_pytorch import InceptionResnetV1
import numpy as np
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix
)

from dataset import create_dataloaders, generate_dummy_dataset


# ============================================================
# 1. Model Builder with Selective Unfreezing
# ============================================================

def build_model(
    device: str = 'cpu',
    resume_path: str = None,
    unfreeze_all: bool = False,
    unfreeze_blocks: Tuple[str, ...] = ('block8', 'last_linear', 'last_bn', 'logits')
) -> InceptionResnetV1:
    """
    Initializes InceptionResnetV1 and configures trainable layers.

    Args:
        device: Device to place the model on ('cuda' or 'cpu').
        resume_path: Optional path to .pth checkpoint to resume from.
        unfreeze_all: If True, train all parameters end-to-end.
        unfreeze_blocks: Prefixes of submodules to unfreeze when unfreeze_all is False.
    """
    model = InceptionResnetV1(
        pretrained='vggface2',
        classify=True,
        num_classes=1,
        device=device
    )

    if resume_path and os.path.isfile(resume_path):
        print(f"[Model] Resuming fine-tuning from existing checkpoint: {resume_path}")
        checkpoint = torch.load(resume_path, map_location=device, weights_only=True)
        state_dict = checkpoint.get('model_state_dict', checkpoint)
        model.load_state_dict(state_dict)
        print(f"  Checkpoint loaded (Epoch: {checkpoint.get('epoch', '?')}, Best AUC: {checkpoint.get('best_auc', '?')})")
    else:
        print("[Model] Initialized with VGGFace2 pretrained base weights.")

    total_params = sum(p.numel() for p in model.parameters())

    if unfreeze_all:
        for p in model.parameters():
            p.requires_grad = True
        trainable_params = total_params
        print(f"[Model] Full Fine-Tuning: All {total_params:,} parameters trainable.")
    else:
        for p in model.parameters():
            p.requires_grad = False

        trainable_params = 0
        for name, p in model.named_parameters():
            if any(name.startswith(b) for b in unfreeze_blocks):
                p.requires_grad = True
                trainable_params += p.numel()

        pct = (trainable_params / total_params) * 100
        print(f"[Model] Selective Fine-Tuning: {trainable_params:,} / {total_params:,} parameters trainable ({pct:.1f}%).")
        print(f"  Unfrozen modules: {', '.join(unfreeze_blocks)}")

    return model.to(device)


# ============================================================
# 2. Training Loop for Single Epoch
# ============================================================

def train_epoch(
    model: nn.Module,
    loader: torch.utils.data.DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    scaler: torch.cuda.amp.GradScaler,
    device: str,
    epoch: int
) -> float:
    """Trains the model for one epoch with gradient clipping and AMP."""
    model.train()
    running_loss = 0.0
    num_batches = 0
    total_batches = len(loader)

    for batch_idx, (images, labels) in enumerate(loader):
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        optimizer.zero_grad(set_to_none=True)

        use_amp = (device.startswith('cuda') and torch.cuda.is_available())
        autocast_ctx = torch.amp.autocast('cuda', enabled=use_amp) if hasattr(torch.amp, 'autocast') else torch.cuda.amp.autocast(enabled=use_amp)
        with autocast_ctx:
            outputs = model(images).squeeze(-1)
            loss = criterion(outputs, labels)

        if use_amp:
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            scaler.step(optimizer)
            scaler.update()
        else:
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

        running_loss += loss.item()
        num_batches += 1

        if (batch_idx + 1) % max(1, total_batches // 5) == 0 or (batch_idx + 1) == total_batches:
            avg_so_far = running_loss / num_batches
            print(f"  [Epoch {epoch:02d}] Step {batch_idx + 1:03d}/{total_batches:03d} | Batch Loss: {loss.item():.4f} (Avg: {avg_so_far:.4f})")

    return running_loss / max(num_batches, 1)


# ============================================================
# 3. Validation Loop with Comprehensive Metrics
# ============================================================

@torch.no_grad()
def evaluate(
    model: nn.Module,
    loader: torch.utils.data.DataLoader,
    criterion: nn.Module,
    device: str
) -> Dict[str, Any]:
    """Evaluates validation performance and computes forensic metrics."""
    model.eval()
    running_loss = 0.0
    num_batches = 0

    all_labels = []
    all_probs = []

    for images, labels in loader:
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        outputs = model(images).squeeze(-1)
        loss = criterion(outputs, labels)

        running_loss += loss.item()
        num_batches += 1

        probs = torch.sigmoid(outputs).cpu().numpy()
        all_probs.extend(probs)
        all_labels.extend(labels.cpu().numpy())

    all_labels = np.array(all_labels)
    all_probs = np.array(all_probs)
    all_preds = (all_probs >= 0.5).astype(int)

    avg_loss = running_loss / max(num_batches, 1)

    # Calculate ROC-AUC & PR-AUC safely
    try:
        if len(np.unique(all_labels)) > 1:
            auc = float(roc_auc_score(all_labels, all_probs))
            pr_auc = float(average_precision_score(all_labels, all_probs))
        else:
            auc = 0.5
            pr_auc = 0.5
    except Exception:
        auc = 0.5
        pr_auc = 0.5

    acc = float(accuracy_score(all_labels, all_preds))
    prec = float(precision_score(all_labels, all_preds, zero_division=0))
    rec = float(recall_score(all_labels, all_preds, zero_division=0))
    f1 = float(f1_score(all_labels, all_preds, zero_division=0))

    try:
        cm = confusion_matrix(all_labels, all_preds)
    except Exception:
        cm = np.zeros((2, 2), dtype=int)

    return {
        "loss": round(avg_loss, 4),
        "accuracy": round(acc, 4),
        "auc": round(auc, 4),
        "pr_auc": round(pr_auc, 4),
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1": round(f1, 4),
        "confusion_matrix": cm,
        "sample_count": len(all_labels)
    }


# ============================================================
# 4. Main Training Pipeline
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Deepfake Detection Model Fine-Tuning Pipeline")

    # Data arguments
    parser.add_argument("--data_dir", type=str, default=None,
                        help="Path to folder containing real/ and fake/ subdirs (auto-splits train/val)")
    parser.add_argument("--train_dir", type=str, default=None,
                        help="Path to pre-split training directory containing real/ and fake/")
    parser.add_argument("--val_dir", type=str, default=None,
                        help="Path to pre-split validation directory containing real/ and fake/")
    parser.add_argument("--val_split", type=float, default=0.2,
                        help="Validation split ratio if using --data_dir (default: 0.2)")
    parser.add_argument("--dummy_run", action="store_true",
                        help="Generate synthetic dataset and run 2 epochs to verify pipeline operation")
    parser.add_argument("--use_mtcnn", action="store_true",
                        help="Crop faces on-the-fly using MTCNN (use if images are uncropped)")

    # Model & Optimization arguments
    parser.add_argument("--epochs", type=int, default=20,
                        help="Number of training epochs (default: 20)")
    parser.add_argument("--batch_size", type=int, default=32,
                        help="Batch size (default: 32)")
    parser.add_argument("--lr", type=float, default=1e-4,
                        help="Initial learning rate for AdamW (default: 1e-4)")
    parser.add_argument("--weight_decay", type=float, default=1e-4,
                        help="Weight decay for AdamW (default: 1e-4)")
    parser.add_argument("--patience", type=int, default=6,
                        help="Early stopping patience in epochs without AUC improvement (default: 6)")
    parser.add_argument("--unfreeze_all", action="store_true",
                        help="Unfreeze all model parameters for full end-to-end training")
    parser.add_argument("--resume", type=str, default=None,
                        help="Path to existing .pth checkpoint to resume from")

    # Checkpoint & Output
    parser.add_argument("--checkpoint_dir", type=str, default="./checkpoints",
                        help="Directory to save model weights (default: ./checkpoints)")
    parser.add_argument("--num_workers", type=int, default=2,
                        help="Number of background data loader workers (default: 2)")

    args = parser.parse_args()

    print("\n" + "=" * 65)
    print("[*] Deepfake Detection Fine-Tuning Engine (InceptionResnetV1)")
    print("=" * 65)

    # 1. Verification / Dummy Run Handling
    if args.dummy_run:
        print("[Mode] Running Pipeline Verification with Synthetic Dataset...")
        dummy_dir = "./data/sample_dataset"
        generate_dummy_dataset(dummy_dir, num_per_class=12)
        args.data_dir = dummy_dir
        args.batch_size = min(args.batch_size, 8)
        args.num_workers = 0

    if not args.data_dir and not (args.train_dir and args.val_dir):
        print("\n[!] No dataset provided. Creating a sample dataset for instant verification.")
        print("    To train on real data, provide --data_dir <path> or --train_dir and --val_dir.")
        sample_path = "./data/sample_dataset"
        generate_dummy_dataset(sample_path, num_per_class=12)
        args.data_dir = sample_path
        args.batch_size = min(args.batch_size, 8)
        args.num_workers = 0

    # 2. Device Initialization
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    print(f"[*] Compute Device: {device.upper()}")
    if device.startswith("cuda"):
        print(f"  GPU Name: {torch.cuda.get_device_name(0)}")
        print(f"  Memory Available: {torch.cuda.get_device_properties(0).total_memory / (1024**3):.1f} GB")

    # 3. Create DataLoaders
    train_loader, val_loader = create_dataloaders(
        train_dir=args.train_dir,
        val_dir=args.val_dir,
        data_dir=args.data_dir,
        val_split=args.val_split,
        batch_size=args.batch_size,
        num_workers=args.num_workers,
        use_mtcnn=args.use_mtcnn
    )

    # 4. Build Model
    model = build_model(
        device=device,
        resume_path=args.resume,
        unfreeze_all=args.unfreeze_all
    )

    # 5. Loss Function, Optimizer & Scheduler
    criterion = nn.BCEWithLogitsLoss()
    optimizer = AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=args.lr,
        weight_decay=args.weight_decay
    )
    scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=args.lr * 0.01)
    if hasattr(torch.amp, 'GradScaler'):
        scaler = torch.amp.GradScaler('cuda', enabled=device.startswith("cuda"))
    else:
        scaler = torch.cuda.amp.GradScaler(enabled=device.startswith("cuda"))

    # 6. Checkpoint Directory Setup
    ckpt_dir = Path(args.checkpoint_dir)
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    best_ckpt_path = ckpt_dir / "best_model.pth"

    best_auc = 0.0
    patience_count = 0
    start_total_time = time.perf_counter()

    print("\n" + "-" * 65)
    print(f"[*] Beginning Training: {args.epochs} Epochs | Batch Size: {args.batch_size} | LR: {args.lr}")
    print("-" * 65)

    for epoch in range(1, args.epochs + 1):
        t0 = time.perf_counter()

        # Training Phase
        train_loss = train_epoch(model, train_loader, criterion, optimizer, scaler, device, epoch)

        # Validation Phase
        val_res = evaluate(model, val_loader, criterion, device)

        scheduler.step()
        current_lr = scheduler.get_last_lr()[0]
        elapsed = time.perf_counter() - t0

        print(f"\n[Epoch {epoch:02d}/{args.epochs:02d}] Finished in {elapsed:.1f}s (LR: {current_lr:.2e})")
        print(f"   Train Loss: {train_loss:.4f} | Val Loss: {val_res['loss']:.4f}")
        print(f"   Val AUC:    {val_res['auc']:.4f} | PR-AUC: {val_res['pr_auc']:.4f}")
        print(f"   Accuracy:   {val_res['accuracy'] * 100:.1f}% | F1: {val_res['f1']:.4f} | Prec: {val_res['precision']:.4f} | Rec: {val_res['recall']:.4f}")

        # Confusion Matrix
        cm = val_res['confusion_matrix']
        if cm.shape == (2, 2):
            print(f"   Confusion Matrix: [TN={cm[0,0]}, FP={cm[0,1]} | FN={cm[1,0]}, TP={cm[1,1]}]")

        # Save Best Model by Validation AUC
        if val_res['auc'] > best_auc:
            best_auc = val_res['auc']
            patience_count = 0

            checkpoint_payload = {
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "best_auc": best_auc,
                "val_metrics": {
                    "auc": val_res['auc'],
                    "accuracy": val_res['accuracy'],
                    "pr_auc": val_res['pr_auc'],
                    "precision": val_res['precision'],
                    "recall": val_res['recall'],
                    "f1": val_res['f1'],
                    "loss": val_res['loss']
                }
            }
            torch.save(checkpoint_payload, best_ckpt_path)
            print(f"   [+] New best model saved! (AUC: {best_auc:.4f}) -> {best_ckpt_path}")
        else:
            patience_count += 1
            print(f"   No AUC improvement ({patience_count}/{args.patience})")

        if patience_count >= args.patience:
            print(f"\n[Early Stopping] Triggered after {args.patience} epochs without improvement.")
            break

    total_elapsed = round(time.perf_counter() - start_total_time, 1)
    print("\n" + "=" * 65)
    print("[*] Training Session Completed Successfully!")
    print(f"    Total Duration: {total_elapsed}s")
    print(f"    Best Validation AUC: {best_auc:.4f}")
    print(f"    Production Checkpoint: {best_ckpt_path.resolve()}")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    main()
