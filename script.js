// ============================================================
// script.js – Deepfake Detection using AI · Interactive Frontend
// ============================================================

// ---------- Particle background ----------
(function initParticles() {
  const canvas = document.getElementById('particles');
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];

  function resize() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize);
  resize();

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.r = Math.random() * 1.8 + 0.4;
      this.dx = (Math.random() - 0.5) * 0.35;
      this.dy = (Math.random() - 0.5) * 0.35;
      this.alpha = Math.random() * 0.5 + 0.15;
    }
    update() {
      this.x += this.dx; this.y += this.dy;
      if (this.x < 0 || this.x > w || this.y < 0 || this.y > h) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(140,100,255,${this.alpha})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < 90; i++) particles.push(new Particle());

  (function loop() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(loop);
  })();
})();

// ---------- Navbar scroll shadow ----------
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
});

// ---------- Mobile nav toggle ----------
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');
navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.querySelectorAll('a').forEach(a =>
  a.addEventListener('click', () => navLinks.classList.remove('open'))
);

// ---------- Scroll-reveal ----------
function reveal() {
  document.querySelectorAll('.reveal').forEach(el => {
    if (el.getBoundingClientRect().top < window.innerHeight - 60) el.classList.add('visible');
  });
}
document.querySelectorAll(
  '.feature-card, .step, .upload-card, .stats-bar .stat, .testimonial-card, .faq-item'
).forEach(el => el.classList.add('reveal'));
window.addEventListener('scroll', reveal);
window.addEventListener('DOMContentLoaded', reveal);

// ---------- Back to top ----------
const backBtn = document.getElementById('back-to-top');
window.addEventListener('scroll', () => {
  backBtn.classList.toggle('visible', window.scrollY > 500);
});
backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// ---------- Toast notifications ----------
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ---------- Animated stat counters ----------
function animateCounters() {
  document.querySelectorAll('.stat').forEach(stat => {
    const num = stat.querySelector('.stat-number');
    const target = parseFloat(stat.dataset.target);
    const suffix = stat.dataset.suffix || '';
    const isFloat = target % 1 !== 0;
    const duration = 2000;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      let current = ease * target;
      if (target >= 10000) {
        if (current >= 1e6) num.textContent = (current / 1e6).toFixed(1) + 'M' + suffix;
        else if (current >= 1e3) num.textContent = (current / 1e3).toFixed(0) + 'K' + suffix;
        else num.textContent = Math.floor(current) + suffix;
      } else {
        num.textContent = (isFloat ? current.toFixed(1) : Math.floor(current)) + suffix;
      }
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}
const statsObserver = new IntersectionObserver((entries, obs) => {
  entries.forEach(e => { if (e.isIntersecting) { animateCounters(); obs.disconnect(); } });
}, { threshold: 0.3 });
statsObserver.observe(document.querySelector('.stats-bar'));

// ---------- Backend Connection & Status Check ----------
const engineStatus = document.getElementById('engine-status');
const engineStatusText = document.getElementById('engine-status-text');
let backendDeviceInfo = 'CPU';
let temporalAvailable = false;

async function checkBackendStatus() {
  try {
    const res = await fetch('/api/status', { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      engineStatus.classList.add('online');
      engineStatus.classList.remove('offline');
      backendDeviceInfo = data.device || 'CPU';
      temporalAvailable = Boolean(data.temporal_model_available);

      const ckptStatus = data.checkpoint && data.checkpoint.loaded ? 'Fine-tuned' : 'Pretrained';
      engineStatusText.textContent = `AI Engine Online (${data.model} · ${ckptStatus} · ${backendDeviceInfo})`;

      // Enable temporal toggle if backend has it
      const tempWrapper = document.getElementById('temporal-wrapper');
      const tempInput = document.getElementById('param-temporal');
      const tempHint = document.getElementById('temporal-hint');
      if (tempInput) {
        tempInput.disabled = !temporalAvailable;
        if (!temporalAvailable && tempHint) {
          tempHint.textContent = 'Temporal checkpoint not found — using frame-by-frame analysis';
        }
      }
    } else {
      throw new Error('Server returned non-200');
    }
  } catch (err) {
    if (engineStatus) {
      engineStatus.classList.add('offline');
      engineStatus.classList.remove('online');
      engineStatusText.textContent = 'AI Engine Offline (Run python app.py)';
    }
  }
}
checkBackendStatus();

// ---------- Upload tabs & Settings Mode ----------
const frameskipWrapper = document.getElementById('frameskip-wrapper');
const temporalWrapper = document.getElementById('temporal-wrapper');
let currentMode = 'image';

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentMode = tab.dataset.tab;
    const fileInput = document.getElementById('file-input');
    fileInput.accept = currentMode === 'video' ? 'video/*' : 'image/*';

    if (frameskipWrapper) frameskipWrapper.hidden = (currentMode !== 'video');
    if (temporalWrapper) temporalWrapper.hidden = (currentMode !== 'video');

    clearFile();
    showToast(`Switched to ${currentMode} detection mode`, 'info', 2000);
  });
});

// ---------- Settings Accordion & Sliders ----------
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
if (settingsToggle && settingsPanel) {
  settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('open');
  });
}

const paramThreshold = document.getElementById('param-threshold');
const thresholdVal = document.getElementById('threshold-val');
if (paramThreshold && thresholdVal) {
  paramThreshold.addEventListener('input', e => {
    thresholdVal.textContent = parseFloat(e.target.value).toFixed(2);
  });
}

const paramFrameskip = document.getElementById('param-frameskip');
const frameskipVal = document.getElementById('frameskip-val');
if (paramFrameskip && frameskipVal) {
  paramFrameskip.addEventListener('input', e => {
    frameskipVal.textContent = e.target.value;
  });
}

// ---------- FAQ accordion ----------
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});

// ---------- Testimonials carousel ----------
(function initTestimonials() {
  const track = document.getElementById('testimonial-track');
  if (!track) return;
  const cards = track.querySelectorAll('.testimonial-card');
  const dotsWrap = document.getElementById('testimonial-dots');
  let current = 0;

  cards.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => goTo(i));
    dotsWrap.appendChild(dot);
  });

  function goTo(index) {
    current = index;
    track.style.transform = `translateX(-${index * 100}%)`;
    dotsWrap.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === index));
  }

  setInterval(() => goTo((current + 1) % cards.length), 5000);
})();

// ---------- Theme toggle ----------
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
let isDark = true;
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    isDark = !isDark;
    themeIcon.textContent = isDark ? '\u2606' : '\u2600';
    showToast(isDark ? 'Dark mode enabled' : 'Light mode coming soon!', 'info', 2000);
  });
}

// ---------- Upload & Detection Elements ----------
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const detectBtn = document.getElementById('detect-btn');
const resultSection = document.getElementById('result-section');
const previewContainer = document.getElementById('preview-container');
const resultBadge = document.getElementById('result-badge');
const fileInfo = document.getElementById('file-info');
const fileNameEl = document.getElementById('file-name');
const fileSizeEl = document.getElementById('file-size');
const fileTypeIcon = document.getElementById('file-type-icon');
const removeFileBtn = document.getElementById('remove-file');
const confidenceWrap = document.getElementById('confidence-wrap');
const confidenceFill = document.getElementById('confidence-fill');
const confValue = document.getElementById('conf-value');
const btnText = detectBtn.querySelector('.btn-text');
const btnLoader = detectBtn.querySelector('.btn-loader');
const resultDetails = document.getElementById('result-details');
const downloadReport = document.getElementById('download-report');

// Visualizer Switcher & Explanations
const vizSwitcher = document.getElementById('viz-switcher');
const camExplanation = document.getElementById('cam-explanation');
const videoStatsGrid = document.getElementById('video-stats-grid');

let selectedFile = null;
let currentPreviewUrl = null;
let currentViz = { original: null, face: null, cam: null };
let lastAnalysisResult = null;

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function resetResult() {
  resultSection.hidden = true;
  resultBadge.textContent = '';
  resultBadge.className = 'result-badge';
  previewContainer.innerHTML = '';
  confidenceWrap.hidden = true;
  confidenceFill.style.width = '0';
  confValue.textContent = '0%';
  resultDetails.hidden = true;
  downloadReport.hidden = true;
  if (vizSwitcher) vizSwitcher.hidden = true;
  if (camExplanation) camExplanation.hidden = true;
  if (videoStatsGrid) videoStatsGrid.hidden = true;
  currentViz = { original: null, face: null, cam: null };
  lastAnalysisResult = null;
}

function showFileInfo(file) {
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);
  fileTypeIcon.textContent = file.type.startsWith('video') ? '🎬' : '🖼️';
  fileInfo.hidden = false;
}

function clearFile() {
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = null;
  }
  selectedFile = null;
  fileInput.value = '';
  fileInfo.hidden = true;
  detectBtn.disabled = true;
  resetResult();
}

removeFileBtn.addEventListener('click', clearFile);

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault(); uploadArea.classList.remove('drag-over');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

function handleFile(file) {
  if (file.size > 50 * 1024 * 1024) {
    showToast('File exceeds 50 MB limit', 'error');
    return;
  }
  // Auto-switch tab if user dropped video into image tab or vice-versa
  if (file.type.startsWith('video') && currentMode !== 'video') {
    document.querySelector('.tab[data-tab="video"]').click();
  } else if (file.type.startsWith('image') && currentMode !== 'image') {
    document.querySelector('.tab[data-tab="image"]').click();
  }

  selectedFile = file;
  if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
  currentPreviewUrl = URL.createObjectURL(file);

  showFileInfo(file);
  detectBtn.disabled = false;
  resetResult();
  showToast('File loaded. Click Analyse Media to run AI detection.', 'success', 2500);
}

// ---------- Visualizer switcher (Original vs Face vs GradCAM) ----------
if (vizSwitcher) {
  vizSwitcher.querySelectorAll('.viz-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      vizSwitcher.querySelectorAll('.viz-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      showVisualizationView(view);
    });
  });
}

function showVisualizationView(view) {
  const imgSrc = currentViz[view] || currentViz.original;
  if (!imgSrc) return;
  previewContainer.innerHTML = '';
  const img = document.createElement('img');
  img.src = imgSrc;
  img.alt = `${view} visualization`;
  previewContainer.appendChild(img);

  if (camExplanation) {
    camExplanation.hidden = (view !== 'cam');
  }
}

// ---------- Detection Request via FastAPI ----------
detectBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  btnText.textContent = 'Analysing with AI…';
  btnLoader.hidden = false;
  detectBtn.disabled = true;

  const threshold = parseFloat(paramThreshold ? paramThreshold.value : 0.50);
  const useTta = document.getElementById('param-tta') ? document.getElementById('param-tta').checked : true;
  const frameSkip = parseInt(paramFrameskip ? paramFrameskip.value : 5);
  const useTemporal = document.getElementById('param-temporal') ? document.getElementById('param-temporal').checked : false;

  const isVideo = selectedFile.type.startsWith('video') || currentMode === 'video';

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('threshold', threshold);
  formData.append('use_tta', useTta);

  if (isVideo) {
    formData.append('frame_skip', frameSkip);
    formData.append('use_temporal', useTemporal);
  }

  const endpoint = isVideo ? '/api/detect-video' : '/api/detect-image';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.detail || `Server error ${response.status}`);
    }

    const data = await response.json();
    lastAnalysisResult = { ...data, fileName: selectedFile.name, fileSize: selectedFile.size, fileType: selectedFile.type };

    if (!data.success) {
      showToast(data.message || 'Detection could not be completed.', 'error', 4500);
      btnText.textContent = 'Analyse Media';
      btnLoader.hidden = true;
      detectBtn.disabled = false;
      return;
    }

    // Render Results
    resultSection.hidden = false;
    const isDeepfake = data.is_deepfake;
    const confidence = data.confidence || 0;

    resultBadge.textContent = isDeepfake ? '⚠ Deepfake Detected' : '✓ Authentic Media';
    resultBadge.className = 'result-badge ' + (isDeepfake ? 'deepfake' : 'authentic');

    // Populate confidence bar
    confidenceWrap.hidden = false;
    requestAnimationFrame(() => {
      confidenceFill.style.width = `${confidence}%`;
      confValue.textContent = `${confidence.toFixed(1)}%`;
    });

    if (isVideo) {
      // Video layout
      if (vizSwitcher) vizSwitcher.hidden = true;
      if (camExplanation) camExplanation.hidden = true;

      if (videoStatsGrid) {
        videoStatsGrid.hidden = false;
        document.getElementById('vstat-total').textContent = data.total_frames || '—';
        document.getElementById('vstat-analyzed').textContent = data.frames_analyzed || '—';
        document.getElementById('vstat-fake').textContent = `${data.fake_frames || 0} (${data.fake_pct || 0}%)`;
        document.getElementById('vstat-real').textContent = `${data.real_frames || 0} (${data.real_pct || 0}%)`;
      }

      previewContainer.innerHTML = '';
      const vid = document.createElement('video');
      vid.src = data.video_url || currentPreviewUrl;
      vid.controls = true;
      vid.autoplay = false;
      previewContainer.appendChild(vid);

    } else {
      // Image layout
      if (videoStatsGrid) videoStatsGrid.hidden = true;

      currentViz.original = currentPreviewUrl;
      currentViz.face = data.face_crop;
      currentViz.cam = data.grad_cam;

      if (vizSwitcher) {
        vizSwitcher.hidden = false;
        vizSwitcher.querySelectorAll('.viz-btn').forEach(b => b.classList.remove('active'));
        const defaultTab = currentViz.cam ? 'cam' : 'original';
        const defaultBtn = vizSwitcher.querySelector(`.viz-btn[data-view="${defaultTab}"]`);
        if (defaultBtn) defaultBtn.classList.add('active');
        showVisualizationView(defaultTab);
      } else {
        showVisualizationView('original');
      }
    }

    // Populate details table
    document.getElementById('detail-model').textContent = data.model_name || 'InceptionResnetV1';
    const devEl = document.getElementById('detail-device');
    if (devEl) devEl.textContent = backendDeviceInfo.toUpperCase();
    document.getElementById('detail-time').textContent = `${data.processing_time} s`;
    document.getElementById('detail-type').textContent = selectedFile.type || 'Media File';
    document.getElementById('detail-res').textContent = data.resolution || '—';

    const settingsDetail = document.getElementById('detail-settings');
    if (settingsDetail) {
      if (isVideo) {
        settingsDetail.textContent = `Thresh: ${threshold} | Skip: ${frameSkip} | Temporal: ${useTemporal ? 'ON' : 'OFF'}`;
      } else {
        settingsDetail.textContent = `Thresh: ${threshold} | TTA: ${useTta ? 'ON' : 'OFF'}`;
      }
    }

    resultDetails.hidden = false;
    downloadReport.hidden = false;

    resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(
      isDeepfake ? 'Analysis complete: Synthetic manipulation detected!' : 'Analysis complete: Media appears authentic.',
      isDeepfake ? 'error' : 'success',
      4000
    );

  } catch (err) {
    console.error('Detection failed:', err);
    showToast(`Analysis failed: ${err.message || 'Could not communicate with AI backend.'}`, 'error', 5000);
  } finally {
    btnText.textContent = 'Analyse Media';
    btnLoader.hidden = true;
    detectBtn.disabled = false;
  }
});

// ---------- Download Forensic Report ----------
downloadReport.addEventListener('click', () => {
  if (!lastAnalysisResult) {
    showToast('No analysis result available to export', 'info');
    return;
  }

  const report = {
    report_title: "Deepfake Detection Forensic Report",
    generated_at: new Date().toISOString(),
    media_information: {
      filename: lastAnalysisResult.fileName,
      file_size_bytes: lastAnalysisResult.fileSize,
      file_type: lastAnalysisResult.fileType,
      resolution: lastAnalysisResult.resolution
    },
    detection_verdict: {
      verdict: lastAnalysisResult.label || lastAnalysisResult.verdict,
      is_deepfake: lastAnalysisResult.is_deepfake,
      confidence_score: `${lastAnalysisResult.confidence}%`,
      decision_threshold: lastAnalysisResult.threshold
    },
    model_metadata: {
      architecture: lastAnalysisResult.model_name,
      processing_time_seconds: lastAnalysisResult.processing_time,
      inference_device: backendDeviceInfo
    },
    frame_statistics: lastAnalysisResult.total_frames ? {
      total_frames: lastAnalysisResult.total_frames,
      frames_analyzed: lastAnalysisResult.frames_analyzed,
      fake_frames: lastAnalysisResult.fake_frames,
      real_frames: lastAnalysisResult.real_frames,
      fake_percentage: `${lastAnalysisResult.fake_pct}%`,
      real_percentage: `${lastAnalysisResult.real_pct}%`
    } : null
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Deepfake_Analysis_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Forensic report downloaded successfully!', 'success', 2500);
});

// Initialise
resetResult();
detectBtn.disabled = true;

