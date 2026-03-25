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
function toggleLock(btn) {
  const block = btn.closest('.ad-block');
  const editables = block.querySelectorAll('[contenteditable]');
  const isLocked = btn.classList.contains('locked');
  if (isLocked) {
    btn.classList.remove('locked');
    editables.forEach(el => el.setAttribute('contenteditable', 'true'));
  } else {
    btn.classList.add('locked');
    editables.forEach(el => el.setAttribute('contenteditable', 'false'));
  }
}

let activeCategory = 'all';
let activeAudience = 'all';

function applyFilters() {
  document.querySelectorAll('.ad-block').forEach(block => {
    const cat = block.querySelector('.tag-cat');
    const aud = block.querySelector('.tag-aud');
    const catMatch = activeCategory === 'all' || (cat && cat.textContent === activeCategory);
    const audMatch = activeAudience === 'all' || (aud && aud.textContent === activeAudience);
    block.style.display = (catMatch && audMatch) ? 'flex' : 'none';
  });
  document.querySelectorAll('.cat-separator').forEach(sep => {
    const sepCat = sep.querySelector('h3').textContent;
    sep.style.display = (activeCategory === 'all' || sepCat === activeCategory) ? 'block' : 'none';
  });
}

function filterAds(category) {
  activeCategory = category;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
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
    const res = await fetch('/api/ads');
    const edits = await res.json();
    if (!edits || Object.keys(edits).length === 0) return;
    document.querySelectorAll('.ad-block').forEach(block => {
      const id = block.dataset.id;
      if (!edits[id]) return;
      block.querySelectorAll('[contenteditable]').forEach((el, i) => {
        if (edits[id][i] !== undefined) el.innerHTML = edits[id][i];
      });
    });
  } catch (e) {
    console.warn('Failed to restore edits:', e);
  }
}

function collectEdits() {
  const edits = {};
  document.querySelectorAll('.ad-block').forEach(block => {
    const id = block.dataset.id;
    const fields = {};
    block.querySelectorAll('[contenteditable]').forEach((el, i) => {
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

let saveTimer;
document.addEventListener('input', e => {
  if (e.target.closest('[contenteditable]')) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveEdits, 800);
  }
});
`;

  const fontLink =
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Caveat:wght@400;500;600;700&display=swap';

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href={fontLink} rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: styleContent }} />
      </head>
      <body>
        <div dangerouslySetInnerHTML={{ __html: bodyContent }} />
        <script dangerouslySetInnerHTML={{ __html: clientScript }} />
      </body>
    </html>
  );
}
