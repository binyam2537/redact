// Prompt Privacy Shield — Content Script for ChatGPT
// Intercepts paste events, scans for PII, blocks send until reviewed

(function () {
  'use strict';

  var Detector = null; // Set after DOM ready
  var ICONS = null;

  // ── State ──
  var STATE_IDLE = 'IDLE';
  var STATE_SAFE = 'SAFE';
  var STATE_UNSAFE = 'UNSAFE';

  var state = STATE_IDLE;
  var lastFindings = [];
  var lastPastedText = '';

  // ── Selectors ──
  var TEXTAREA_SEL = '#prompt-textarea';
  var SEND_BTN_SEL = '[data-testid="send-button"], #composer-submit-button';

  // ── Initialization ──

  function init() {
    Detector = window.PromptPrivacyDetector;
    ICONS = Detector.ICONS;
    tryAttach();

    var observer = new MutationObserver(function () {
      tryAttach();
      // Reposition overlay if send button moved
      if (state === STATE_UNSAFE) {
        var overlay = document.getElementById('pps-send-overlay');
        if (overlay) positionOverlay(overlay);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function tryAttach() {
    var textarea = document.querySelector(TEXTAREA_SEL);
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
    blockSendButton();

    var result = Detector.scan(text);

    if (result.safe) {
      handleSafe();
    } else {
      handleUnsafe(text, result);
    }
  }

  // ── Input Handler ──

  function onInput() {
    if (state !== STATE_UNSAFE) return;
    var textarea = document.querySelector(TEXTAREA_SEL);
    if (textarea && textarea.textContent.trim() === '') {
      cleanup();
    }
  }

  // ── Safe Flow ──

  function handleSafe() {
    state = STATE_SAFE;
    var textarea = document.querySelector(TEXTAREA_SEL);
    if (textarea) {
      textarea.classList.remove('pps-unsafe');
      textarea.classList.add('pps-safe');
    }

    setTimeout(function () {
      unblockSendButton();
      setTimeout(function () {
        if (textarea) textarea.classList.remove('pps-safe');
        if (state === STATE_SAFE) state = STATE_IDLE;
      }, 1500);
    }, 300);
  }

  // ── Unsafe Flow ──

  function handleUnsafe(text, result) {
    state = STATE_UNSAFE;
    lastFindings = result.findings;
    lastPastedText = text;

    var textarea = document.querySelector(TEXTAREA_SEL);
    if (textarea) {
      textarea.classList.remove('pps-safe');
      textarea.classList.add('pps-unsafe');
    }

    showReviewButton();
  }

  // ── Send Button Blocking ──

  function blockSendButton() {
    var overlay = document.getElementById('pps-send-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pps-send-overlay';
      overlay.innerHTML = ICONS ? ICONS.lock : '';
      overlay.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var reviewBtn = document.getElementById('pps-review-btn');
        if (reviewBtn) {
          reviewBtn.style.transform = 'scale(1.15)';
          setTimeout(function () { reviewBtn.style.transform = ''; }, 200);
        }
      });
      document.body.appendChild(overlay);
    }

    positionOverlay(overlay);

    var textarea = document.querySelector(TEXTAREA_SEL);
    if (textarea && !textarea.__ppsKeyBlocked) {
      textarea.addEventListener('keydown', blockEnterKey, true);
      textarea.__ppsKeyBlocked = true;
    }
  }

  function positionOverlay(overlay) {
    var sendBtn = document.querySelector(SEND_BTN_SEL);
    if (!sendBtn) {
      overlay.style.display = 'none';
      return;
    }

    var rect = sendBtn.getBoundingClientRect();
    overlay.style.display = 'flex';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }

  function unblockSendButton() {
    var overlay = document.getElementById('pps-send-overlay');
    if (overlay) overlay.remove();

    var textarea = document.querySelector(TEXTAREA_SEL);
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

  // ── Floating Review Button ──

  function showReviewButton() {
    var existing = document.getElementById('pps-review-btn');
    if (existing) existing.remove();

    var btn = document.createElement('button');
    btn.id = 'pps-review-btn';
    btn.innerHTML = ICONS.shieldAlert + ' Review Sensitive Data';
    btn.addEventListener('click', function () {
      showModal();
    });

    document.body.appendChild(btn);
    positionReviewButton(btn);

    window.addEventListener('scroll', function () { positionReviewButton(btn); }, { passive: true });
    window.addEventListener('resize', function () { positionReviewButton(btn); });
  }

  function positionReviewButton(btn) {
    var textarea = document.querySelector(TEXTAREA_SEL);
    if (!textarea) return;

    var rect = textarea.getBoundingClientRect();
    btn.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    btn.style.right = (window.innerWidth - rect.right) + 'px';
  }

  function removeReviewButton() {
    var btn = document.getElementById('pps-review-btn');
    if (btn) btn.remove();
  }

  // ── Modal (editable + preview in one view) ──

  var modalMode = 'preview'; // 'preview' or 'edit'

  function showModal() {
    closeModal();
    modalMode = 'preview';

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

    var titleEl = document.createElement('h3');
    titleEl.innerHTML = ICONS.shieldAlert + ' <span>Sensitive Data Detected</span>';
    header.appendChild(titleEl);

    var headerRight = document.createElement('div');
    headerRight.className = 'pps-modal-header-right';

    // Toggle edit/preview button
    var toggleBtn = document.createElement('button');
    toggleBtn.id = 'pps-modal-toggle';
    toggleBtn.className = 'pps-btn-icon';
    toggleBtn.title = 'Edit text';
    toggleBtn.innerHTML = ICONS.eye;
    toggleBtn.addEventListener('click', function () {
      toggleModalMode();
    });
    headerRight.appendChild(toggleBtn);

    var closeBtn = document.createElement('button');
    closeBtn.id = 'pps-modal-close';
    closeBtn.className = 'pps-btn-icon';
    closeBtn.title = 'Close';
    closeBtn.innerHTML = ICONS.x;
    closeBtn.addEventListener('click', closeModal);
    headerRight.appendChild(closeBtn);

    header.appendChild(headerRight);

    // Body — contains both the preview and the editor (toggled)
    var body = document.createElement('div');
    body.id = 'pps-modal-body';

    // Preview pane
    var previewDiv = document.createElement('div');
    previewDiv.id = 'pps-modal-preview';
    previewDiv.innerHTML = Detector.highlightHTML(lastPastedText, lastFindings);

    // Editor pane (hidden initially)
    var editorArea = document.createElement('textarea');
    editorArea.id = 'pps-modal-editor';
    editorArea.value = lastPastedText;
    editorArea.style.display = 'none';

    body.appendChild(previewDiv);
    body.appendChild(editorArea);

    // Summary
    var summaryDiv = document.createElement('div');
    summaryDiv.id = 'pps-modal-summary';
    renderSummary(summaryDiv, lastFindings);

    body.appendChild(summaryDiv);

    // Actions
    var actions = document.createElement('div');
    actions.id = 'pps-modal-actions';

    var redactBtn = document.createElement('button');
    redactBtn.className = 'pps-btn pps-btn-primary';
    redactBtn.innerHTML = ICONS.eraser + ' Redact All';
    redactBtn.addEventListener('click', function () {
      applyRedaction();
    });

    var sendAnywayBtn = document.createElement('button');
    sendAnywayBtn.className = 'pps-btn pps-btn-danger';
    sendAnywayBtn.innerHTML = ICONS.send + ' Send Anyway';
    sendAnywayBtn.addEventListener('click', function () {
      cleanup();
    });

    actions.appendChild(redactBtn);
    actions.appendChild(sendAnywayBtn);

    // Assemble
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    document.addEventListener('keydown', onModalEscape);
  }

  function toggleModalMode() {
    var preview = document.getElementById('pps-modal-preview');
    var editor = document.getElementById('pps-modal-editor');
    var toggleBtn = document.getElementById('pps-modal-toggle');
    if (!preview || !editor || !toggleBtn) return;

    if (modalMode === 'preview') {
      // Switch to edit mode
      modalMode = 'edit';
      editor.value = lastPastedText;
      preview.style.display = 'none';
      editor.style.display = 'block';
      editor.focus();
      toggleBtn.innerHTML = ICONS.eye;
      toggleBtn.title = 'Preview';
    } else {
      // Switch to preview — re-scan the edited text
      modalMode = 'preview';
      lastPastedText = editor.value;
      var result = Detector.scan(lastPastedText);
      lastFindings = result.findings;

      preview.innerHTML = Detector.highlightHTML(lastPastedText, lastFindings);
      editor.style.display = 'none';
      preview.style.display = 'block';
      toggleBtn.innerHTML = ICONS.eye;
      toggleBtn.title = 'Edit text';

      // Update summary
      var summaryDiv = document.getElementById('pps-modal-summary');
      if (summaryDiv) renderSummary(summaryDiv, lastFindings);

      // If clean now, allow sending
      if (result.safe) {
        cleanup();
        updateChatGPTTextarea(lastPastedText);
      }
    }
  }

  function applyRedaction() {
    // If in edit mode, grab latest text first
    var editor = document.getElementById('pps-modal-editor');
    if (modalMode === 'edit' && editor) {
      lastPastedText = editor.value;
      var result = Detector.scan(lastPastedText);
      lastFindings = result.findings;
    }

    if (lastFindings.length === 0) return;

    var redacted = Detector.redact(lastPastedText, lastFindings);
    lastPastedText = redacted;

    // Re-scan to confirm clean
    var newResult = Detector.scan(redacted);
    lastFindings = newResult.findings;

    // Update both panes
    var preview = document.getElementById('pps-modal-preview');
    if (preview) {
      preview.innerHTML = newResult.safe
        ? Detector.escapeHTML(redacted)
        : Detector.highlightHTML(redacted, newResult.findings);
    }
    if (editor) editor.value = redacted;

    var summaryDiv = document.getElementById('pps-modal-summary');
    if (summaryDiv) renderSummary(summaryDiv, newResult.findings);

    // Switch to preview mode to show result
    if (modalMode === 'edit') {
      modalMode = 'preview';
      if (preview) preview.style.display = 'block';
      if (editor) editor.style.display = 'none';
    }

    if (newResult.safe) {
      // Push redacted text into ChatGPT textarea and unblock
      updateChatGPTTextarea(redacted);
      setTimeout(function () { cleanup(); }, 600);
    }
  }

  function updateChatGPTTextarea(text) {
    var textarea = document.querySelector(TEXTAREA_SEL);
    if (!textarea) return;

    // Clear and set new content — trigger React's input handling
    textarea.focus();
    textarea.textContent = text;

    // Dispatch input event so React picks up the change
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderSummary(container, findings) {
    var counts = Detector.summarize(findings);
    var html = '';

    if (findings.length === 0) {
      html = '<span class="pps-safe-text">' + ICONS.shieldCheck + ' No sensitive data detected</span>';
    } else {
      html = 'Found: ';
      for (var cat in counts) {
        var sev = 1;
        for (var i = 0; i < findings.length; i++) {
          if (findings[i].category === cat) { sev = findings[i].severity; break; }
        }
        html += '<span class="pps-modal-tag sev-' + sev + '">' +
          Detector.escapeHTML(cat) + ' &times;' + counts[cat] + '</span>';
      }
    }
    container.innerHTML = html;
  }

  function closeModal() {
    var backdrop = document.getElementById('pps-modal-backdrop');
    if (backdrop) backdrop.remove();
    document.removeEventListener('keydown', onModalEscape);
  }

  function onModalEscape(e) {
    if (e.key === 'Escape') closeModal();
  }

  // ── Full Cleanup ──

  function cleanup() {
    closeModal();
    unblockSendButton();
    removeReviewButton();

    var textarea = document.querySelector(TEXTAREA_SEL);
    if (textarea) {
      textarea.classList.remove('pps-safe', 'pps-unsafe');
    }

    state = STATE_IDLE;
    lastFindings = [];
    lastPastedText = '';
  }

  // ── Start ──

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
