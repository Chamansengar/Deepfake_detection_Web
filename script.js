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

// ---------- Upload tabs ----------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const type = tab.dataset.tab;
    const fileInput = document.getElementById('file-input');
    fileInput.accept = type === 'video' ? 'video/*' : 'image/*';
    showToast(`Switched to ${type} mode`, 'info', 2000);
  });
});

// ---------- FAQ accordion ----------
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const wasOpen = item.classList.contains('open');
    // Close all
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    // Toggle current
    if (!wasOpen) item.classList.add('open');
  });
});

// ---------- Testimonials carousel ----------
(function initTestimonials() {
  const track = document.getElementById('testimonial-track');
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

  // Auto-play
  setInterval(() => goTo((current + 1) % cards.length), 5000);
})();

// ---------- Theme toggle (visual only) ----------
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
let isDark = true;
themeToggle.addEventListener('click', () => {
  isDark = !isDark;
  themeIcon.textContent = isDark ? '\u2606' : '\u2600'; // star / sun
  showToast(isDark ? 'Dark mode enabled' : 'Light mode — coming soon!', 'info', 2000);
});

// ---------- Upload logic ----------
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

let selectedFile = null;

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
}

function showFileInfo(file) {
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);
  fileTypeIcon.textContent = file.type.startsWith('video') ? '🎬' : '🖼️';
  fileInfo.hidden = false;
}

function clearFile() {
  selectedFile = null;
  fileInput.value = '';
  fileInfo.hidden = true;
  detectBtn.disabled = true;
  resetResult();
}

removeFileBtn.addEventListener('click', clearFile);

function createPreview(file) {
  const url = URL.createObjectURL(file);
  previewContainer.innerHTML = '';
  if (file.type.startsWith('video')) {
    const vid = document.createElement('video');
    vid.src = url; vid.controls = true;
    previewContainer.appendChild(vid);
  } else {
    const img = document.createElement('img');
    img.src = url; img.alt = 'Uploaded preview';
    previewContainer.appendChild(img);
  }
}

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
  selectedFile = file;
  showFileInfo(file);
  detectBtn.disabled = false;
  resetResult();
  showToast('File ready for analysis', 'success', 2500);
}

// ---------- Detection ----------
detectBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  btnText.textContent = 'Analysing…';
  btnLoader.hidden = false;
  detectBtn.disabled = true;

  createPreview(selectedFile);

  const startTime = performance.now();

  // ---- Replace with real API call ----
  await new Promise(r => setTimeout(r, 2200));
  const isDeepfake = Math.random() > 0.5;
  const confidence = Math.floor(Math.random() * 20 + 80);
  // ------------------------------------

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

  resultSection.hidden = false;
  resultBadge.textContent = isDeepfake ? '⚠ Deepfake Detected' : '✓ Authentic';
  resultBadge.classList.add(isDeepfake ? 'deepfake' : 'authentic');

  confidenceWrap.hidden = false;
  requestAnimationFrame(() => {
    confidenceFill.style.width = confidence + '%';
    confValue.textContent = confidence + '%';
  });

  // Populate details
  document.getElementById('detail-time').textContent = elapsed + ' s';
  document.getElementById('detail-type').textContent = selectedFile.type || 'unknown';
  document.getElementById('detail-res').textContent = '—'; // Populate from real API
  resultDetails.hidden = false;
  downloadReport.hidden = false;

  btnText.textContent = 'Analyse Media';
  btnLoader.hidden = true;
  detectBtn.disabled = false;

  resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

  showToast(
    isDeepfake ? 'Deepfake detected! Review results below.' : 'Media appears authentic.',
    isDeepfake ? 'error' : 'success'
  );
});

// Download report (placeholder)
downloadReport.addEventListener('click', () => {
  showToast('Report download will be available with backend integration', 'info');
});

// Initialise
resetResult();
detectBtn.disabled = true;
