// Prompt Privacy Shield — Popup Logic

(function () {
  'use strict';

  var Detector = window.PromptPrivacyDetector;

  // ── State ──
  var currentTheme = 'light';
  var customPatterns = [];
  var lastResult = null;
  var lastText = '';
  var isRedacting = false;
  var isScanRunning = false;
  var totalFindings = 0;

  // ── Scan stages (slightly faster than content script) ──
  var SCAN_STAGES = [
    { label: 'Scanning API keys & tokens...', duration: 270 },
    { label: 'Checking cloud credentials...', duration: 260 },
    { label: 'Inspecting database URIs & JWTs...', duration: 240 },
    { label: 'Looking for personal identifiers...', duration: 260 },
    { label: 'Detecting financial data...', duration: 230 },
    { label: 'Checking network artifacts...', duration: 210 },
    { label: 'Applying custom watch patterns...', duration: 200 },
    { label: 'Finalizing results...', duration: 180 }
  ];

  // ── Elements — Main panel ──
  var btnTheme = document.getElementById('btn-theme');
  var iconSun = document.getElementById('icon-sun');
  var iconMoon = document.getElementById('icon-moon');
  var statCount = document.getElementById('stat-count');
  var btnCheckText = document.getElementById('btn-check-text');
  var patternListEl = document.getElementById('pattern-list');
  var patternInput = document.getElementById('pattern-input');
  var btnAddPattern = document.getElementById('btn-add-pattern');

  // ── Elements — Checker panel ──
  var checkTextarea = document.getElementById('check-textarea');
  var scanStage = document.getElementById('scan-stage');
  var stageLabel = document.getElementById('stage-label');
  var checkSummary = document.getElementById('check-summary');
  var btnScan = document.getElementById('btn-scan');
  var btnRedact = document.getElementById('btn-redact');
  var btnBack = document.getElementById('btn-back');

  var panelMain = document.getElementById('panel-main');
  var panelChecker = document.getElementById('panel-checker');

  // ══════════════════════════════════════════════════════════════
  // THEME
  // ══════════════════════════════════════════════════════════════

  function applyTheme(theme) {
    currentTheme = theme;
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      iconSun.style.display = 'block';
      iconMoon.style.display = 'none';
    } else {
      document.documentElement.classList.remove('dark');
      iconSun.style.display = 'none';
      iconMoon.style.display = 'block';
    }
  }

  btnTheme.addEventListener('click', function () {
    var next = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    chrome.storage.local.set({ pps_theme: next });
  });

  // ══════════════════════════════════════════════════════════════
  // PANEL NAVIGATION
  // ══════════════════════════════════════════════════════════════

  btnCheckText.addEventListener('click', function () {
    panelMain.style.display = 'none';
    panelChecker.style.display = 'block';
    setTimeout(function () { checkTextarea.focus(); }, 60);
  });

  btnBack.addEventListener('click', function () {
    panelChecker.style.display = 'none';
    panelMain.style.display = 'block';
    resetChecker();
  });

  function resetChecker() {
    checkTextarea.value = '';
    checkTextarea.className = '';
    scanStage.style.display = 'none';
    checkSummary.style.display = 'none';
    checkSummary.innerHTML = '';
    btnRedact.style.display = 'none';
    btnRedact.disabled = false;
    btnRedact.className = 'btn-danger-out';
    btnRedact.innerHTML = PAINTBRUSH_SVG + ' Redact All';
    btnScan.disabled = false;
    btnScan.className = 'btn-primary';
    btnScan.innerHTML = SCAN_SVG + ' Scan';
    lastResult = null;
    lastText = '';
    isRedacting = false;
    isScanRunning = false;
  }

  // Inline SVG snippets for buttons (to avoid external deps)
  var SCAN_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
  var PAINTBRUSH_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.622 17.897-10.68-2.913"/><path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"/><path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"/></svg>';
  var SHIELD_CHECK_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>';

  // ══════════════════════════════════════════════════════════════
  // CUSTOM PATTERNS
  // ══════════════════════════════════════════════════════════════

  function renderPatterns() {
    patternListEl.innerHTML = '';

    // '<div class="pattern-empty">No patterns yet — add words or phrases to watch for</div>';
    if (customPatterns.length === 0) {
      patternListEl.innerHTML =
        '<div class="pattern-empty">No custom patterns yet.</div>';
      return;
    }

    customPatterns.forEach(function (item, idx) {
      var label = typeof item === 'string' ? item : (item.label || item.pattern || '');
      var div = document.createElement('div');
      div.className = 'pattern-item';
      div.innerHTML =
        '<span class="pattern-dot"></span>' +
        '<span class="pattern-text" title="' + esc(label) + '">' + esc(label) + '</span>' +
        '<button class="pattern-remove" data-idx="' + idx + '" title="Remove">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>';
      patternListEl.appendChild(div);
    });

    patternListEl.querySelectorAll('.pattern-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        customPatterns.splice(parseInt(this.dataset.idx, 10), 1);
        savePatterns();
        renderPatterns();
        Detector.addCustomPatterns(customPatterns);
      });
    });
  }

  function savePatterns() {
    chrome.storage.sync.set({ pps_custom_patterns: customPatterns });
  }

  function addPattern() {
    var val = patternInput.value.trim();
    if (!val) return;

    // Validate if it looks like a regex
    var reMatch = val.match(/^\/(.+)\/([gimsuy]*)$/);
    if (reMatch) {
      try { new RegExp(reMatch[1]); }
      catch (e) {
        patternInput.style.borderColor = 'var(--danger)';
        setTimeout(function () { patternInput.style.borderColor = ''; }, 1500);
        return;
      }
    }

    customPatterns.push({ pattern: val, label: val });
    savePatterns();
    renderPatterns();
    Detector.addCustomPatterns(customPatterns);
    patternInput.value = '';
    patternInput.focus();
  }

  btnAddPattern.addEventListener('click', addPattern);
  patternInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addPattern(); }
  });

  // ══════════════════════════════════════════════════════════════
  // STATS
  // ══════════════════════════════════════════════════════════════

  function refreshStats() {
    chrome.storage.local.get({ pps_total_redacted: 0 }, function (data) {
      statCount.textContent = (data.pps_total_redacted || 0).toLocaleString();
    });
  }

  // ══════════════════════════════════════════════════════════════
  // CHECKER — fast preview on paste
  // ══════════════════════════════════════════════════════════════

  checkTextarea.addEventListener('paste', function () {
    setTimeout(function () {
      var text = checkTextarea.value.trim();
      if (!text) return;
      fastPreview(text);
    }, 50);
  });

  // Also run fast preview on input (typing)
  checkTextarea.addEventListener('input', function () {
    if (isScanRunning || isRedacting) return;
    var text = checkTextarea.value.trim();
    if (!text) {
      checkTextarea.className = '';
      checkSummary.style.display = 'none';
      btnRedact.style.display = 'none';
      lastResult = null;
      return;
    }
    // Debounce: only fast-preview after brief pause
    clearTimeout(checkTextarea._debounce);
    checkTextarea._debounce = setTimeout(function () { fastPreview(text); }, 400);
  });

  function fastPreview(text) {
    lastText = text;
    var result = Detector.scan(text);
    lastResult = result;
    totalFindings = result.findings.length;

    checkSummary.style.display = 'none';
    checkTextarea.className = '';

    if (result.safe) {
      checkTextarea.className = 'is-safe';
      checkSummary.innerHTML = buildSafeTag('Looks clean — click Scan for deep analysis');
      checkSummary.style.display = 'flex';
      btnRedact.style.display = 'none';
    } else {
      checkTextarea.className = 'is-unsafe';
      renderSummaryTags(result.findings);
      checkSummary.style.display = 'flex';
      btnRedact.style.display = 'flex';
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CHECKER — Scan button (teleprompter + full scan)
  // ══════════════════════════════════════════════════════════════

  btnScan.addEventListener('click', function () {
    if (isScanRunning || isRedacting) return;
    var text = checkTextarea.value.trim() || lastText;
    if (!text) return;
    lastText = text;
    runFullScan(text);
  });

  function runFullScan(text) {
    isScanRunning = true;
    btnScan.disabled = true;
    btnRedact.style.display = 'none';
    checkTextarea.className = '';
    checkSummary.style.display = 'none';

    // Show stage indicator
    scanStage.style.display = 'flex';
    var idx = 0;

    function nextStage() {
      if (idx >= SCAN_STAGES.length) {
        stageLabel.textContent = 'Done';
        document.getElementById('stage-spinner').style.display = 'none';
        setTimeout(function () {
          scanStage.style.display = 'none';
          finishFullScan(text);
        }, 220);
        return;
      }
      stageLabel.textContent = SCAN_STAGES[idx].label;
      setTimeout(nextStage, SCAN_STAGES[idx].duration);
      idx++;
    }

    nextStage();
  }

  function finishFullScan(text) {
    isScanRunning = false;
    document.getElementById('stage-spinner').style.display = 'block';
    btnScan.disabled = false;

    var result = Detector.deepScan(text);
    lastResult = result;
    lastText = text;
    totalFindings = result.findings.length;

    if (result.safe) {
      checkTextarea.className = 'is-safe';
      checkSummary.innerHTML = buildSafeTag('No sensitive data found');
      checkSummary.style.display = 'flex';
      btnRedact.style.display = 'none';
    } else {
      checkTextarea.className = 'is-unsafe';
      renderSummaryTags(result.findings);
      checkSummary.style.display = 'flex';
      btnRedact.style.display = 'flex';
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CHECKER — Redact All
  // ══════════════════════════════════════════════════════════════

  btnRedact.addEventListener('click', function () {
    if (isRedacting || !lastResult || lastResult.safe) return;
    startRedaction();
  });

  function startRedaction() {
    isRedacting = true;
    btnRedact.disabled = true;
    btnRedact.classList.add('btn-redacting');
    btnRedact.innerHTML = PAINTBRUSH_SVG + ' Redacting...';

    var text = lastText;
    var findings = lastResult.findings.slice().sort(function (a, b) { return b.start - a.start; });
    var step = 0;
    var delay = Math.max(80, Math.min(260, 1200 / findings.length));

    function redactStep() {
      if (step >= findings.length) {
        finishRedaction(text);
        return;
      }

      var f = findings[step];
      text = text.slice(0, f.start) + '[REDACTED_' + f.name.toUpperCase() + ']' + text.slice(f.end);

      checkTextarea.value = text;
      lastText = text;

      step++;
      setTimeout(redactStep, delay);
    }

    setTimeout(redactStep, 140);
  }

  function finishRedaction(text) {
    isRedacting = false;
    lastText = text;
    lastResult = Detector.scan(text);

    checkTextarea.value = text;

    // Update stats
    chrome.storage.local.get({ pps_total_redacted: 0 }, function (data) {
      var newTotal = (data.pps_total_redacted || 0) + totalFindings;
      chrome.storage.local.set({ pps_total_redacted: newTotal });
      statCount.textContent = newTotal.toLocaleString();
    });

    checkTextarea.className = 'is-safe';

    btnRedact.disabled = false;
    btnRedact.classList.remove('btn-redacting');
    btnRedact.className = 'btn-success';
    btnRedact.innerHTML = SHIELD_CHECK_SVG + ' ' +
      totalFindings + ' item' + (totalFindings !== 1 ? 's' : '') + ' redacted';

    checkSummary.innerHTML = buildSafeTag(totalFindings + ' item' + (totalFindings !== 1 ? 's' : '') + ' redacted');
    checkSummary.style.display = 'flex';
  }

  // ══════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════

  function renderSummaryTags(findings) {
    var counts = Detector.summarize(findings);
    var html = '';
    for (var cat in counts) {
      var sev = 1;
      var isCustom = false;
      for (var i = 0; i < findings.length; i++) {
        if (findings[i].category === cat) {
          sev = findings[i].severity;
          isCustom = !!findings[i].isCustom;
          break;
        }
      }
      var cls = isCustom ? 'stag-custom' : 'stag-' + sev;
      html += '<span class="stag ' + cls + '">' + esc(cat) + ' \u00d7' + counts[cat] + '</span>';
    }
    checkSummary.innerHTML = html;
  }

  function buildSafeTag(label) {
    return '<span class="stag stag-safe">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>' +
      '<path d="m9 12 2 2 4-4"/></svg>' +
      esc(label) + '</span>';
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════

  function init() {
    // Load theme + stats
    chrome.storage.local.get({ pps_total_redacted: 0 }, function (data) {
      statCount.textContent = (data.pps_total_redacted || 0).toLocaleString();
    });

    chrome.storage.local.get('pps_theme', function (data) {
      if (data.pps_theme) {
        applyTheme(data.pps_theme);
      } else {
        // First run — respect OS preference
        var osPrefers = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        applyTheme(osPrefers);
      }
    });

    // Load custom patterns
    chrome.storage.sync.get({ pps_custom_patterns: [] }, function (data) {
      customPatterns = data.pps_custom_patterns || [];
      renderPatterns();
      Detector.addCustomPatterns(customPatterns);
    });

    // Refresh stats when popup is focused (user may have redacted via content script)
    window.addEventListener('focus', refreshStats);
  }

  init();
})();
