// ============================================================
// script.js – Deepfake Detection using AI · Interactive Frontend
// ============================================================

// ---------- Dynamic Space Starfield & Cosmic Engine ----------
let updateSpaceStarfieldColors = null;
(function initDynamicSpaceCanvas() {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = (canvas.width = window.innerWidth);
  let h = (canvas.height = window.innerHeight);

  const mouse = { x: -9999, y: -9999, radius: 130 };
  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('mouseleave', () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);

  // Theme-aware Star Colors
  function getStarPalettes() {
    const theme = document.body.dataset.theme || 'nebula';
    if (theme === 'aurora') {
      return ['#00f59b', '#00d2ff', '#38bdf8', '#ffffff', '#ffd166'];
    } else if (theme === 'void') {
      return ['#ffffff', '#c084fc', '#38bdf8', '#e2e8f0', '#a78bfa'];
    }
    // nebula default
    return ['#00f2fe', '#8a2be2', '#c084fc', '#ffffff', '#ff2a85'];
  }

  let colorPalette = getStarPalettes();
  updateSpaceStarfieldColors = () => {
    colorPalette = getStarPalettes();
    stars.forEach(s => (s.color = colorPalette[Math.floor(Math.random() * colorPalette.length)]));
  };

  // Cosmic Star
  class Star {
    constructor() {
      this.reset(true);
    }
    reset(initial = false) {
      this.x = Math.random() * w;
      this.y = initial ? Math.random() * h : Math.random() < 0.5 ? -10 : h + 10;
      this.size = Math.random() * 2 + 0.5;
      this.depth = Math.random() * 0.8 + 0.2; // Parallax depth
      this.vx = (Math.random() - 0.5) * 0.25 * this.depth;
      this.vy = (Math.random() - 0.5) * 0.25 * this.depth;
      this.baseAlpha = Math.random() * 0.65 + 0.25;
      this.alpha = this.baseAlpha;
      this.twinkleSpeed = Math.random() * 0.03 + 0.01;
      this.twinkleFactor = Math.random() * Math.PI;
      this.color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      this.isPulsar = Math.random() < 0.12; // 12% are glowing pulsars
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;

      // Twinkle
      this.twinkleFactor += this.twinkleSpeed;
      this.alpha = this.baseAlpha + Math.sin(this.twinkleFactor) * 0.25;
      if (this.alpha < 0.1) this.alpha = 0.1;
      if (this.alpha > 0.95) this.alpha = 0.95;

      // Mouse interactive cosmic warp
      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < mouse.radius) {
        const force = (1 - dist / mouse.radius) * 1.5;
        this.x -= (dx / dist) * force;
        this.y -= (dy / dist) * force;
      }

      // Wrap around bounds
      if (this.x < -20 || this.x > w + 20 || this.y < -20 || this.y > h + 20) {
        this.reset();
      }
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.shadowBlur = this.isPulsar ? 14 : 6;
      ctx.shadowColor = this.color;

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();

      // Pulsar 4-point cosmic lens diffraction
      if (this.isPulsar && this.alpha > 0.5) {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 0.7;
        const spikeLen = this.size * 3.5;
        ctx.beginPath();
        ctx.moveTo(this.x - spikeLen, this.y);
        ctx.lineTo(this.x + spikeLen, this.y);
        ctx.moveTo(this.x, this.y - spikeLen);
        ctx.lineTo(this.x, this.y + spikeLen);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Shooting Star / Meteor
  class ShootingStar {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * w * 0.9;
      this.y = Math.random() * (h * 0.45);
      this.len = Math.random() * 110 + 60;
      this.speed = Math.random() * 8 + 12;
      this.angle = Math.PI / 4 + (Math.random() - 0.5) * 0.2; // ~45 deg
      this.vx = Math.cos(this.angle) * this.speed;
      this.vy = Math.sin(this.angle) * this.speed;
      this.life = 0;
      this.maxLife = Math.random() * 35 + 25;
      this.active = false;
      this.color = colorPalette[0];
    }
    trigger() {
      this.reset();
      this.active = true;
    }
    update() {
      if (!this.active) return;
      this.x += this.vx;
      this.y += this.vy;
      this.life++;
      if (this.life >= this.maxLife || this.x > w + 100 || this.y > h + 100) {
        this.active = false;
      }
    }
    draw() {
      if (!this.active) return;
      const progress = this.life / this.maxLife;
      const alpha = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8;

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      const tailX = this.x - Math.cos(this.angle) * this.len;
      const tailY = this.y - Math.sin(this.angle) * this.len;

      const grad = ctx.createLinearGradient(tailX, tailY, this.x, this.y);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.7, this.color);
      grad.addColorStop(1, '#ffffff');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();

      // Glowing meteor head
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.shadowColor = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Populate Starfield
  const starCount = Math.min(130, Math.floor((window.innerWidth * window.innerHeight) / 9000));
  const stars = [];
  for (let i = 0; i < starCount; i++) stars.push(new Star());

  const shootingStars = [new ShootingStar(), new ShootingStar()];
  let nextMeteorTime = Date.now() + 2500;

  // Main Render Loop
  function loop() {
    ctx.clearRect(0, 0, w, h);

    // Subtle Constellation Lines
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const dx = stars[i].x - stars[j].x;
        const dy = stars[i].y - stars[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 85) {
          const alpha = (1 - dist / 85) * 0.16;
          ctx.save();
          ctx.strokeStyle = stars[i].color;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(stars[i].x, stars[i].y);
          ctx.lineTo(stars[j].x, stars[j].y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Update & Draw Stars
    stars.forEach(s => {
      s.update();
      s.draw();
    });

    // Handle Shooting Stars
    if (Date.now() > nextMeteorTime) {
      const inactive = shootingStars.find(m => !m.active);
      if (inactive) inactive.trigger();
      nextMeteorTime = Date.now() + Math.random() * 5000 + 3500; // Trigger every 3.5 - 8.5s
    }
    shootingStars.forEach(m => {
      m.update();
      m.draw();
    });

    requestAnimationFrame(loop);
  }
  loop();
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
      const audioStatus = data.audio_model_available ? ' · Audio Active' : '';
      engineStatusText.textContent = `AI Engine Online (${data.model} · ${ckptStatus}${audioStatus} · ${backendDeviceInfo})`;

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
const ttaWrapper = document.getElementById('tta-wrapper');
const audioChunkWrapper = document.getElementById('audio-chunk-wrapper');
const uploadIcon = document.getElementById('upload-icon');
const uploadMainText = document.getElementById('upload-main-text');
const uploadSubText = document.getElementById('upload-sub-text');
let currentMode = 'image';

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentMode = tab.dataset.tab;
    const fileInput = document.getElementById('file-input');

    if (currentMode === 'audio') {
      fileInput.accept = 'audio/*, .wav, .mp3, .m4a, .flac, .ogg, .webm, .opus, .aac';
      if (frameskipWrapper) frameskipWrapper.hidden = true;
      if (temporalWrapper) temporalWrapper.hidden = true;
      if (ttaWrapper) ttaWrapper.hidden = true;
      if (audioChunkWrapper) audioChunkWrapper.hidden = false;
      if (uploadIcon) uploadIcon.textContent = '🎙️';
      if (uploadMainText) uploadMainText.textContent = 'Drag & drop voice or audio file here';
      if (uploadSubText) uploadSubText.textContent = 'Supports WAV, MP3, M4A, FLAC, OGG, WEBM · Max 50 MB';
    } else if (currentMode === 'video') {
      fileInput.accept = 'video/*';
      if (frameskipWrapper) frameskipWrapper.hidden = false;
      if (temporalWrapper) temporalWrapper.hidden = false;
      if (ttaWrapper) ttaWrapper.hidden = false;
      if (audioChunkWrapper) audioChunkWrapper.hidden = true;
      if (uploadIcon) uploadIcon.textContent = '📁';
      if (uploadMainText) uploadMainText.textContent = 'Drag & drop your video file here';
      if (uploadSubText) uploadSubText.textContent = 'Supports MP4, AVI, MOV, MKV, WEBM · Max 50 MB';
    } else {
      fileInput.accept = 'image/*';
      if (frameskipWrapper) frameskipWrapper.hidden = true;
      if (temporalWrapper) temporalWrapper.hidden = true;
      if (ttaWrapper) ttaWrapper.hidden = false;
      if (audioChunkWrapper) audioChunkWrapper.hidden = true;
      if (uploadIcon) uploadIcon.textContent = '📤';
      if (uploadMainText) uploadMainText.textContent = 'Drag & drop your image file here';
      if (uploadSubText) uploadSubText.textContent = 'Supports JPG, PNG, WEBP, BMP · Max 50 MB';
    }

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

const paramChunk = document.getElementById('param-chunk');
const chunkVal = document.getElementById('chunk-val');
if (paramChunk && chunkVal) {
  paramChunk.addEventListener('input', e => {
    chunkVal.textContent = parseFloat(e.target.value).toFixed(1) + ' s';
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

// ---------- Dynamic Space Theme Switcher ----------
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const themeModeText = document.getElementById('theme-mode-text');

const spaceThemes = [
  { id: 'black-space', name: 'Black Space', icon: '\u{1F30C}', label: 'Black Space', toast: '\u{1F30C} Black Space Theme Activated' },
  { id: 'aurora', name: 'Aurora', icon: '\u26A1', label: 'Aurora Space', toast: '\u26A1 Cosmic Aurora Theme Activated' },
  { id: 'void', name: 'Void', icon: '\u{1FA90}', label: 'Eclipse Void', toast: '\u{1FA90} Deep Eclipse Void Theme Activated' }
];

let currentThemeIdx = 0;
const savedTheme = localStorage.getItem('deepfake_space_theme');
if (savedTheme) {
  const foundIdx = spaceThemes.findIndex(t => t.id === savedTheme);
  if (foundIdx !== -1) currentThemeIdx = foundIdx;
}

function applySpaceTheme(index, notify = false) {
  currentThemeIdx = index;
  const theme = spaceThemes[currentThemeIdx];
  document.body.dataset.theme = theme.id;
  if (themeIcon) themeIcon.textContent = theme.icon;
  if (themeModeText) themeModeText.textContent = theme.name;
  localStorage.setItem('deepfake_space_theme', theme.id);
  if (typeof updateSpaceStarfieldColors === 'function') {
    updateSpaceStarfieldColors();
  }
  if (notify) {
    showToast(theme.toast, 'info', 2200);
  }
}

// Apply on initial load
applySpaceTheme(currentThemeIdx, false);

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const nextIdx = (currentThemeIdx + 1) % spaceThemes.length;
    applySpaceTheme(nextIdx, true);
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

// Voice / Audio UI Elements
const audioPlayerWrapper = document.getElementById('audio-player-wrapper');
const audioPlayer = document.getElementById('audio-player');
const audioTrackName = document.getElementById('audio-track-name');
const audioProbContainer = document.getElementById('audio-prob-container');
const audioFakePct = document.getElementById('audio-fake-pct');
const audioFakeFill = document.getElementById('audio-fake-fill');
const audioRealPct = document.getElementById('audio-real-pct');
const audioRealFill = document.getElementById('audio-real-fill');
const audioPlotContainer = document.getElementById('audio-plot-container');
const audioPlotImg = document.getElementById('audio-plot-img');
const forensicGrid = document.getElementById('forensic-grid');
const segmentsBreakdown = document.getElementById('segments-breakdown');
const segmentsList = document.getElementById('segments-list');

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

  if (audioPlayerWrapper) {
    audioPlayerWrapper.hidden = true;
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.src = '';
    }
  }
  if (audioProbContainer) audioProbContainer.hidden = true;
  if (audioPlotContainer) audioPlotContainer.hidden = true;
  if (forensicGrid) forensicGrid.hidden = true;
  if (segmentsBreakdown) segmentsBreakdown.hidden = true;

  currentViz = { original: null, face: null, cam: null };
  lastAnalysisResult = null;
}

function showFileInfo(file) {
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);
  if (file.type.startsWith('video')) {
    fileTypeIcon.textContent = '🎬';
  } else if (file.type.startsWith('audio') || file.name.match(/\.(wav|mp3|m4a|flac|ogg|webm|opus|aac)$/i)) {
    fileTypeIcon.textContent = '🎙️';
  } else {
    fileTypeIcon.textContent = '🖼️';
  }
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
  // Auto-switch tab if user dropped video or audio into mismatched tab
  if (file.type.startsWith('video') && currentMode !== 'video') {
    document.querySelector('.tab[data-tab="video"]').click();
  } else if ((file.type.startsWith('audio') || file.name.match(/\.(wav|mp3|m4a|flac|ogg|webm|opus|aac)$/i)) && currentMode !== 'audio') {
    document.querySelector('.tab[data-tab="audio"]').click();
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
  const chunkDuration = parseFloat(paramChunk ? paramChunk.value : 3.5);

  const isAudio = selectedFile.type.startsWith('audio') || selectedFile.name.match(/\.(wav|mp3|m4a|flac|ogg|webm|opus|aac)$/i) || currentMode === 'audio';
  const isVideo = !isAudio && (selectedFile.type.startsWith('video') || currentMode === 'video');

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('threshold', threshold);

  let endpoint = '/api/detect-image';
  if (isAudio) {
    formData.append('chunk_duration', chunkDuration);
    endpoint = '/api/detect-audio';
  } else if (isVideo) {
    formData.append('frame_skip', frameSkip);
    formData.append('use_temporal', useTemporal);
    formData.append('use_tta', useTta);
    endpoint = '/api/detect-video';
  } else {
    formData.append('use_tta', useTta);
    endpoint = '/api/detect-image';
  }

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
    lastAnalysisResult = { ...data, fileName: selectedFile.name, fileSize: selectedFile.size, fileType: selectedFile.type, isAudio: isAudio, isVideo: isVideo };

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

    if (isAudio) {
      // Audio layout
      if (vizSwitcher) vizSwitcher.hidden = true;
      if (camExplanation) camExplanation.hidden = true;
      if (videoStatsGrid) videoStatsGrid.hidden = true;
      previewContainer.innerHTML = '';

      // 1. Audio Player
      if (audioPlayerWrapper) {
        audioPlayerWrapper.hidden = false;
        if (audioTrackName) audioTrackName.textContent = selectedFile.name;
        if (audioPlayer) {
          audioPlayer.src = currentPreviewUrl;
          audioPlayer.load();
        }
      }

      // 2. Dual Probability Distribution
      if (audioProbContainer) {
        audioProbContainer.hidden = false;
        const fakeProb = data.fake_prob !== undefined ? data.fake_prob : (isDeepfake ? confidence : (100 - confidence));
        const realProb = data.real_prob !== undefined ? data.real_prob : (100 - fakeProb);

        if (audioFakePct) audioFakePct.textContent = `${fakeProb.toFixed(1)}%`;
        if (audioRealPct) audioRealPct.textContent = `${realProb.toFixed(1)}%`;
        if (audioFakeFill) audioFakeFill.style.width = `${fakeProb}%`;
        if (audioRealFill) audioRealFill.style.width = `${realProb}%`;
      }

      // 3. Mel-Spectrogram & Pitch Jitter Explainability Plot
      if (audioPlotContainer && data.plot_image) {
        audioPlotContainer.hidden = false;
        if (audioPlotImg) audioPlotImg.src = data.plot_image;
      } else if (audioPlotContainer) {
        audioPlotContainer.hidden = true;
      }

      // 4. Acoustic Forensic Indicators
      if (forensicGrid && data.forensic_metrics) {
        forensicGrid.hidden = false;
        const fm = data.forensic_metrics;
        const f0El = document.getElementById('f-f0');
        const jitterEl = document.getElementById('f-jitter');
        const hfEl = document.getElementById('f-hf');
        const centroidEl = document.getElementById('f-centroid');
        const silenceEl = document.getElementById('f-silence');
        const segmentsEl = document.getElementById('f-segments');

        if (f0El) f0El.textContent = `${fm.mean_f0_hz || 0} Hz`;
        if (jitterEl) jitterEl.textContent = `${fm.jitter_percent || 0}%`;
        if (hfEl) hfEl.textContent = `${((fm.hf_energy_ratio || 0) * 100).toFixed(2)}%`;
        if (centroidEl) centroidEl.textContent = `${fm.spectral_centroid_hz || 0} Hz`;
        if (silenceEl) silenceEl.textContent = `${((fm.silence_ratio || 0) * 100).toFixed(1)}%`;

        const totalSegs = (data.segment_results || []).length;
        const fakeSegs = (data.segment_results || []).filter(s => s.is_fake).length;
        if (segmentsEl) segmentsEl.textContent = `${fakeSegs} / ${totalSegs} flagged`;
      }

      // 5. Segment Timeline Breakdown
      if (segmentsBreakdown && data.segment_results && data.segment_results.length > 0) {
        segmentsBreakdown.hidden = false;
        segmentsList.innerHTML = '';
        data.segment_results.forEach(seg => {
          const item = document.createElement('div');
          item.className = 'segment-item ' + (seg.is_fake ? 'is-fake' : 'is-real');
          const timeRange = `${seg.start_time.toFixed(1)}s – ${seg.end_time.toFixed(1)}s`;
          const score = (seg.fake_prob * 100).toFixed(1);
          item.innerHTML = `
            <div>
              <strong>Segment ${seg.segment}</strong> &middot; <span class="seg-time">${timeRange}</span>
            </div>
            <div>
              <span class="seg-badge ${seg.is_fake ? 'fake' : 'real'}">${seg.is_fake ? '⚠ Synthetic' : '✓ Authentic'} (${score}%)</span>
            </div>
          `;
          segmentsList.appendChild(item);
        });
      }

    } else if (isVideo) {
      // Video layout
      if (vizSwitcher) vizSwitcher.hidden = true;
      if (camExplanation) camExplanation.hidden = true;
      if (audioPlayerWrapper) audioPlayerWrapper.hidden = true;
      if (audioProbContainer) audioProbContainer.hidden = true;
      if (audioPlotContainer) audioPlotContainer.hidden = true;
      if (forensicGrid) forensicGrid.hidden = true;
      if (segmentsBreakdown) segmentsBreakdown.hidden = true;

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
      if (audioPlayerWrapper) audioPlayerWrapper.hidden = true;
      if (audioProbContainer) audioProbContainer.hidden = true;
      if (audioPlotContainer) audioPlotContainer.hidden = true;
      if (forensicGrid) forensicGrid.hidden = true;
      if (segmentsBreakdown) segmentsBreakdown.hidden = true;

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
    document.getElementById('detail-type').textContent = selectedFile.type || (isAudio ? 'Audio File' : 'Media File');
    document.getElementById('detail-res').textContent = data.resolution || (isAudio ? `Window: ${chunkDuration}s` : '—');

    const settingsDetail = document.getElementById('detail-settings');
    if (settingsDetail) {
      if (isAudio) {
        settingsDetail.textContent = `Thresh: ${threshold} | Chunk: ${chunkDuration}s`;
      } else if (isVideo) {
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

  const isAudio = lastAnalysisResult.isAudio;
  const isVideo = lastAnalysisResult.isVideo;

  const report = {
    report_title: isAudio ? "Deepfake Voice & Speech Forensic Report" : "Deepfake Detection Forensic Report",
    generated_at: new Date().toISOString(),
    media_information: {
      filename: lastAnalysisResult.fileName,
      file_size_bytes: lastAnalysisResult.fileSize,
      file_type: lastAnalysisResult.fileType,
      resolution: lastAnalysisResult.resolution || null
    },
    detection_verdict: {
      verdict: lastAnalysisResult.label || lastAnalysisResult.verdict,
      is_deepfake: lastAnalysisResult.is_deepfake,
      confidence_score: `${lastAnalysisResult.confidence}%`,
      decision_threshold: lastAnalysisResult.threshold,
      fake_probability_score: lastAnalysisResult.fake_prob !== undefined ? `${lastAnalysisResult.fake_prob}%` : null,
      real_probability_score: lastAnalysisResult.real_prob !== undefined ? `${lastAnalysisResult.real_prob}%` : null
    },
    model_metadata: {
      architecture: lastAnalysisResult.model_name,
      processing_time_seconds: lastAnalysisResult.processing_time,
      inference_device: backendDeviceInfo
    },
    acoustic_forensics: isAudio ? {
      metrics: lastAnalysisResult.forensic_metrics,
      segment_scan: lastAnalysisResult.segment_results,
      forensic_summary: lastAnalysisResult.summary_text
    } : null,
    frame_statistics: isVideo && lastAnalysisResult.total_frames ? {
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
  const prefix = isAudio ? 'Voice_Deepfake' : 'Deepfake';
  a.download = `${prefix}_Analysis_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Forensic report downloaded successfully!', 'success', 2500);
});

// Initialise
resetResult();
detectBtn.disabled = true;

