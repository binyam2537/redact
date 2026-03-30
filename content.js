// Prompt Privacy Shield — Content Script
// Two-stage detection: fast REGEX scan → optional deep-scan modal with teleprompter

(function () {
  'use strict';

  var Detector = null;
  var ICONS = null;

  // ── State ──
  var STATE_IDLE = 'IDLE';
  var STATE_SAFE = 'SAFE';     // regex clean — scan icon shown
  var STATE_UNSAFE = 'UNSAFE';   // regex found PII — review btn + send blocked
  var STATE_REVIEWING = 'REVIEWING'; // modal open

  var state = STATE_IDLE;
  var lastFindings = [];
  var lastPastedText = '';
  var isRedacting = false;
  var totalFindings = 0;

  // ── Selectors (ChatGPT, Gemini, Claude) ──

  var TEXTAREA_SELS = [
    '#prompt-textarea',
    'div[contenteditable="true"].ql-editor',
    'div[contenteditable="true"].ProseMirror',
    'div[contenteditable="true"][role="textbox"]',
    'rich-textarea div[contenteditable]'
  ];

  var SEND_BTN_SEL = [
    '[data-testid="send-button"]',
    '#composer-submit-button',
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button[data-testid="fruitjuice-send-button"]'
  ].join(', ');

  // ── Teleprompter stages ──

  var TP_STAGES = [
    { label: 'Scanning API keys & tokens...', duration: 350 },
    { label: 'Checking cloud credentials...', duration: 320 },
    { label: 'Inspecting database URIs & JWTs...', duration: 300 },
    { label: 'Looking for personal identifiers...', duration: 350 },
    { label: 'Detecting financial data...', duration: 280 },
    { label: 'Checking network & infrastructure...', duration: 250 },
    { label: 'Applying custom watch patterns...', duration: 250 },
    { label: 'Compiling results...', duration: 200 }
  ];

  // ── Helpers ──

  function findTextarea() {
    for (var i = 0; i < TEXTAREA_SELS.length; i++) {
      var el = document.querySelector(TEXTAREA_SELS[i]);
      if (el) return el;
    }
    return null;
  }

  function updateFloatingElements() {
    var reviewBtn = document.getElementById('pps-review-btn');
    var scanIcon = document.getElementById('pps-scan-icon');
    var overlay = document.getElementById('pps-send-overlay');
    if (reviewBtn) positionReviewButton(reviewBtn);
    if (scanIcon) positionScanIcon(scanIcon);
    if (overlay) positionOverlay(overlay);
  }

  // ── Init ──

  function init() {
    Detector = window.PromptPrivacyDetector;
    ICONS = Detector.ICONS;

    // Load custom patterns
    chrome.storage.sync.get({ pps_custom_patterns: [] }, function (data) {
      Detector.addCustomPatterns(data.pps_custom_patterns || []);
    });

    // Live-reload patterns when popup changes them
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'sync' && changes.pps_custom_patterns) {
        Detector.addCustomPatterns(changes.pps_custom_patterns.newValue || []);
      }
    });

    tryAttach();

    var observer = new MutationObserver(function () {
      tryAttach();
      updateFloatingElements();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('scroll', updateFloatingElements, { passive: true });
    window.addEventListener('resize', updateFloatingElements);
  }

  function tryAttach() {
    var textarea = findTextarea();
    if (textarea && !textarea.__ppsAttached) {
      textarea.addEventListener('paste', onPaste, true);
      textarea.addEventListener('input', onInput);
      textarea.__ppsAttached = true;
    }
  }

  // ── Paste Handler ──

  function onPaste(e) {
    var text = '';
    if (e.clipboardData) {
      text = e.clipboardData.getData('text/plain');
    }
    if (!text || text.length < 5) return;

    closeModal();
    removeScanIcon();

    var result = Detector.scan(text);
    lastPastedText = text;

    if (result.safe) {
      handleSafe(text);
    } else {
      handleUnsafe(text, result);
    }
  }

  function onInput() {
    if (state !== STATE_UNSAFE) return;
    var textarea = findTextarea();
    if (!textarea) return;
    var content = (textarea.tagName === 'TEXTAREA')
      ? textarea.value
      : (textarea.textContent || '');
    if (content.trim() === '') cleanup();
  }

  // ── Safe Flow ──

  function handleSafe(text) {
    state = STATE_SAFE;

    var textarea = findTextarea();
    if (textarea) {
      textarea.classList.remove('pps-unsafe');
      textarea.classList.add('pps-safe');
      setTimeout(function () {
        if (textarea) textarea.classList.remove('pps-safe');
      }, 1400);
    }

    unblockSendButton();
    showScanIcon(text);
  }

  // ── Unsafe Flow ──

  function handleUnsafe(text, result) {
    state = STATE_UNSAFE;
    lastFindings = result.findings;
    totalFindings = result.findings.length;

    var textarea = findTextarea();
    if (textarea) {
      textarea.classList.remove('pps-safe');
      textarea.classList.add('pps-unsafe');
    }

    blockSendButton();
    showReviewButton(text);
  }

  // ── Scan Icon (safe flow) ──

  function showScanIcon(text) {
    var existing = document.getElementById('pps-scan-icon');
    if (existing) existing.remove();

    var icon = document.createElement('button');
    icon.id = 'pps-scan-icon';
    icon.title = 'Deep scan to check for hidden sensitive data';
    icon.innerHTML = ICONS.shieldCheck;
    icon.addEventListener('click', function () {
      removeScanIcon();
      openDeepScanModal(text);
    });

    document.body.appendChild(icon);
    positionScanIcon(icon);

    // Auto-fade after 10s
    var fadeTimer = setTimeout(function () {
      var el = document.getElementById('pps-scan-icon');
      if (el) {
        el.style.opacity = '0';
        setTimeout(function () { if (el.parentNode) el.remove(); }, 300);
      }
    }, 10000);

    icon._fadeTimer = fadeTimer;
  }

  function positionScanIcon(icon) {
    var textarea = findTextarea();
    if (!textarea) return;
    var rect = textarea.getBoundingClientRect();
    icon.style.top = Math.max(4, rect.top - 46) + 'px';
    icon.style.right = Math.max(2, window.innerWidth - rect.right + 5) + 'px';
    icon.style.left = '';
    icon.style.bottom = '';
  }

  function removeScanIcon() {
    var icon = document.getElementById('pps-scan-icon');
    if (icon) {
      if (icon._fadeTimer) clearTimeout(icon._fadeTimer);
      icon.remove();
    }
  }

  // ── Review Button (unsafe flow) ──

  function showReviewButton(text) {
    var existing = document.getElementById('pps-review-btn');
    if (existing) existing.remove();

    var btn = document.createElement('button');
    btn.id = 'pps-review-btn';
    btn.innerHTML = ICONS.shieldAlert + ' <span>Review Sensitive Data</span>';
    btn.addEventListener('click', function () {
      openReviewModal(text, lastFindings);
    });

    document.body.appendChild(btn);
    positionReviewButton(btn);
  }

  function positionReviewButton(btn) {
    var textarea = findTextarea();
    if (!textarea) { btn.style.display = 'none'; return; }
    var rect = textarea.getBoundingClientRect();
    btn.style.display = 'flex';
    btn.style.top = Math.max(4, rect.top - 50) + 'px';
    btn.style.right = Math.max(4, window.innerWidth - rect.right) + 'px';
    btn.style.left = '';
    btn.style.bottom = '';
  }

  function removeReviewButton() {
    var btn = document.getElementById('pps-review-btn');
    if (btn) btn.remove();
  }

  // ── Send Button Blocking ──

  function blockSendButton() {
    var overlay = document.getElementById('pps-send-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pps-send-overlay';
      overlay.innerHTML = ICONS.lock;
      overlay.title = 'Sensitive data detected — review before sending';
      overlay.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var reviewBtn = document.getElementById('pps-review-btn');
        if (reviewBtn) {
          reviewBtn.style.transform = 'scale(1.1)';
          setTimeout(function () { reviewBtn.style.transform = ''; }, 200);
        }
      });
      document.body.appendChild(overlay);
    }
    positionOverlay(overlay);

    var textarea = findTextarea();
    if (textarea && !textarea.__ppsKeyBlocked) {
      textarea.addEventListener('keydown', blockEnterKey, true);
      textarea.__ppsKeyBlocked = true;
    }
  }

  function positionOverlay(overlay) {
    var sendBtn = document.querySelector(SEND_BTN_SEL);
    if (!sendBtn) { overlay.style.display = 'none'; return; }
    var rect = sendBtn.getBoundingClientRect();
    overlay.style.display = 'flex';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.right = '';
    overlay.style.bottom = '';
  }

  function unblockSendButton() {
    var overlay = document.getElementById('pps-send-overlay');
    if (overlay) overlay.remove();

    var textarea = findTextarea();
    if (textarea && textarea.__ppsKeyBlocked) {
      textarea.removeEventListener('keydown', blockEnterKey, true);
      textarea.__ppsKeyBlocked = false;
    }
  }

  function blockEnterKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && state === STATE_UNSAFE) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ── Build Modal Shell ──

  function buildModal(titleText, titleClass) {
    var backdrop = document.createElement('div');
    backdrop.id = 'pps-modal-backdrop';
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeModal();
    });

    var modal = document.createElement('div');
    modal.id = 'pps-modal';

    // Header
    var header = document.createElement('div');
    header.id = 'pps-modal-header';

    var titleEl = document.createElement('div');
    titleEl.id = 'pps-modal-title';
    titleEl.className = 'pps-modal-title ' + (titleClass || 'pps-title-info');
    titleEl.innerHTML = (titleClass === 'pps-title-danger' ? ICONS.shieldAlert : ICONS.search) +
      ' <span id="pps-modal-title-text">' + titleText + '</span>';

    var closeBtn = document.createElement('button');
    closeBtn.id = 'pps-modal-close';
    closeBtn.className = 'pps-btn-icon';
    closeBtn.title = 'Close';
    closeBtn.innerHTML = ICONS.x;
    closeBtn.addEventListener('click', closeModal);

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    var body = document.createElement('div');
    body.id = 'pps-modal-body';

    var actions = document.createElement('div');
    actions.id = 'pps-modal-actions';

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(actions);
    backdrop.appendChild(modal);

    return { backdrop: backdrop, modal: modal, body: body, actions: actions };
  }

  // ── Modal: Deep Scan (safe path → teleprompter) ──

  function openDeepScanModal(text) {
    closeModal();
    state = STATE_REVIEWING;

    var m = buildModal('Deep Privacy Scan', 'pps-title-info');
    document.body.appendChild(m.backdrop);
    document.addEventListener('keydown', onModalEscape);

    // ── Teleprompter UI ──
    var tpWrap = document.createElement('div');
    tpWrap.id = 'pps-tp-wrap';

    var progressBar = document.createElement('div');
    progressBar.id = 'pps-tp-progress';
    var progressFill = document.createElement('div');
    progressFill.id = 'pps-tp-progress-fill';
    progressBar.appendChild(progressFill);

    var stageList = document.createElement('div');
    stageList.id = 'pps-tp-stages';

    TP_STAGES.forEach(function (s, i) {
      var row = document.createElement('div');
      row.className = 'pps-tp-row';
      row.id = 'pps-tp-row-' + i;
      row.innerHTML = '<span class="pps-tp-dot"></span><span class="pps-tp-label">' + s.label + '</span>';
      stageList.appendChild(row);
    });

    tpWrap.appendChild(progressBar);
    tpWrap.appendChild(stageList);
    m.body.appendChild(tpWrap);

    // ── Run teleprompter, then scan ──
    runTeleprompter(progressFill, function () {
      var result = Detector.scan(text);

      // Swap teleprompter for results
      m.body.removeChild(tpWrap);

      var titleTextEl = document.getElementById('pps-modal-title-text');
      var titleEl = document.getElementById('pps-modal-title');

      if (result.safe) {
        // All clear
        if (titleTextEl) titleTextEl.textContent = 'All Clear';
        if (titleEl) titleEl.className = 'pps-modal-title pps-title-safe';

        var cleanDiv = document.createElement('div');
        cleanDiv.id = 'pps-clean-result';
        cleanDiv.innerHTML =
          '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>' +
          '<path d="m9 12 2 2 4-4"/></svg>' +
          '<span>No sensitive data detected</span>';
        m.body.appendChild(cleanDiv);

        var doneBtn = document.createElement('button');
        doneBtn.className = 'pps-btn pps-btn-primary';
        doneBtn.innerHTML = ICONS.shieldCheck + ' All Clear';
        doneBtn.addEventListener('click', function () { closeModal(); state = STATE_IDLE; });
        m.actions.appendChild(doneBtn);
        m.actions.style.display = 'flex';

      } else {
        // Found something
        if (titleTextEl) titleTextEl.textContent = 'Sensitive Data Found';
        if (titleEl) titleEl.className = 'pps-modal-title pps-title-danger';

        lastFindings = result.findings;
        totalFindings = result.findings.length;
        state = STATE_UNSAFE;
        blockSendButton();

        showFindingsUI(m.body, m.actions, text, result.findings);
        m.actions.style.display = 'flex';
      }
    });
  }

  function runTeleprompter(progressFill, onComplete) {
    var idx = 0;
    var total = TP_STAGES.length;

    function next() {
      if (idx >= total) {
        var lastRow = document.getElementById('pps-tp-row-' + (total - 1));
        if (lastRow) lastRow.className = 'pps-tp-row pps-tp-done';
        setTimeout(onComplete, 280);
        return;
      }

      // Mark previous done
      if (idx > 0) {
        var prevRow = document.getElementById('pps-tp-row-' + (idx - 1));
        if (prevRow) prevRow.className = 'pps-tp-row pps-tp-done';
      }

      // Activate current
      var currRow = document.getElementById('pps-tp-row-' + idx);
      if (currRow) currRow.className = 'pps-tp-row pps-tp-active';

      // Progress bar
      if (progressFill) progressFill.style.width = ((idx + 1) / total * 100) + '%';

      var duration = TP_STAGES[idx].duration;
      idx++;
      setTimeout(next, duration);
    }

    next();
  }

  // ── Modal: Review (unsafe path — immediate findings) ──

  function openReviewModal(text, findings) {
    closeModal();
    state = STATE_REVIEWING;

    var m = buildModal('Sensitive Data Found', 'pps-title-danger');
    document.body.appendChild(m.backdrop);
    document.addEventListener('keydown', onModalEscape);

    showFindingsUI(m.body, m.actions, text, findings);
    m.actions.style.display = 'flex';
  }

  // ── Findings UI (shared between review modal and deep-scan modal) ──

  function showFindingsUI(body, actions, text, findings) {
    // Preview with highlighted text
    var preview = document.createElement('div');
    preview.id = 'pps-modal-preview';
    preview.innerHTML = Detector.highlightHTML(text, findings);
    body.appendChild(preview);

    // Summary
    var summary = document.createElement('div');
    summary.id = 'pps-modal-summary';
    renderModalSummary(summary, findings);
    body.appendChild(summary);

    // Redact All button
    var redactBtn = document.createElement('button');
    redactBtn.id = 'pps-modal-redact-btn';
    redactBtn.className = 'pps-btn pps-btn-primary';
    redactBtn.innerHTML = ICONS.paintbrush + ' Redact All';
    redactBtn.addEventListener('click', function () {
      startModalRedaction(text, findings, preview, summary, redactBtn, actions);
    });

    // Send Anyway button
    var sendBtn = document.createElement('button');
    sendBtn.id = 'pps-modal-send-btn';
    sendBtn.className = 'pps-btn pps-btn-ghost-danger';
    sendBtn.innerHTML = ICONS.send + ' Send Anyway';
    sendBtn.addEventListener('click', function () {
      updateChatTextarea(text);
      cleanup();
    });

    actions.innerHTML = '';
    actions.appendChild(redactBtn);
    actions.appendChild(sendBtn);
  }

  function renderModalSummary(container, findings) {
    var counts = Detector.summarize(findings);
    var html = '';

    if (findings.length === 0) {
      html = '<span class="pps-safe-text">' + ICONS.shieldCheck +
        ' ' + totalFindings + ' item' + (totalFindings !== 1 ? 's' : '') + ' redacted</span>';
    } else {
      html = '<span class="pps-summary-label">Found:</span>';
      for (var cat in counts) {
        var sev = 1;
        for (var i = 0; i < findings.length; i++) {
          if (findings[i].category === cat) { sev = findings[i].severity; break; }
        }
        var sevClass = findings.some(function (f) { return f.category === cat && f.isCustom; })
          ? 'pps-sev-custom' : 'pps-sev-' + sev;
        html += '<span class="pps-modal-tag ' + sevClass + '">' +
          Detector.escapeHTML(cat) + ' \u00d7' + counts[cat] + '</span>';
      }
    }
    container.innerHTML = html;
  }

  // ── Animated Redaction in Modal ──

  function startModalRedaction(text, findings, preview, summary, redactBtn, actions) {
    if (isRedacting) return;
    isRedacting = true;

    redactBtn.disabled = true;
    redactBtn.classList.add('pps-redacting');
    redactBtn.innerHTML = ICONS.paintbrush + ' Redacting...';

    // Remove "Send Anyway"
    var sendBtn = document.getElementById('pps-modal-send-btn');
    if (sendBtn) sendBtn.remove();

    var sorted = findings.slice().sort(function (a, b) { return b.start - a.start; });
    var step = 0;
    var delay = Math.max(80, Math.min(260, 1200 / sorted.length));

    function redactStep() {
      if (step >= sorted.length) {
        finishModalRedaction(text, preview, summary, redactBtn, actions);
        return;
      }

      var f = sorted[step];
      var label = '[REDACTED_' + f.name.toUpperCase() + ']';
      text = text.slice(0, f.start) + label + text.slice(f.end);

      var tempResult = Detector.scan(text);
      var html;
      if (tempResult.findings.length > 0) {
        html = Detector.highlightHTML(text, tempResult.findings);
        html = html.replace(
          /(\[REDACTED_[A-Z_]+\])(?!<\/mark>)/g,
          '<mark class="pps-highlight pps-redacted pps-redacted-fresh">$1</mark>'
        );
      } else {
        html = Detector.highlightRedactedHTML(text);
      }
      preview.innerHTML = html;
      renderModalSummary(summary, tempResult.findings);

      step++;
      setTimeout(redactStep, delay);
    }

    setTimeout(redactStep, 180);
  }

  function finishModalRedaction(text, preview, summary, redactBtn, actions) {
    isRedacting = false;
    lastPastedText = text;

    var result = Detector.scan(text);
    lastFindings = result.findings;

    preview.innerHTML = Detector.highlightRedactedHTML(text);
    renderModalSummary(summary, result.findings);

    redactBtn.classList.remove('pps-redacting');
    redactBtn.className = 'pps-btn pps-btn-success';
    redactBtn.disabled = true;
    redactBtn.innerHTML = ICONS.shieldCheck + ' ' +
      totalFindings + ' item' + (totalFindings !== 1 ? 's' : '') + ' redacted';

    // Add Done button
    var doneBtn = document.createElement('button');
    doneBtn.className = 'pps-btn pps-btn-primary';
    doneBtn.innerHTML = ICONS.shieldCheck + ' Done! Paste Redacted';
    doneBtn.addEventListener('click', function () {
      updateChatTextarea(text);
      incrementStats(totalFindings);
      cleanup();
    });
    actions.appendChild(doneBtn);

    // Update textarea and unblock send
    updateChatTextarea(text);
    unblockSendButton();
    removeReviewButton();

    var ta = findTextarea();
    if (ta) {
      ta.classList.remove('pps-unsafe');
      ta.classList.add('pps-safe');
      setTimeout(function () { ta.classList.remove('pps-safe'); }, 2000);
    }

    state = STATE_IDLE;

    // Update modal header
    var titleEl = document.getElementById('pps-modal-title');
    var titleText = document.getElementById('pps-modal-title-text');
    if (titleEl) titleEl.className = 'pps-modal-title pps-title-safe';
    if (titleText) titleText.textContent = 'Redacted — Ready to Send';
  }

  // ── Update chat textarea ──

  function updateChatTextarea(text) {
    var textarea = findTextarea();
    if (!textarea) return;
    textarea.focus();
    if (textarea.tagName === 'TEXTAREA') {
      textarea.value = text;
    } else {
      // contenteditable
      textarea.textContent = text;
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  }

  // ── Stats ──

  function incrementStats(count) {
    if (!count) return;
    try {
      chrome.storage.local.get({ pps_total_redacted: 0 }, function (data) {
        chrome.storage.local.set({ pps_total_redacted: (data.pps_total_redacted || 0) + count });
      });
    } catch (e) { /* storage not available in this context */ }
  }

  // ── Modal lifecycle ──

  function closeModal() {
    var backdrop = document.getElementById('pps-modal-backdrop');
    if (backdrop) backdrop.remove();
    document.removeEventListener('keydown', onModalEscape);
    isRedacting = false;
  }

  function onModalEscape(e) {
    if (e.key === 'Escape') closeModal();
  }

  function cleanup() {
    closeModal();
    unblockSendButton();
    removeReviewButton();
    removeScanIcon();

    var textarea = findTextarea();
    if (textarea) textarea.classList.remove('pps-safe', 'pps-unsafe');

    state = STATE_IDLE;
    lastFindings = [];
    lastPastedText = '';
    isRedacting = false;
    totalFindings = 0;
  }

  // ── Bootstrap ──

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
