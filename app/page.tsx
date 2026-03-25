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
      <div dangerouslySetInnerHTML={{ __html: bodyContent }} />
      <script dangerouslySetInnerHTML={{ __html: clientScript }} />
    </>
  );
}
