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

// ── Approve / Ready-for-Design (DB-backed) ──
function applyApprovalState(id, isApproved) {
  var block = document.querySelector('.ad-block[data-id="' + id + '"]');
  if (!block) return;
  var lockBtn = block.querySelector('.lock-btn');
  var approveBtn = block.querySelector('.approve-btn');
  if (isApproved) {
    if (!lockBtn.classList.contains('locked')) {
      lockBtn.classList.add('locked');
      block.querySelectorAll('[contenteditable]').forEach(function(el) { el.setAttribute('contenteditable', 'false'); });
    }
    lockBtn.classList.add('finalized');
    block.classList.add('approved-block');
    if (approveBtn) {
      approveBtn.classList.add('approved');
      approveBtn.title = 'Approved — click to undo';
    }
  } else {
    lockBtn.classList.remove('finalized');
    block.classList.remove('approved-block');
    if (approveBtn) {
      approveBtn.classList.remove('approved');
      approveBtn.title = 'Mark as ready for design';
    }
  }
}

async function fetchApprovals() {
  try {
    var res = await fetch('/api/approvals');
    return await res.json();
  } catch(e) { return {}; }
}

async function toggleApprove(btn) {
  var block = btn.closest('.ad-block');
  var id = block.dataset.id;
  var isApproved = !btn.classList.contains('approved');
  applyApprovalState(id, isApproved);
  try {
    await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_id: id, approved: isApproved })
    });
  } catch(e) { console.warn('Failed to save approval:', e); }
}

(async function initApproveButtons() {
  var approvals = await fetchApprovals();
  document.querySelectorAll('.ad-lock-col').forEach(function(col) {
    var block = col.closest('.ad-block');
    var id = block.dataset.id;
    var btn = document.createElement('button');
    var isApproved = !!approvals[id];
    btn.className = 'approve-btn' + (isApproved ? ' approved' : '');
    btn.title = isApproved ? 'Approved — click to undo' : 'Mark as ready for design';
    btn.onclick = function() { toggleApprove(this); };
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    col.appendChild(btn);
    if (isApproved) applyApprovalState(id, true);
  });
})();

// ── Live polling (edits + approvals every 3s) ──
var _lastEditsJson = '';
var _lastApprovalsJson = '';
var _lastImagesJson = '';

async function pollUpdates() {
  try {
    var editsRes = await fetch('/api/ads');
    var edits = await editsRes.json();
    var editsJson = JSON.stringify(edits);
    if (editsJson !== _lastEditsJson) {
      _lastEditsJson = editsJson;
      document.querySelectorAll('.ad-block').forEach(function(block) {
        var id = block.dataset.id;
        if (!edits[id]) return;
        block.querySelectorAll('[contenteditable]').forEach(function(el, i) {
          if (edits[id][i] !== undefined && el.innerHTML !== edits[id][i]) {
            if (document.activeElement !== el) el.innerHTML = edits[id][i];
          }
        });
      });
    }
  } catch(e) {}
  try {
    var appRes = await fetch('/api/approvals');
    var approvals = await appRes.json();
    var appJson = JSON.stringify(approvals);
    if (appJson !== _lastApprovalsJson) {
      _lastApprovalsJson = appJson;
      document.querySelectorAll('.ad-block').forEach(function(block) {
        var id = block.dataset.id;
        applyApprovalState(id, !!approvals[id]);
      });
    }
  } catch(e) {}
  try {
    var imgRes = await fetch('/api/images');
    var images = await imgRes.json();
    var imgJson = JSON.stringify(images);
    if (imgJson !== _lastImagesJson) {
      _lastImagesJson = imgJson;
      document.querySelectorAll('.ad-block').forEach(function(block) {
        var id = block.dataset.id;
        var area = block.querySelector('.li-img, .fb-img, .rd-img');
        if (!area) return;
        if (images[id]) {
          var existing = area.querySelector('.dropped-img');
          if (!existing || existing.src !== images[id]) applyDroppedImage(area, images[id]);
        } else {
          clearDroppedImage(area);
        }
      });
    }
  } catch(e) {}
}

setInterval(pollUpdates, 3000);

var saveTimer;
document.addEventListener('input', function(e) {
  if (e.target.closest('[contenteditable]')) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveEdits, 800);
  }
});

// ── Drag & Drop Images (DB-backed via Vercel Blob) ──

function applyDroppedImage(imgArea, url) {
  imgArea.classList.add('has-dropped-img');
  var existing = imgArea.querySelector('.dropped-img');
  if (existing) existing.remove();
  var img = document.createElement('img');
  img.className = 'dropped-img';
  img.src = url;
  img.alt = 'Dropped design';
  imgArea.appendChild(img);
}

function clearDroppedImage(imgArea) {
  imgArea.classList.remove('has-dropped-img');
  var img = imgArea.querySelector('.dropped-img');
  if (img) img.remove();
}

async function removeDroppedImage(imgArea, adId) {
  clearDroppedImage(imgArea);
  try {
    await fetch('/api/images', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_id: adId })
    });
  } catch(e) { console.warn('Failed to delete image:', e); }
}

async function uploadDroppedImage(imgArea, adId, file) {
  var formData = new FormData();
  formData.append('file', file);
  formData.append('ad_id', adId);
  // Show preview immediately
  var tempUrl = URL.createObjectURL(file);
  applyDroppedImage(imgArea, tempUrl);
  try {
    var res = await fetch('/api/images', { method: 'POST', body: formData });
    var data = await res.json();
    if (data.url) applyDroppedImage(imgArea, data.url);
  } catch(e) { console.warn('Failed to upload image:', e); }
}

(async function initDropZones() {
  var images = {};
  try {
    var res = await fetch('/api/images');
    images = await res.json();
  } catch(e) {}

  document.querySelectorAll('.li-img, .fb-img, .rd-img').forEach(function(area) {
    var block = area.closest('.ad-block');
    if (!block) return;
    var adId = block.dataset.id;

    var hint = document.createElement('div');
    hint.className = 'drop-zone-hint';
    hint.innerHTML = '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#00c850" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    area.appendChild(hint);

    var removeBtn = document.createElement('button');
    removeBtn.className = 'img-remove-btn';
    removeBtn.innerHTML = '\\u2715';
    removeBtn.title = 'Remove image';
    removeBtn.onclick = function(e) {
      e.stopPropagation();
      removeDroppedImage(area, adId);
    };
    area.appendChild(removeBtn);

    if (images[adId]) applyDroppedImage(area, images[adId]);

    function isValidImageDrag(e) {
      if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        var type = e.dataTransfer.items[0].type;
        return type === 'image/png' || type === 'image/jpeg';
      }
      return false;
    }
    area.addEventListener('dragenter', function(e) { e.preventDefault(); if (isValidImageDrag(e)) area.classList.add('drag-over'); });
    area.addEventListener('dragover', function(e) { e.preventDefault(); if (isValidImageDrag(e)) area.classList.add('drag-over'); });
    area.addEventListener('dragleave', function(e) {
      if (!area.contains(e.relatedTarget)) area.classList.remove('drag-over');
    });
    area.addEventListener('drop', function(e) {
      e.preventDefault();
      area.classList.remove('drag-over');
      var file = e.dataTransfer.files[0];
      if (!file || (file.type !== 'image/png' && file.type !== 'image/jpeg')) return;
      uploadDroppedImage(area, adId, file);
    });
  });
})();
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
