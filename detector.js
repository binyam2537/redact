// Prompt Privacy Shield — PII Detection Engine
// Shared between content script and popup via window.PromptPrivacyDetector

(function () {
  'use strict';

  // ── Lucide SVG icon paths (inline, no external deps) ──

  var ICONS = {
    alertTriangle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>',
    shieldCheck: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
    shieldAlert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    eraser: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>',
    send: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>',
    sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
    moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>'
  };

  // ── Pattern definitions ──
  // Ordered: most specific first to win during deduplication

  var patterns = [
    // ─── Cryptographic Keys (PEM) ───
    {
      name: 'private_key',
      category: 'Private Key (PEM)',
      severity: 3,
      regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g,
      validate: null
    },

    // ─── Database & Auth URIs ───
    {
      name: 'mongodb_uri',
      category: 'MongoDB URI',
      severity: 3,
      regex: /mongodb(?:\+srv)?:\/\/[^\s"'`<>]+/gi,
      validate: function (m) {
        // Only flag if it contains credentials (user:pass@)
        return /@/.test(m[0]);
      }
    },
    {
      name: 'database_uri',
      category: 'Database URI',
      severity: 3,
      regex: /(?:postgres(?:ql)?|mysql|mariadb|redis|rediss|amqp|amqps|mssql):\/\/[^\s"'`<>]+/gi,
      validate: function (m) {
        return /@/.test(m[0]);
      }
    },
    {
      name: 'jwt_token',
      category: 'JWT Token',
      severity: 3,
      regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
      validate: null
    },

    // ─── Cloud Provider Secrets ───
    {
      name: 'aws_access_key',
      category: 'AWS Access Key',
      severity: 3,
      regex: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
      validate: null
    },
    {
      name: 'aws_secret_key',
      category: 'AWS Secret Key',
      severity: 3,
      regex: /(?:aws[_-]?secret[_-]?(?:access[_-]?)?key|secret[_-]?access[_-]?key)[\s]*[:=][\s]*["']?([A-Za-z0-9\/+=]{40})["']?/gi,
      validate: null
    },
    {
      name: 'gcp_api_key',
      category: 'GCP API Key',
      severity: 3,
      regex: /\bAIzaSy[A-Za-z0-9_-]{33}\b/g,
      validate: null
    },
    {
      name: 'azure_storage_key',
      category: 'Azure Storage Key',
      severity: 3,
      regex: /(?:AccountKey|azure[_-]?storage[_-]?key|AZURE[_-]?STORAGE[_-]?KEY)[\s]*[:=][\s]*["']?([A-Za-z0-9\/+=]{44,88})["']?/gi,
      validate: null
    },

    // ─── SaaS & Third-Party API Keys ───
    {
      name: 'stripe_secret',
      category: 'Stripe Secret Key',
      severity: 3,
      regex: /\b[sr]k_live_[A-Za-z0-9]{20,}\b/g,
      validate: null
    },
    {
      name: 'stripe_restricted',
      category: 'Stripe Restricted Key',
      severity: 3,
      regex: /\brk_live_[A-Za-z0-9]{20,}\b/g,
      validate: null
    },
    {
      name: 'stripe_webhook',
      category: 'Stripe Webhook Secret',
      severity: 3,
      regex: /\bwhsec_[A-Za-z0-9]{20,}\b/g,
      validate: null
    },
    {
      name: 'slack_webhook',
      category: 'Slack Webhook URL',
      severity: 3,
      regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g,
      validate: null
    },
    {
      name: 'slack_token',
      category: 'Slack Token',
      severity: 3,
      regex: /\bxox[bpaosr]-[A-Za-z0-9-]{10,}/g,
      validate: null
    },
    {
      name: 'sendgrid_key',
      category: 'SendGrid API Key',
      severity: 3,
      regex: /\bSG\.[A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{22,}\b/g,
      validate: null
    },
    {
      name: 'twilio_sid',
      category: 'Twilio Account SID',
      severity: 3,
      regex: /\bAC[a-f0-9]{32}\b/g,
      validate: null
    },
    {
      name: 'twilio_api_key',
      category: 'Twilio API Key',
      severity: 3,
      regex: /\bSK[a-f0-9]{32}\b/g,
      validate: null
    },
    {
      name: 'github_pat',
      category: 'GitHub Personal Access Token',
      severity: 3,
      regex: /\b(?:ghp_[A-Za-z0-9_]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g,
      validate: null
    },
    {
      name: 'github_oauth',
      category: 'GitHub OAuth Token',
      severity: 3,
      regex: /\bgho_[A-Za-z0-9_]{36,255}\b/g,
      validate: null
    },
    {
      name: 'github_app_token',
      category: 'GitHub App Token',
      severity: 3,
      regex: /\b(?:ghs_|ghr_)[A-Za-z0-9_]{36,255}\b/g,
      validate: null
    },
    {
      name: 'gitlab_pat',
      category: 'GitLab Personal Access Token',
      severity: 3,
      regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
      validate: null
    },
    {
      name: 'npm_token',
      category: 'NPM Access Token',
      severity: 3,
      regex: /\bnpm_[A-Za-z0-9]{36}\b/g,
      validate: null
    },

    // ─── Generic Secret (contextual key=value) ───
    {
      name: 'generic_secret',
      category: 'API Key / Secret',
      severity: 2,
      regex: /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key|client[_-]?secret|token|password|passwd|authorization)[\s]*[:=][\s]*["']?([A-Za-z0-9_\-\.\/+=]{20,})["']?/gi,
      validate: function (m) {
        var value = m[1] || m[0];
        // Reject common placeholder values
        if (/^(your|my|the|test|example|placeholder|changeme|xxx)/i.test(value)) return false;
        return entropy(value) > 3.5;
      }
    },

    // ─── Standard PII ───
    {
      name: 'ssn',
      category: 'Social Security Number',
      severity: 3,
      regex: /\b(\d{3})-(\d{2})-(\d{4})\b/g,
      validate: function (m) {
        var full = m[0];
        // Reject if preceded by a date-like context or version-like context
        var area = m[1];
        var group = m[2];
        var serial = m[3];
        // IRS rules
        if (area === '000' || area === '666') return false;
        if (parseInt(area, 10) >= 900) return false;
        if (group === '00') return false;
        if (serial === '0000') return false;
        // Reject if it looks like a date (area is a year like 201, 202, etc)
        if (/^(?:19|20)\d$/.test(area)) return false;
        return true;
      }
    },
    {
      name: 'credit_card',
      category: 'Credit Card Number',
      severity: 3,
      regex: /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,4}\b/g,
      validate: function (m) {
        var digits = m[0].replace(/[\s-]/g, '');
        if (!/^\d{13,19}$/.test(digits)) return false;
        if (/^(\d)\1+$/.test(digits)) return false;
        return testLuhn(digits);
      }
    },
    {
      name: 'email',
      category: 'Email Address',
      severity: 2,
      regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
      validate: function (m) {
        var email = m[0];
        // Reject common non-PII domains
        if (/@(example|test|localhost|invalid)\./i.test(email)) return false;
        return true;
      }
    },
    {
      name: 'phone',
      category: 'Phone Number',
      severity: 2,
      // Strict: requires country code, parentheses, or explicit phone-like separators
      regex: /(?:(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)[-.\s]?\d{3}[-.\s]\d{4}|\+\d{1,3}[-.\s]\d{3}[-.\s]\d{3}[-.\s]\d{4})\b/g,
      validate: function (m) {
        var raw = m[0];
        var digits = raw.replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 15) return false;
        if (/^(\d)\1+$/.test(digits)) return false;
        // Reject ISO 8601 timestamps — if preceded by T or followed by Z/+/- in a timestamp-like pattern
        // This is checked in context during scan
        return true;
      },
      contextReject: function (text, matchIndex, matchStr) {
        // Reject if this looks like part of a timestamp or UUID
        var before = text.slice(Math.max(0, matchIndex - 5), matchIndex);
        var after = text.slice(matchIndex + matchStr.length, matchIndex + matchStr.length + 5);
        // Timestamp patterns: ...T12:34:56... or ...2024-01-15...
        if (/[T:]$/.test(before.trim())) return true;
        if (/^[Z:T+]/.test(after.trim())) return true;
        // UUID-like: hex blocks separated by dashes
        var surrounding = text.slice(Math.max(0, matchIndex - 20), matchIndex + matchStr.length + 20);
        if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(surrounding)) return true;
        return false;
      }
    },

    // ─── Network & Infrastructure ───
    {
      name: 'ipv4',
      category: 'IPv4 Address',
      severity: 1,
      regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?::\d{1,5})?\b/g,
      validate: function (m) {
        var raw = m[0];
        var ip = raw.split(':')[0];
        // Exclude loopback, broadcast, and documentation ranges
        if (ip === '127.0.0.1' || ip === '0.0.0.0' || ip === '255.255.255.255') return false;
        // Exclude version-like patterns (e.g. 1.2.3.4 where it looks like semver)
        if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
          var parts = ip.split('.');
          // If all octets are small and it could be a version number, skip
          if (parts.every(function (p) { return parseInt(p, 10) < 20; })) return false;
        }
        return true;
      }
    },
    {
      name: 'ipv6',
      category: 'IPv6 Address',
      severity: 1,
      regex: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:\b|\b(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\b|\b::(?:[fF]{4}:)?(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b|\b(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}\b/g,
      validate: function (m) {
        var addr = m[0].toLowerCase();
        // Exclude loopback
        if (addr === '::1' || addr === '0000:0000:0000:0000:0000:0000:0000:0001') return false;
        return true;
      }
    },
    {
      name: 'internal_domain',
      category: 'Internal Domain',
      severity: 1,
      regex: /\b[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:internal|local|corp|intranet|private|lan)\b/gi,
      validate: null
    },
    {
      name: 'street_address',
      category: 'Street Address',
      severity: 1,
      regex: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Dr(?:ive)?|Ln|Lane|Rd|Road|Ct|Court|Pl(?:ace)?|Way|Cir(?:cle)?|Ter(?:race)?|Pkwy|Parkway)\b/gi,
      validate: null
    }
  ];

  // ── Luhn algorithm for credit card validation ──

  function testLuhn(digits) {
    var sum = 0;
    var alternate = false;
    for (var i = digits.length - 1; i >= 0; i--) {
      var n = parseInt(digits[i], 10);
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 === 0;
  }

  // ── Shannon entropy calculation ──

  function entropy(str) {
    if (!str || str.length === 0) return 0;
    var freq = {};
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      freq[c] = (freq[c] || 0) + 1;
    }
    var len = str.length;
    var ent = 0;
    for (var ch in freq) {
      var p = freq[ch] / len;
      ent -= p * Math.log2(p);
    }
    return ent;
  }

  // ── Deduplicate overlapping findings — keep higher severity ──

  function deduplicate(findings) {
    if (findings.length <= 1) return findings;

    findings.sort(function (a, b) {
      return a.start - b.start || (b.end - b.start) - (a.end - a.start);
    });

    var result = [findings[0]];
    for (var i = 1; i < findings.length; i++) {
      var prev = result[result.length - 1];
      var curr = findings[i];
      if (curr.start < prev.end) {
        if (curr.severity > prev.severity ||
            (curr.severity === prev.severity && (curr.end - curr.start) > (prev.end - prev.start))) {
          result[result.length - 1] = curr;
        }
      } else {
        result.push(curr);
      }
    }
    return result;
  }

  // ── Main scan function ──

  function scan(text) {
    if (!text || typeof text !== 'string') {
      return { safe: true, findings: [], maxSeverity: 0 };
    }

    var findings = [];

    for (var p = 0; p < patterns.length; p++) {
      var pattern = patterns[p];
      var regex = pattern.regex;
      regex.lastIndex = 0;

      var match;
      while ((match = regex.exec(text)) !== null) {
        var valid = true;

        if (pattern.validate) {
          valid = pattern.validate(match);
        }

        // Extra context-based rejection
        if (valid && pattern.contextReject) {
          if (pattern.contextReject(text, match.index, match[0])) {
            valid = false;
          }
        }

        if (valid) {
          findings.push({
            category: pattern.category,
            name: pattern.name,
            severity: pattern.severity,
            text: match[0],
            start: match.index,
            end: match.index + match[0].length
          });
        }
      }
    }

    findings = deduplicate(findings);

    var maxSeverity = 0;
    for (var i = 0; i < findings.length; i++) {
      if (findings[i].severity > maxSeverity) {
        maxSeverity = findings[i].severity;
      }
    }

    return {
      safe: findings.length === 0,
      findings: findings,
      maxSeverity: maxSeverity
    };
  }

  // ── Redact text by replacing findings with [REDACTED_*] labels ──

  function redact(text, findings) {
    if (!findings || findings.length === 0) return text;

    // Work backwards so indices stay valid
    var sorted = findings.slice().sort(function (a, b) { return b.start - a.start; });
    var result = text;
    for (var i = 0; i < sorted.length; i++) {
      var f = sorted[i];
      var label = '[REDACTED_' + f.name.toUpperCase() + ']';
      result = result.slice(0, f.start) + label + result.slice(f.end);
    }
    return result;
  }

  // ── Escape HTML entities ──

  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── Build highlighted HTML from text and findings ──

  function highlightHTML(text, findings) {
    if (!findings || findings.length === 0) {
      return escapeHTML(text);
    }

    var html = '';
    var cursor = 0;

    for (var i = 0; i < findings.length; i++) {
      var f = findings[i];
      if (f.start > cursor) {
        html += escapeHTML(text.slice(cursor, f.start));
      }
      html += '<mark class="pps-highlight pps-severity-' + f.severity +
        '" title="' + escapeHTML(f.category) + '">' +
        escapeHTML(text.slice(f.start, f.end)) + '</mark>';
      cursor = f.end;
    }

    if (cursor < text.length) {
      html += escapeHTML(text.slice(cursor));
    }

    return html;
  }

  // ── Summarize findings by category ──

  function summarize(findings) {
    var counts = {};
    for (var i = 0; i < findings.length; i++) {
      var cat = findings[i].category;
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }

  // ── Expose public API ──

  window.PromptPrivacyDetector = {
    scan: scan,
    redact: redact,
    highlightHTML: highlightHTML,
    summarize: summarize,
    escapeHTML: escapeHTML,
    ICONS: ICONS
  };
})();
