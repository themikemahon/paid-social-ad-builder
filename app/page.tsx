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
