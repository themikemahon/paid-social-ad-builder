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

restoreEdits().then(function() { initLinkedInSeeMore(); });

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
var _lastCommentsJson = '';

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
  try {
    var commRes = await fetch('/api/comments');
    if (commRes.ok) {
      var comments = await commRes.json();
      if (comments && Object.keys(comments).length > 0) {
        var commJson = JSON.stringify(comments);
        if (commJson !== _lastCommentsJson) {
          _lastCommentsJson = commJson;
          _allComments = comments;
          saveCommentsLocal();
          document.querySelectorAll('.ad-block').forEach(function(block) {
            var adId = block.dataset.id;
            var panel = block.querySelector('.comment-panel');
            if (panel) renderComments(panel, adId);
            updateCommentDot(block);
          });
        }
      }
    }
  } catch(e) {}
  initLinkedInSeeMore();
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

function detectAndApplyRatio(imgArea, adId, src) {
  var img = new Image();
  img.onload = function() {
    var ratio = img.width / img.height;
    var sizes = _platformSizes[getPlatformKey(adId)] || [];
    var ratioMap = {'1.91/1': 1.91, '1/1': 1, '9/16': 0.5625, '4/3': 1.333};
    var bestRatio = sizes[0];
    var bestDiff = Infinity;
    sizes.forEach(function(s) {
      var diff = Math.abs(ratio - (ratioMap[s] || 1));
      if (diff < bestDiff) { bestDiff = diff; bestRatio = s; }
    });
    imgArea.style.aspectRatio = bestRatio;
    var resizeLabel = imgArea.closest('.ad-block').querySelector('.resize-label');
    if (resizeLabel) resizeLabel.textContent = _sizeLabels[bestRatio];
    var saved = loadSizesLocal();
    saved[adId] = bestRatio;
    saveSizesLocal(saved);
  };
  img.src = src;
}

async function uploadDroppedImage(imgArea, adId, file) {
  var formData = new FormData();
  formData.append('file', file);
  formData.append('ad_id', adId);
  var tempUrl = URL.createObjectURL(file);
  applyDroppedImage(imgArea, tempUrl);
  detectAndApplyRatio(imgArea, adId, tempUrl);
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

    if (images[adId]) {
      applyDroppedImage(area, images[adId]);
      detectAndApplyRatio(area, adId, images[adId]);
    }

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

// ── LinkedIn See More ──
var LI_TRUNCATE_CHARS = 150;

function initLinkedInSeeMore() {
  document.querySelectorAll('.li-intro').forEach(function(intro) {
    // Store original content on first run
    if (!intro._seeMoreFull) {
      var fullText = intro.textContent;
      if (fullText.length <= LI_TRUNCATE_CHARS) return;
      intro._seeMoreFull = intro.innerHTML;
      var truncated = fullText.substring(0, LI_TRUNCATE_CHARS);
      var lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > LI_TRUNCATE_CHARS * 0.7) truncated = truncated.substring(0, lastSpace);
      intro._seeMoreTrunc = truncated;
    }
    if (!intro._seeMoreFull) return;

    function collapse() {
      intro.innerHTML = intro._seeMoreTrunc.replace(/\\n/g, ' ').replace(/\\s+/g, ' ') + '<span class="see-more-ellipsis">… <button class="see-more-btn">see more</button></span>';
      intro.querySelector('.see-more-btn').onclick = function(e) {
        e.stopPropagation();
        expand();
      };
    }

    function expand() {
      intro.innerHTML = intro._seeMoreFull + '<div class="see-less-wrap"><button class="see-more-btn">see less</button></div>';
      intro.querySelector('.see-less-wrap .see-more-btn').onclick = function(e) {
        e.stopPropagation();
        collapse();
      };
    }

    // Only collapse if not already showing truncated view
    if (!intro.querySelector('.see-more-ellipsis')) {
      collapse();
    }
  });
};

// ── Column Collapse ──
var _platformLogos = {
  'col-linkedin': '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
  'col-meta': '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  'col-reddit': '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 00.029-.463.33.33 0 00-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.232-.095z"/></svg>'
};

var _headerLogos = {
  'col-linkedin': '<svg class="col-logo" viewBox="0 0 24 24" width="18" height="18" fill="#999"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
  'col-meta': '<svg class="col-logo" viewBox="0 0 24 24" width="18" height="18" fill="#999"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  'col-reddit': '<svg class="col-logo" viewBox="0 0 24 24" width="18" height="18" fill="#999"><path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 00.029-.463.33.33 0 00-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.232-.095z"/></svg>'
};

var _colIdMap = {'col-linkedin':'linkedin', 'col-meta':'meta', 'col-reddit':'reddit'};
var _colIdReverse = {'linkedin':'col-linkedin', 'meta':'col-meta', 'reddit':'col-reddit'};

function updateUrlFromColumns() {
  var hidden = [];
  document.querySelectorAll('.column.collapsed').forEach(function(col) {
    if (_colIdMap[col.id]) hidden.push(_colIdMap[col.id]);
  });
  var url = new URL(window.location);
  if (hidden.length > 0) {
    url.searchParams.set('hide', hidden.join(','));
  } else {
    url.searchParams.delete('hide');
  }
  history.replaceState(null, '', url.toString());
}

function applyUrlColumns() {
  var params = new URLSearchParams(window.location.search);
  var hide = params.get('hide');
  if (!hide) return;
  hide.split(',').forEach(function(key) {
    var colId = _colIdReverse[key.trim()];
    if (colId) {
      var col = document.getElementById(colId);
      if (col) col.classList.add('collapsed');
    }
  });
}

(function initColumnCollapse() {
  applyUrlColumns();
  document.querySelectorAll('.column').forEach(function(col) {
    var header = col.querySelector('.column-header');
    var h2 = header.querySelector('h2');
    var colId = col.id;

    // add logo to header beside platform name
    if (_headerLogos[colId]) {
      h2.insertAdjacentHTML('afterbegin', _headerLogos[colId]);
    }

    // wrap header content
    var inner = document.createElement('div');
    inner.className = 'column-header-inner';
    while (header.firstChild) inner.appendChild(header.firstChild);
    header.appendChild(inner);

    // eye button
    var btn = document.createElement('button');
    btn.className = 'col-collapse-btn';
    btn.title = 'Hide column';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    header.appendChild(btn);

    // collapsed logo
    var logo = document.createElement('div');
    logo.className = 'col-collapsed-logo';
    logo.innerHTML = _platformLogos[colId] || '';
    col.insertBefore(logo, col.firstChild);

    btn.onclick = function(e) {
      e.stopPropagation();
      col.classList.add('collapsed');
      updateUrlFromColumns();
    };

    col.addEventListener('click', function() {
      if (col.classList.contains('collapsed')) {
        col.classList.remove('collapsed');
        updateUrlFromColumns();
      }
    });
  });
})();

// ── Resize / Aspect Ratio Toggle ──
var RESIZE_STORE_KEY = 'norton-revamp-sizes-v1';
var _platformSizes = {
  li: ['1.91/1', '1/1', '9/16'],
  fb: ['1/1', '1.91/1', '9/16'],
  rd: ['4/3', '1/1', '1.91/1']
};
var _sizeLabels = {'1.91/1':'1.91:1', '1/1':'1:1', '9/16':'9:16', '4/3':'4:3'};

function loadSizesLocal() {
  try { return JSON.parse(localStorage.getItem(RESIZE_STORE_KEY)) || {}; } catch(e) { return {}; }
}
function saveSizesLocal(obj) {
  try { localStorage.setItem(RESIZE_STORE_KEY, JSON.stringify(obj)); } catch(e) {}
}

function getPlatformKey(adId) {
  if (adId.startsWith('li-')) return 'li';
  if (adId.startsWith('meta-')) return 'fb';
  if (adId.startsWith('rd-')) return 'rd';
  return null;
}

function applySize(imgArea, ratio) {
  if (imgArea) imgArea.style.aspectRatio = ratio;
}

(function initResizeButtons() {
  var saved = loadSizesLocal();
  document.querySelectorAll('.ad-block').forEach(function(block) {
    var adId = block.dataset.id;
    var platform = getPlatformKey(adId);
    if (!platform) return;
    var sizes = _platformSizes[platform];
    var lockCol = block.querySelector('.ad-lock-col');
    var imgArea = block.querySelector('.li-img, .fb-img, .rd-img');
    if (!imgArea) return;

    var currentIdx = 0;
    if (saved[adId]) {
      var si = sizes.indexOf(saved[adId]);
      if (si > -1) currentIdx = si;
    }

    var btn = document.createElement('button');
    btn.className = 'resize-btn';
    btn.title = 'Change aspect ratio';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg><span class="resize-label">' + _sizeLabels[sizes[currentIdx]] + '</span>';
    lockCol.appendChild(btn);

    if (currentIdx > 0) applySize(imgArea, sizes[currentIdx]);

    btn.onclick = function() {
      currentIdx = (currentIdx + 1) % sizes.length;
      var ratio = sizes[currentIdx];
      applySize(imgArea, ratio);
      btn.querySelector('.resize-label').textContent = _sizeLabels[ratio];
      var s = loadSizesLocal();
      s[adId] = ratio;
      saveSizesLocal(s);
    };
  });
})();

// ── Comments ──
var COMMENT_AUTHOR_KEY = 'norton-revamp-comment-author';
var COMMENT_STORE_KEY = 'norton-revamp-comments-v1';
var _allComments = {};
var _commentIdCounter = Date.now();

function loadCommentsLocal() {
  try { return JSON.parse(localStorage.getItem(COMMENT_STORE_KEY)) || {}; } catch(e) { return {}; }
}
function saveCommentsLocal() {
  try { localStorage.setItem(COMMENT_STORE_KEY, JSON.stringify(_allComments)); } catch(e) {}
}

function getAuthorName() {
  return localStorage.getItem(COMMENT_AUTHOR_KEY) || '';
}
function setAuthorName(name) {
  localStorage.setItem(COMMENT_AUTHOR_KEY, name);
}

function promptAuthorName() {
  return new Promise(function(resolve) {
    var name = getAuthorName();
    if (name) { resolve(name); return; }
    var overlay = document.createElement('div');
    overlay.className = 'name-modal-overlay';
    overlay.innerHTML = '<div class="name-modal"><h3>What\\u2019s your name?</h3><input type="text" placeholder="Your name" autofocus /><div class="name-modal-actions"><button class="name-modal-cancel">Cancel</button><button class="name-modal-ok">Continue</button></div></div>';
    document.body.appendChild(overlay);
    var input = overlay.querySelector('input');
    var okBtn = overlay.querySelector('.name-modal-ok');
    var cancelBtn = overlay.querySelector('.name-modal-cancel');
    function submit() {
      var val = input.value.trim();
      if (val) { setAuthorName(val); document.body.removeChild(overlay); resolve(val); }
    }
    function cancel() { document.body.removeChild(overlay); resolve(null); }
    okBtn.onclick = submit;
    cancelBtn.onclick = cancel;
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cancel(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) cancel(); });
    setTimeout(function() { input.focus(); }, 50);
  });
}

function formatTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var now = new Date();
  var diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return d.toLocaleDateString(undefined, {month:'short', day:'numeric'});
}

function renderComments(panel, adId) {
  var list = panel.querySelector('.comment-list');
  var comments = _allComments[adId] || [];
  var myName = getAuthorName();
  if (comments.length === 0) {
    list.innerHTML = '<div class="comment-empty">No comments yet</div>';
    return;
  }
  list.innerHTML = '';
  comments.forEach(function(c) {
    var item = document.createElement('div');
    item.className = 'comment-item' + (c.resolved ? ' resolved' : '');
    var isMine = myName && c.author === myName;
    var header = '<span class="comment-author">' + c.author + '</span><span class="comment-time">' + formatTime(c.created_at) + '</span>';
    if (c.resolved) header += '<span class="comment-resolved-label">Resolved</span>';

    var actions = '<div class="comment-actions">';
    actions += '<button class="comment-resolve-btn" title="' + (c.resolved ? 'Unresolve' : 'Resolve') + '">\\u2713</button>';
    if (isMine && !c.resolved) actions += '<button class="comment-edit-btn" title="Edit"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
    if (isMine) actions += '<button class="comment-delete-btn" title="Delete"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>';
    actions += '</div>';

    item.innerHTML = '<div>' + header + actions + '</div><div class="comment-msg">' + c.message.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';

    var resolveBtn = item.querySelector('.comment-resolve-btn');
    if (resolveBtn) {
      resolveBtn.onclick = async function() {
        var newState = !c.resolved;
        c.resolved = newState;
        saveCommentsLocal();
        renderComments(panel, adId);
        updateCommentDot(panel.closest('.ad-block'));
        try {
          await fetch('/api/comments', {
            method: 'PATCH',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({id: c.id, resolved: newState})
          });
        } catch(e) {}
      };
    }

    var editBtn = item.querySelector('.comment-edit-btn');
    if (editBtn) {
      editBtn.onclick = function() {
        var msgEl = item.querySelector('.comment-msg');
        msgEl.innerHTML = '<input class="comment-edit-input" value="' + c.message.replace(/"/g,'&quot;') + '" /><div class="comment-edit-actions"><button class="comment-edit-save">Save</button><button class="comment-edit-cancel">Cancel</button></div>';
        var editInput = msgEl.querySelector('.comment-edit-input');
        editInput.focus();
        msgEl.querySelector('.comment-edit-save').onclick = async function() {
          var newMsg = editInput.value.trim();
          if (!newMsg) return;
          c.message = newMsg;
          saveCommentsLocal();
          renderComments(panel, adId);
          try {
            await fetch('/api/comments', {
              method: 'PATCH',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify({id: c.id, message: newMsg})
            });
          } catch(e) {}
        };
        msgEl.querySelector('.comment-edit-cancel').onclick = function() {
          renderComments(panel, adId);
        };
        editInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') msgEl.querySelector('.comment-edit-save').click();
          if (e.key === 'Escape') msgEl.querySelector('.comment-edit-cancel').click();
        });
      };
    }

    var deleteBtn = item.querySelector('.comment-delete-btn');
    if (deleteBtn) {
      deleteBtn.onclick = async function() {
        var arr = _allComments[adId];
        var idx = arr.findIndex(function(x) { return x.id === c.id; });
        if (idx > -1) arr.splice(idx, 1);
        saveCommentsLocal();
        renderComments(panel, adId);
        updateCommentDot(panel.closest('.ad-block'));
        try {
          await fetch('/api/comments', {
            method: 'DELETE',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({id: c.id})
          });
        } catch(e) {}
      };
    }

    list.appendChild(item);
  });
  list.scrollTop = list.scrollHeight;
}

function updateCommentDot(block) {
  var adId = block.dataset.id;
  var btn = block.querySelector('.comment-btn');
  var comments = _allComments[adId] || [];
  var hasUnresolved = comments.some(function(c) { return !c.resolved; });
  if (hasUnresolved) btn.classList.add('has-unresolved');
  else btn.classList.remove('has-unresolved');
}

(async function initComments() {
  try {
    var res = await fetch('/api/comments');
    if (res.ok) {
      _allComments = await res.json();
      saveCommentsLocal();
    } else {
      _allComments = loadCommentsLocal();
    }
  } catch(e) { _allComments = loadCommentsLocal(); }

  document.querySelectorAll('.ad-block').forEach(function(block) {
    var adId = block.dataset.id;
    var lockCol = block.querySelector('.ad-lock-col');
    var adContent = block.querySelector('.ad-content');

    var btn = document.createElement('button');
    btn.className = 'comment-btn';
    btn.title = 'Comments';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
    lockCol.appendChild(btn);

    var panel = document.createElement('div');
    panel.className = 'comment-panel';
    panel.innerHTML = '<div class="comment-list"></div><div class="comment-input-row"><input class="comment-input" placeholder="Add a comment..." /><button class="comment-send-btn">Send</button></div>';
    adContent.appendChild(panel);

    renderComments(panel, adId);
    updateCommentDot(block);

    btn.onclick = function() {
      var isOpening = !panel.classList.contains('open');
      panel.classList.toggle('open');
      if (isOpening) {
        setTimeout(function() {
          panel.scrollIntoView({behavior: 'smooth', block: 'center'});
        }, 50);
      }
    };

    var input = panel.querySelector('.comment-input');
    var sendBtn = panel.querySelector('.comment-send-btn');

    async function sendComment() {
      var msg = input.value.trim();
      if (!msg) return;
      var author = await promptAuthorName();
      if (!author) return;
      input.value = '';
      try {
        var res = await fetch('/api/comments', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ad_id: adId, author: author, message: msg})
        });
        var data = res.ok ? await res.json() : {};
        var newComment = {id: data.id || (++_commentIdCounter), author: author, message: msg, resolved: false, created_at: data.created_at || new Date().toISOString()};
        if (!_allComments[adId]) _allComments[adId] = [];
        _allComments[adId].push(newComment);
        saveCommentsLocal();
        renderComments(panel, adId);
        updateCommentDot(block);
      } catch(e) {
        var newComment = {id: ++_commentIdCounter, author: author, message: msg, resolved: false, created_at: new Date().toISOString()};
        if (!_allComments[adId]) _allComments[adId] = [];
        _allComments[adId].push(newComment);
        saveCommentsLocal();
        renderComments(panel, adId);
        updateCommentDot(block);
      }
    }

    sendBtn.onclick = sendComment;
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); }
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
