import fs from "fs";
import path from "path";

export default function Home() {
  // Read the original HTML file at build/request time
  const htmlPath = path.join(process.cwd(), "template.html");
  const raw = fs.readFileSync(htmlPath, "utf-8");

  // Extract just the <style> and <body> content
  const styleMatch = raw.match(/<style>([\s\S]*?)<\/style>/);
  const bodyMatch = raw.match(/<body>([\s\S]*?)<script>/);
  const styleContent = styleMatch ? styleMatch[1] : "";
  const bodyContent = bodyMatch ? bodyMatch[1] : "";

  // The new script that replaces localStorage with API calls
  const clientScript = `
function togglePrintView() {
  document.body.classList.toggle('print-mode');
  document.documentElement.classList.toggle('print-mode');
  var isPrint = document.body.classList.contains('print-mode');
  document.querySelectorAll('.annotation').forEach(function(a) {
    if (isPrint) a.classList.add('open');
    else a.classList.remove('open');
  });
  if (isPrint) window.scrollTo(0, 0);
}

function toggleLock(btn) {
  if (btn.classList.contains('finalized')) return;
  var block = btn.closest('.ad-block');
  var editables = block.querySelectorAll('[contenteditable]');
  var isLocked = btn.classList.contains('locked');
  if (isLocked) {
    btn.classList.remove('locked');
    editables.forEach(function(el) { el.setAttribute('contenteditable', 'true'); });
  } else {
    btn.classList.add('locked');
    editables.forEach(function(el) { el.setAttribute('contenteditable', 'false'); });
  }
}

var activeCategory = 'all';
var activeAudience = 'all';

function applyFilters() {
  document.querySelectorAll('.ad-block').forEach(function(block) {
    var cat = block.querySelector('.tag-cat');
    var aud = block.querySelector('.tag-aud');
    var catMatch = activeCategory === 'all' || (cat && cat.textContent === activeCategory);
    var audMatch = activeAudience === 'all' || (aud && aud.textContent === activeAudience);
    block.style.display = (catMatch && audMatch) ? 'flex' : 'none';
  });
  document.querySelectorAll('.cat-separator').forEach(function(sep) {
    var sepCat = sep.querySelector('h3').textContent;
    sep.style.display = (activeCategory === 'all' || sepCat === activeCategory) ? 'block' : 'none';
  });
}

function filterAds(category) {
  activeCategory = category;
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  event.target.classList.add('active');
  applyFilters();
}

function filterAudience(audience) {
  activeAudience = audience;
  applyFilters();
}

// ── DB-backed save/restore (replaces localStorage) ──

async function restoreEdits() {
  try {
    var res = await fetch('/api/ads');
    var edits = await res.json();
    if (!edits || Object.keys(edits).length === 0) return;
    document.querySelectorAll('.ad-block').forEach(function(block) {
      var id = block.dataset.id;
      if (!edits[id]) return;
      block.querySelectorAll('[contenteditable]').forEach(function(el, i) {
        if (edits[id][i] !== undefined) el.innerHTML = edits[id][i];
      });
    });
  } catch (e) {
    console.warn('Failed to restore edits:', e);
  }
}

function collectEdits() {
  var edits = {};
  document.querySelectorAll('.ad-block').forEach(function(block) {
    var id = block.dataset.id;
    var fields = {};
    block.querySelectorAll('[contenteditable]').forEach(function(el, i) {
      fields[i] = el.innerHTML;
    });
    edits[id] = fields;
  });
  return edits;
}

async function saveEdits() {
  try {
    await fetch('/api/ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectEdits()),
    });
  } catch (e) {
    console.warn('Failed to save edits:', e);
  }
}

restoreEdits();

// ── Approve / Ready-for-Design ──
var APPROVE_KEY = 'norton-revamp-approved-v1';
function getApprovedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(APPROVE_KEY)) || []); } catch(e) { return new Set(); }
}
function saveApprovedSet(s) {
  try { localStorage.setItem(APPROVE_KEY, JSON.stringify(Array.from(s))); } catch(e) {}
}
function toggleApprove(btn) {
  var block = btn.closest('.ad-block');
  var id = block.dataset.id;
  var lockBtn = block.querySelector('.lock-btn');
  var approved = getApprovedSet();
  if (btn.classList.contains('approved')) {
    btn.classList.remove('approved');
    block.classList.remove('approved-block');
    lockBtn.classList.remove('finalized');
    btn.title = 'Mark as ready for design';
    approved.delete(id);
  } else {
    if (!lockBtn.classList.contains('locked')) {
      lockBtn.classList.add('locked');
      block.querySelectorAll('[contenteditable]').forEach(function(el) { el.setAttribute('contenteditable', 'false'); });
    }
    btn.classList.add('approved');
    block.classList.add('approved-block');
    lockBtn.classList.add('finalized');
    btn.title = 'Approved — click to undo';
    approved.add(id);
  }
  saveApprovedSet(approved);
}
(function initApproveButtons() {
  var approved = getApprovedSet();
  document.querySelectorAll('.ad-lock-col').forEach(function(col) {
    var block = col.closest('.ad-block');
    var id = block.dataset.id;
    var btn = document.createElement('button');
    btn.className = 'approve-btn' + (approved.has(id) ? ' approved' : '');
    btn.title = approved.has(id) ? 'Approved — click to undo' : 'Mark as ready for design';
    btn.onclick = function() { toggleApprove(this); };
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    col.appendChild(btn);
    if (approved.has(id)) {
      block.classList.add('approved-block');
      var lockBtn = col.querySelector('.lock-btn');
      if (lockBtn) lockBtn.classList.add('finalized');
    }
  });
})();

var saveTimer;
document.addEventListener('input', function(e) {
  if (e.target.closest('[contenteditable]')) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveEdits, 800);
  }
});
`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styleContent }} />
      <div
        style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
        dangerouslySetInnerHTML={{ __html: bodyContent }}
      />
      <script dangerouslySetInnerHTML={{ __html: clientScript }} />
    </>
  );
}
