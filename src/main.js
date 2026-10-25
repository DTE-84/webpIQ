import './styles.css';
import { FREE_LIMIT, PRICE_LABEL, CHECKOUT_URL, PRESETS_STORAGE_KEY } from './config.js';
import { isNative, isApp } from './platform.js';
import { MARKETPLACE_PRESETS } from './presets.js';
import { initLicense, isPro, onPlanChange, activateLicense, deactivateLicense } from './license.js';
import { collectFromDataTransfer, collectFromInput, isHeic } from './files.js';
import { parseNameList, resolveOutputPaths } from './naming.js';
import { getPool, poolSize, decodeHeic } from './pipeline.js';
import { saveBlob, shareMany, buildZip } from './save.js';

const $ = (id) => document.getElementById(id);
const el = {
  dropzone: $('dropzone'), fileInput: $('fileInput'), folderInput: $('folderInput'),
  browseBtn: $('browseBtn'), folderBtn: $('folderBtn'), dropHint: $('dropHint'),
  controls: $('controls'), quality: $('qualitySlider'), qualityValue: $('qualityValue'),
  maxWidth: $('maxWidth'), maxHeight: $('maxHeight'),
  preset: $('preset'), fit: $('fit'), fill: $('fill'), fillGroup: $('fillGroup'),
  savePresetBtn: $('savePresetBtn'), deletePresetBtn: $('deletePresetBtn'),
  jpg: $('jpgFallback'), pattern: $('pattern'), sku: $('sku'), startNum: $('startNum'), nameList: $('nameList'),
  zipBtn: $('downloadZipBtn'), shareBtn: $('shareAllBtn'), clearBtn: $('clearAllBtn'),
  summary: $('summary'), summaryText: $('summaryText'), progress: $('progress'), progressBar: $('progressBar'),
  fileList: $('fileList'), limitNotice: $('limitNotice'),
  upgradeBtn: $('upgradeBtn'), proBadge: $('proBadge'),
  upgradeDialog: $('upgradeDialog'), buyBlock: $('buyBlock'), buyLink: $('buyLink'),
  licenseInput: $('licenseInput'), licenseError: $('licenseError'), activateBtn: $('activateBtn'), deactivateBtn: $('deactivateBtn'),
  presetDialog: $('presetDialog'), presetForm: $('presetForm'), presetName: $('presetName'),
};

const items = [];
let nextId = 1;
let generation = 0;

document.body.classList.toggle('is-app', isApp);
document.body.classList.toggle('is-native', isNative);
document.querySelectorAll('.price-label').forEach((n) => (n.textContent = PRICE_LABEL));

// ---------- formatting ----------
function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
const baseOf = (path) => path.slice(path.lastIndexOf('/') + 1);

// ---------- settings ----------
function readOptions() {
  const pro = isPro();
  return {
    quality: Number(el.quality.value),
    w: Number(el.maxWidth.value) || 0,
    h: Number(el.maxHeight.value) || 0,
    fit: pro ? el.fit.value : 'inside',
    fill: pro ? el.fill.value : 'white',
    jpg: pro && el.jpg.checked,
    forceWasm: new URLSearchParams(location.search).get('encoder') === 'wasm',
  };
}

function readNaming() {
  const pro = isPro();
  return {
    pattern: pro ? el.pattern.value : '{name}',
    sku: el.sku.value.trim(),
    start: Number(el.startNum.value) || 0,
    list: parseNameList(pro ? el.nameList.value : ''),
  };
}

// ---------- rows ----------
function createRow(item) {
  const row = document.createElement('div');
  row.className = 'file-row';
  row.innerHTML = `
    <img class="file-thumb" alt="" hidden>
    <div class="file-thumb ph"></div>
    <div class="file-info">
      <div class="file-name"></div>
      <div class="file-out"></div>
      <div class="file-sizes"></div>
    </div>
    <div class="file-status"></div>
    <div class="file-actions">
      <button type="button" class="file-dl dl-webp hidden">WebP</button>
      <button type="button" class="file-dl dl-jpg hidden">JPG</button>
      <button type="button" class="file-remove" aria-label="Remove">✕</button>
    </div>`;
  item.ui = {
    row,
    thumb: row.querySelector('img.file-thumb'),
    ph: row.querySelector('.ph'),
    name: row.querySelector('.file-name'),
    out: row.querySelector('.file-out'),
    sizes: row.querySelector('.file-sizes'),
    status: row.querySelector('.file-status'),
    dlWebp: row.querySelector('.dl-webp'),
    dlJpg: row.querySelector('.dl-jpg'),
  };
  item.ui.name.textContent = item.path;
  item.ui.sizes.textContent = fmtBytes(item.originalSize);
  item.ui.dlWebp.addEventListener('click', () => { computeNames(); if (item.webp) saveBlob(item.webp, `${baseOf(item.outPath)}.webp`); });
  item.ui.dlJpg.addEventListener('click', () => { computeNames(); if (item.jpg) saveBlob(item.jpg, `${baseOf(item.outPath)}.jpg`); });
  row.querySelector('.file-remove').addEventListener('click', () => removeItem(item));
  return row;
}

function updateRow(item) {
  const { ui } = item;
  ui.status.className = 'file-status';
  switch (item.status) {
    case 'queued': ui.status.textContent = 'Queued'; break;
    case 'converting': ui.status.textContent = 'Converting…'; break;
    case 'error': ui.status.textContent = 'Failed'; ui.status.classList.add('status-error'); break;
    case 'done': ui.status.textContent = 'Done'; ui.status.classList.add('status-done'); break;
  }
  if (item.status === 'done') {
    const pct = item.originalSize > 0 ? Math.round((1 - item.webp.size / item.originalSize) * 100) : 0;
    ui.sizes.innerHTML = '';
    ui.sizes.append(`${fmtBytes(item.originalSize)} → ${fmtBytes(item.webp.size)} `);
    const saved = document.createElement('span');
    saved.className = pct >= 0 ? 'saved' : 'grew';
    saved.textContent = pct >= 0 ? `(${pct}% smaller)` : `(${-pct}% larger)`;
    ui.sizes.append(saved, ` · ${item.width}×${item.height}`);
  } else if (item.status === 'error') {
    ui.sizes.textContent = item.error;
  }
  ui.dlWebp.classList.toggle('hidden', item.status !== 'done');
  ui.dlJpg.classList.toggle('hidden', !(item.status === 'done' && item.jpg));
  if (item.thumbUrl && ui.thumb.hidden) {
    ui.thumb.src = item.thumbUrl;
    ui.thumb.hidden = false;
    ui.ph.hidden = true;
  }
}

function computeNames() {
  const pro = isPro();
  const paths = resolveOutputPaths(items.map((i) => ({ id: i.id, file: i.file, dir: pro ? i.dir : '' })), readNaming());
  items.forEach((item) => {
    item.outPath = paths.get(item.id);
    item.ui.out.textContent = `→ ${item.outPath}.webp`;
  });
}

// setTimeout (not requestAnimationFrame) so batching still works when the tab is in the background.
let namesQueued = false;
function refreshNames() {
  if (namesQueued) return;
  namesQueued = true;
  setTimeout(() => {
    namesQueued = false;
    computeNames();
  }, 30);
}

let summaryQueued = false;
function updateSummary() {
  if (summaryQueued) return;
  summaryQueued = true;
  setTimeout(() => {
    summaryQueued = false;
    const done = items.filter((i) => i.status === 'done');
    const failed = items.filter((i) => i.status === 'error').length;
    const inFlight = items.length - done.length - failed;
    el.summary.classList.toggle('hidden', items.length === 0);
    el.zipBtn.disabled = el.shareBtn.disabled = done.length === 0;

    const orig = done.reduce((s, i) => s + i.originalSize, 0);
    const out = done.reduce((s, i) => s + i.webp.size, 0);
    const pct = orig > 0 ? Math.round((1 - out / orig) * 100) : 0;
    const failedNote = failed ? ` · ${failed} failed` : '';
    if (inFlight > 0) {
      el.summaryText.textContent = `Processing ${done.length + failed} of ${items.length}…${failedNote}`;
      el.progress.classList.remove('hidden');
      el.progressBar.style.width = `${((done.length + failed) / items.length) * 100}%`;
    } else {
      el.progress.classList.add('hidden');
      const n = `${done.length} image${done.length === 1 ? '' : 's'}`;
      if (!done.length) el.summaryText.textContent = `Nothing converted${failedNote}`;
      else if (out < orig) el.summaryText.textContent = `Saved ${fmtBytes(orig - out)} across ${n} — ${pct}% smaller${failedNote}`;
      else el.summaryText.textContent = `Converted ${n} — output is ${Math.abs(pct)}% larger than the originals. Try a lower quality.${failedNote}`;
    }
  }, 30);
}

function syncLimitNotice() {
  el.limitNotice.classList.toggle('hidden', isPro() || items.length < FREE_LIMIT);
  el.controls.classList.toggle('hidden', items.length === 0);
}

// ---------- conversion ----------
async function runLimited(list, limit, fn, stopped) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length && !stopped()) await fn(list[next++]);
  });
  await Promise.all(workers);
}

async function convertItem(item, opts, gen) {
  if (gen !== generation || !items.includes(item)) return;
  item.status = 'converting';
  updateRow(item);
  try {
    let source = item.file;
    if (isHeic(item.file)) {
      item.decoded ||= await decodeHeic(item.file);
      source = item.decoded;
    }
    if (gen !== generation || !items.includes(item)) return;
    const res = await getPool().run(source, { ...opts, thumb: !item.thumbUrl });
    if (gen !== generation || !items.includes(item)) return;
    item.webp = res.webp;
    item.jpg = res.jpg || null;
    item.width = res.width;
    item.height = res.height;
    if (res.thumb && !item.thumbUrl) item.thumbUrl = URL.createObjectURL(res.thumb);
    item.status = 'done';
  } catch (err) {
    if (err.cancelled) return;
    item.status = 'error';
    item.error = err.message || 'Conversion failed';
    item.webp = item.jpg = null;
  }
  updateRow(item);
  updateSummary();
}

function convertAll() {
  const gen = ++generation;
  getPool().cancelQueued();
  const opts = readOptions();
  const list = items.slice();
  list.forEach((item) => {
    item.status = 'queued';
    updateRow(item);
  });
  updateSummary();
  runLimited(list, poolSize + 1, (item) => convertItem(item, opts, gen), () => gen !== generation);
}

let debounce;
const scheduleConvert = () => {
  clearTimeout(debounce);
  debounce = setTimeout(convertAll, 250);
};

// ---------- adding / removing ----------
function addEntries(entries) {
  const room = isPro() ? Infinity : FREE_LIMIT - items.length;
  const accepted = entries.slice(0, Math.max(room, 0));
  const frag = document.createDocumentFragment();
  for (const { file, path } of accepted) {
    const slash = path.lastIndexOf('/');
    const item = {
      id: nextId++, file, path, dir: slash >= 0 ? path.slice(0, slash + 1) : '',
      originalSize: file.size, status: 'queued', webp: null, jpg: null, thumbUrl: null,
    };
    items.push(item);
    frag.append(createRow(item));
  }
  el.fileList.append(frag);
  syncLimitNotice();
  if (!accepted.length) return;
  refreshNames();
  convertAll();
}

function removeItem(item) {
  const i = items.indexOf(item);
  if (i < 0) return;
  items.splice(i, 1);
  if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
  item.ui.row.remove();
  syncLimitNotice();
  refreshNames();
  updateSummary();
}

function clearAll() {
  generation++;
  getPool().cancelQueued();
  items.forEach((i) => i.thumbUrl && URL.revokeObjectURL(i.thumbUrl));
  items.length = 0;
  el.fileList.innerHTML = '';
  el.fileInput.value = '';
  el.folderInput.value = '';
  syncLimitNotice();
  updateSummary();
}

// ---------- saving ----------
function outputEntries() {
  computeNames();
  const out = [];
  for (const item of items) {
    if (item.status !== 'done') continue;
    out.push({ path: `${item.outPath}.webp`, filename: `${baseOf(item.outPath)}.webp`, blob: item.webp });
    if (item.jpg) out.push({ path: `${item.outPath}.jpg`, filename: `${baseOf(item.outPath)}.jpg`, blob: item.jpg });
  }
  return out;
}

async function downloadZip() {
  const entries = outputEntries();
  if (!entries.length) return;
  const label = el.zipBtn.textContent;
  el.zipBtn.disabled = true;
  try {
    const zip = await buildZip(entries, (p) => (el.zipBtn.textContent = `Zipping… ${Math.round(p)}%`));
    await saveBlob(zip, 'webpiq-images.zip');
  } finally {
    el.zipBtn.textContent = label;
    el.zipBtn.disabled = false;
  }
}

// ---------- presets ----------
function loadUserPresets() {
  try { return JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveUserPresets(list) {
  try { localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

function renderPresetOptions(selected = '') {
  el.preset.innerHTML = '<option value="">Custom / none</option>';
  const mk = document.createElement('optgroup');
  mk.label = 'Marketplaces';
  MARKETPLACE_PRESETS.forEach((p) => mk.append(new Option(p.label, `m:${p.id}`)));
  el.preset.append(mk);
  const mine = loadUserPresets();
  if (mine.length) {
    const grp = document.createElement('optgroup');
    grp.label = 'My presets';
    mine.forEach((p) => grp.append(new Option(p.name, `u:${p.id}`)));
    el.preset.append(grp);
  }
  el.preset.value = selected;
  el.deletePresetBtn.classList.toggle('hidden', !selected.startsWith('u:'));
}

function syncFitUI() {
  el.fillGroup.classList.toggle('hidden', el.fit.value !== 'pad');
}

function applyPreset(value) {
  el.deletePresetBtn.classList.toggle('hidden', !value.startsWith('u:'));
  if (!value) return;
  const [kind, id] = value.split(':');
  const p = kind === 'm' ? MARKETPLACE_PRESETS.find((x) => x.id === id) : loadUserPresets().find((x) => x.id === id);
  if (!p) return;
  el.maxWidth.value = p.w || '';
  el.maxHeight.value = p.h || '';
  el.fit.value = p.fit;
  el.fill.value = p.fill || 'white';
  if (kind === 'u') {
    el.quality.value = p.quality ?? el.quality.value;
    el.qualityValue.textContent = el.quality.value;
    el.jpg.checked = !!p.jpg;
    el.pattern.value = p.pattern || '';
  }
  syncFitUI();
  refreshNames();
  scheduleConvert();
}

function manualSizeEdit() {
  el.preset.value = '';
  el.deletePresetBtn.classList.add('hidden');
}

// ---------- plan / locking ----------
function applyPlan() {
  const pro = isPro();
  document.body.classList.toggle('is-pro', pro);
  document.querySelectorAll('.pro-panel').forEach((panel) => {
    panel.classList.toggle('locked', !pro);
    panel.querySelectorAll('input, select, textarea, button').forEach((c) => (c.disabled = !pro));
  });
  el.proBadge.classList.toggle('hidden', !pro);
  el.upgradeBtn.textContent = pro ? 'Pro active' : 'Go Pro';
  el.dropHint.textContent = pro ? 'JPG · PNG · HEIC (iPhone) — unlimited' : `JPG · PNG · HEIC (iPhone) — up to ${FREE_LIMIT} images free`;
  syncLimitNotice();
  if (items.length) {
    refreshNames();
    convertAll();
  }
}

function openUpgrade() {
  const showBuy = !!CHECKOUT_URL && !isNative;
  el.buyBlock.classList.toggle('hidden', !showBuy);
  if (showBuy) el.buyLink.href = CHECKOUT_URL;
  el.deactivateBtn.classList.toggle('hidden', !isPro());
  el.licenseError.classList.add('hidden');
  el.licenseInput.value = '';
  el.upgradeDialog.showModal();
}

// ---------- wiring ----------
el.browseBtn.addEventListener('click', (e) => { e.stopPropagation(); el.fileInput.click(); });
el.folderBtn.addEventListener('click', (e) => { e.stopPropagation(); el.folderInput.click(); });
el.dropzone.addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', (e) => { addEntries(collectFromInput(e.target.files)); e.target.value = ''; });
el.folderInput.addEventListener('change', (e) => { addEntries(collectFromInput(e.target.files)); e.target.value = ''; });

['dragenter', 'dragover'].forEach((type) =>
  document.addEventListener(type, (e) => {
    e.preventDefault();
    el.dropzone.classList.add('dragover');
  })
);
document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) el.dropzone.classList.remove('dragover');
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  el.dropzone.classList.remove('dragover');
  if (e.dataTransfer) collectFromDataTransfer(e.dataTransfer).then(addEntries);
});

el.quality.addEventListener('input', () => {
  el.qualityValue.textContent = el.quality.value;
  scheduleConvert();
});
[el.maxWidth, el.maxHeight].forEach((input) =>
  input.addEventListener('input', () => { manualSizeEdit(); scheduleConvert(); })
);
[el.fit, el.fill].forEach((sel) =>
  sel.addEventListener('change', () => { manualSizeEdit(); syncFitUI(); scheduleConvert(); })
);
el.jpg.addEventListener('change', scheduleConvert);
el.preset.addEventListener('change', () => applyPreset(el.preset.value));
[el.pattern, el.sku, el.startNum, el.nameList].forEach((input) => input.addEventListener('input', refreshNames));

el.zipBtn.addEventListener('click', downloadZip);
el.shareBtn.addEventListener('click', () => shareMany(outputEntries()));
el.clearBtn.addEventListener('click', clearAll);

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-upgrade]')) openUpgrade();
});
el.upgradeBtn.addEventListener('click', openUpgrade);
el.activateBtn.addEventListener('click', async () => {
  const ok = await activateLicense(el.licenseInput.value);
  el.licenseError.classList.toggle('hidden', ok);
  if (ok) el.upgradeDialog.close();
});
el.deactivateBtn.addEventListener('click', () => { deactivateLicense(); el.upgradeDialog.close(); });

el.savePresetBtn.addEventListener('click', () => { el.presetName.value = ''; el.presetDialog.showModal(); el.presetName.focus(); });
el.presetForm.addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'save') return;
  const name = el.presetName.value.trim();
  if (!name) { e.preventDefault(); return; }
  const o = readOptions();
  const naming = readNaming();
  const list = loadUserPresets();
  const preset = { id: crypto.randomUUID(), name, w: o.w, h: o.h, fit: o.fit, fill: o.fill, quality: o.quality, jpg: o.jpg, pattern: naming.pattern };
  list.push(preset);
  saveUserPresets(list);
  renderPresetOptions(`u:${preset.id}`);
});
el.deletePresetBtn.addEventListener('click', () => {
  const id = el.preset.value.split(':')[1];
  saveUserPresets(loadUserPresets().filter((p) => p.id !== id));
  renderPresetOptions('');
});

if (isNative) el.shareBtn.classList.remove('hidden');
renderPresetOptions('');
syncFitUI();
onPlanChange(applyPlan);
applyPlan();
initLicense();

if (!isNative && 'serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
