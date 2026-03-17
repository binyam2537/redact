// Prompt Privacy Shield — Popup Logic
// Unified editor/preview with analyze and redact

(function () {
  'use strict';

  var Detector = window.PromptPrivacyDetector;

  var inputArea = document.getElementById('input-area');
  var previewArea = document.getElementById('preview-area');
  var editorWrap = document.getElementById('editor-wrap');
  var analyzeBtn = document.getElementById('analyze-btn');
  var redactBtn = document.getElementById('redact-btn');
  var summaryDiv = document.getElementById('findings-summary');
  var safeBadge = document.getElementById('safe-badge');
  var toggleMode = document.getElementById('toggle-mode');
  var toggleTheme = document.getElementById('toggle-theme');

  var mode = 'edit'; // 'edit' or 'preview'
  var lastResult = null;

  // ── Theme toggle ──

  function detectTheme() {
    var stored = localStorage.getItem('pps-theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.style.colorScheme = theme;
    var root = document.documentElement;

    var sunIcon = document.getElementById('icon-sun');
    var moonIcon = document.getElementById('icon-moon');

    if (theme === 'light') {
      root.style.setProperty('--bg', '#ffffff');
      root.style.setProperty('--bg-elevated', '#f5f5f5');
      root.style.setProperty('--bg-input', '#fafafa');
      root.style.setProperty('--text', '#171717');
      root.style.setProperty('--text-secondary', '#737373');
      root.style.setProperty('--border', '#e5e5e5');
      if (moonIcon) moonIcon.style.display = 'block';
      if (sunIcon) sunIcon.style.display = 'none';
    } else {
      root.style.setProperty('--bg', '#1a1a1a');
      root.style.setProperty('--bg-elevated', '#262626');
      root.style.setProperty('--bg-input', '#2a2a2a');
      root.style.setProperty('--text', '#e5e5e5');
      root.style.setProperty('--text-secondary', '#a3a3a3');
      root.style.setProperty('--border', '#333');
      if (sunIcon) sunIcon.style.display = 'block';
      if (moonIcon) moonIcon.style.display = 'none';
    }
  }

  var currentTheme = detectTheme();
  applyTheme(currentTheme);

  toggleTheme.addEventListener('click', function () {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('pps-theme', currentTheme);
    applyTheme(currentTheme);
  });

  // ── Mode toggle (edit / preview) ──

  function switchMode(newMode) {
    mode = newMode;
    if (mode === 'edit') {
      inputArea.style.display = 'block';
      previewArea.style.display = 'none';
      toggleMode.classList.remove('active');
      inputArea.focus();
    } else {
      // Render preview from current text
      var text = inputArea.value;
      if (lastResult && !lastResult.safe) {
        previewArea.innerHTML = Detector.highlightHTML(text, lastResult.findings);
      } else {
        previewArea.innerHTML = Detector.escapeHTML(text);
      }
      inputArea.style.display = 'none';
      previewArea.style.display = 'block';
      toggleMode.classList.add('active');
    }
  }

  toggleMode.addEventListener('click', function () {
    if (mode === 'edit') {
      // Auto-analyze before switching to preview
      analyze();
      switchMode('preview');
    } else {
      switchMode('edit');
    }
  });

  // ── Analyze ──

  function analyze() {
    var text = inputArea.value.trim();

    // Reset
    summaryDiv.style.display = 'none';
    summaryDiv.innerHTML = '';
    safeBadge.style.display = 'none';
    redactBtn.style.display = 'none';
    editorWrap.classList.remove('safe', 'unsafe');

    if (!text) {
      lastResult = null;
      return;
    }

    lastResult = Detector.scan(text);

    if (lastResult.safe) {
      safeBadge.style.display = 'flex';
      editorWrap.classList.add('safe');

      if (mode === 'preview') {
        previewArea.innerHTML = Detector.escapeHTML(text);
      }
      return;
    }

    // Unsafe — show findings
    editorWrap.classList.add('unsafe');
    redactBtn.style.display = 'flex';

    // Build summary tags
    var counts = Detector.summarize(lastResult.findings);
    var tagsHTML = '';
    for (var cat in counts) {
      var sev = 1;
      for (var i = 0; i < lastResult.findings.length; i++) {
        if (lastResult.findings[i].category === cat) { sev = lastResult.findings[i].severity; break; }
      }
      tagsHTML += '<span class="finding-tag sev-' + sev + '">' +
        Detector.escapeHTML(cat) + ' \u00d7' + counts[cat] + '</span>';
    }
    summaryDiv.innerHTML = tagsHTML;
    summaryDiv.style.display = 'flex';

    if (mode === 'preview') {
      previewArea.innerHTML = Detector.highlightHTML(text, lastResult.findings);
    }
  }

  // ── Redact ──

  function redactAll() {
    if (!lastResult || lastResult.safe) return;

    var text = inputArea.value;
    var redacted = Detector.redact(text, lastResult.findings);

    inputArea.value = redacted;
    analyze(); // Re-scan

    // Switch to preview to show the clean result
    if (mode === 'edit') {
      switchMode('preview');
    } else {
      var newText = inputArea.value;
      if (lastResult && !lastResult.safe) {
        previewArea.innerHTML = Detector.highlightHTML(newText, lastResult.findings);
      } else {
        previewArea.innerHTML = Detector.escapeHTML(newText);
      }
    }
  }

  // ── Event listeners ──

  analyzeBtn.addEventListener('click', function () {
    analyze();
    if (lastResult && !lastResult.safe) {
      switchMode('preview');
    }
  });

  redactBtn.addEventListener('click', redactAll);

  inputArea.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      analyze();
      if (lastResult && !lastResult.safe) {
        switchMode('preview');
      }
    }
  });

  // Auto-analyze on paste
  inputArea.addEventListener('paste', function () {
    setTimeout(function () {
      analyze();
      if (lastResult && !lastResult.safe) {
        switchMode('preview');
      }
    }, 50);
  });
})();
