// ═══════════════════════════════════════════════════════
//  ODP Evaluation Platform — Shared Utilities
// ═══════════════════════════════════════════════════════

const Utils = (() => {

  // ─── CSV Parser (handles quoted fields, embedded newlines) ───
  function parseCSV(text) {
    const rows = [];
    let i = 0;
    const len = text.length;

    while (i < len) {
      const row = [];
      let field = '';
      let inQuotes = false;

      while (i < len) {
        const ch = text[i];

        if (inQuotes) {
          if (ch === '"' && text[i+1] === '"') { field += '"'; i += 2; }
          else if (ch === '"') { inQuotes = false; i++; }
          else { field += ch; i++; }
        } else {
          if (ch === '"') { inQuotes = true; i++; }
          else if (ch === ',') { row.push(field.trim()); field = ''; i++; }
          else if (ch === '\r' && text[i+1] === '\n') { i += 2; row.push(field.trim()); break; }
          else if (ch === '\n') { i++; row.push(field.trim()); break; }
          else { field += ch; i++; }
        }
      }

      if (i === len && field !== '') row.push(field.trim());
      if (row.length > 0 && row.some(f => f !== '')) rows.push(row);
    }
    return rows;
  }

  function csvToObjects(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { headers: [], data: [] };
    const headers = rows[0].map(h => h.replace(/^\uFEFF/, '')); // strip BOM
    const data = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); });
      return obj;
    });
    return { headers, data };
  }

  // ─── CSV Export ───
  function objectsToCSV(headers, data) {
    const escape = v => {
      const s = String(v == null ? '' : v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const lines = [
      headers.map(escape).join(','),
      ...data.map(row => headers.map(h => escape(row[h] ?? '')).join(','))
    ];
    return lines.join('\n');
  }

  function downloadCSV(filename, headers, data) {
    const blob = new Blob(['\uFEFF' + objectsToCSV(headers, data)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ─── Base64URL (URL-safe, no padding issues) ───
  function encodeB64(obj) {
    const json = JSON.stringify(obj);
    const utf8 = new TextEncoder().encode(json);
    let binary = '';
    utf8.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeB64(str) {
    try {
      const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }

  // ─── Random helpers ───
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function randomId(prefix = 'ev') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  }

  function assignPatterns(patterns, nPerEvaluator) {
    const n = Math.min(nPerEvaluator, patterns.length);
    return shuffle(patterns).slice(0, n);
  }

  // ─── DOM helpers ───
  function $(sel, ctx = document) { return ctx.querySelector(sel); }
  function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'style') Object.assign(e.style, v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    children.flat().forEach(c => {
      e.append(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function html(tag, attrs, innerHTML) {
    const e = el(tag, attrs);
    e.innerHTML = innerHTML;
    return e;
  }

  // ─── Toast notifications ───
  function toast(msg, type = 'info', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = el('div', { id: 'toast-container', class: 'toast-container' });
      document.body.appendChild(container);
    }
    const t = el('div', { class: `toast toast-${type}` }, msg);
    container.appendChild(t);
    setTimeout(() => t.remove(), duration);
  }

  // ─── Time formatting ───
  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  function now() { return new Date().toISOString(); }

  // ─── Clipboard ───
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      ta.remove();
      return true;
    }
  }

  // ─── Average ───
  function avg(arr) {
    const nums = arr.filter(x => x !== null && x !== undefined && !isNaN(x));
    return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length) : null;
  }

  function avgLabel(val, max = 5) {
    if (val === null) return '–';
    return val.toFixed(2);
  }

  // ─── Read file as text ───
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  // ─── URL hash ───
  function getHash() { return window.location.hash.slice(1); }
  function setHash(val) { history.replaceState(null, '', '#' + val); }

  // ─── LocalStorage with JSON ───
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  return {
    parseCSV, csvToObjects, objectsToCSV, downloadCSV, downloadJSON,
    encodeB64, decodeB64,
    shuffle, randomId, assignPatterns,
    $, $$, el, html, toast,
    formatDuration, now, copyToClipboard,
    avg, avgLabel, readFileAsText,
    getHash, setHash, lsGet, lsSet
  };
})();
