(() => {
  const FREE_LIMIT = 20;

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const controls = document.getElementById('controls');
  const qualitySlider = document.getElementById('qualitySlider');
  const qualityValue = document.getElementById('qualityValue');
  const maxWidthInput = document.getElementById('maxWidth');
  const maxHeightInput = document.getElementById('maxHeight');
  const downloadZipBtn = document.getElementById('downloadZipBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const summaryEl = document.getElementById('summary');
  const fileListEl = document.getElementById('fileList');
  const limitNotice = document.getElementById('limitNotice');

  /** @type {Array<{id:number,file:File,name:string,baseName:string,originalSize:number,thumbUrl:string,status:'pending'|'converting'|'done'|'error',convertedBlob:Blob|null,convertedSize:number,downloadUrl:string|null,errorMsg:string}>} */
  let items = [];
  let nextId = 1;
  let convertToken = 0;

  function isHeic(file) {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    return type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');
  }

  function isSupportedImage(file) {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    if (isHeic(file)) return true;
    if (type === 'image/jpeg' || type === 'image/png') return true;
    return name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png');
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function stripExt(name) {
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.slice(0, idx) : name;
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList).filter(isSupportedImage);
    const room = FREE_LIMIT - items.length;
    const toAdd = incoming.slice(0, Math.max(room, 0));

    toAdd.forEach((file) => {
      const item = {
        id: nextId++,
        file,
        name: file.name,
        baseName: stripExt(file.name),
        originalSize: file.size,
        thumbUrl: URL.createObjectURL(file),
        status: 'pending',
        convertedBlob: null,
        convertedSize: 0,
        downloadUrl: null,
        errorMsg: '',
      };
      items.push(item);
    });

    limitNotice.classList.toggle('hidden', items.length < FREE_LIMIT);
    controls.classList.toggle('hidden', items.length === 0);
    render();
    convertAll();
  }

  async function decodeToBitmap(file) {
    if (isHeic(file)) {
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
      return createImageBitmap(jpegBlob);
    }
    return createImageBitmap(file, { imageOrientation: 'from-image' });
  }

  function computeTargetSize(width, height, maxW, maxH) {
    let w = width, h = height;
    if (maxW && w > maxW) {
      h = Math.round(h * (maxW / w));
      w = maxW;
    }
    if (maxH && h > maxH) {
      w = Math.round(w * (maxH / h));
      h = maxH;
    }
    return { w, h };
  }

  async function convertItem(item, quality, maxW, maxH) {
    item.status = 'converting';
    render();
    try {
      const bitmap = await decodeToBitmap(item.file);
      const { w, h } = computeTargetSize(bitmap.width, bitmap.height, maxW, maxH);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close && bitmap.close();

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('WebP encoding not supported in this browser'))),
          'image/webp',
          quality / 100
        );
      });

      if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
      item.convertedBlob = blob;
      item.convertedSize = blob.size;
      item.downloadUrl = URL.createObjectURL(blob);
      item.status = 'done';
    } catch (err) {
      item.status = 'error';
      item.errorMsg = err && err.message ? err.message : 'Conversion failed';
    }
    render();
    updateSummary();
    updateZipButton();
  }

  async function convertAll() {
    const token = ++convertToken;
    const quality = Number(qualitySlider.value);
    const maxW = Number(maxWidthInput.value) || 0;
    const maxH = Number(maxHeightInput.value) || 0;

    for (const item of items) {
      if (token !== convertToken) return;
      await convertItem(item, quality, maxW, maxH);
    }
  }

  let debounceTimer = null;
  function scheduleReconvert() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      convertAll();
    }, 300);
  }

  function updateSummary() {
    const done = items.filter((i) => i.status === 'done');
    if (done.length === 0) {
      summaryEl.classList.add('hidden');
      return;
    }
    const totalOriginal = done.reduce((s, i) => s + i.originalSize, 0);
    const totalConverted = done.reduce((s, i) => s + i.convertedSize, 0);
    const savedBytes = totalOriginal - totalConverted;
    const pct = totalOriginal > 0 ? Math.round((savedBytes / totalOriginal) * 100) : 0;
    summaryEl.textContent = `Saved ${formatBytes(Math.max(savedBytes, 0))} across ${done.length} image${done.length === 1 ? '' : 's'} — ${pct}% smaller`;
    summaryEl.classList.remove('hidden');
  }

  function updateZipButton() {
    const anyDone = items.some((i) => i.status === 'done');
    downloadZipBtn.disabled = !anyDone;
  }

  function render() {
    fileListEl.innerHTML = '';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'file-row';

      const thumb = document.createElement('img');
      thumb.className = 'file-thumb';
      thumb.src = item.thumbUrl;
      thumb.alt = '';
      row.appendChild(thumb);

      const info = document.createElement('div');
      info.className = 'file-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'file-name';
      nameEl.textContent = item.name;
      info.appendChild(nameEl);

      const sizesEl = document.createElement('div');
      sizesEl.className = 'file-sizes';
      if (item.status === 'done') {
        const pct = item.originalSize > 0
          ? Math.round(((item.originalSize - item.convertedSize) / item.originalSize) * 100)
          : 0;
        sizesEl.innerHTML = `${formatBytes(item.originalSize)} → ${formatBytes(item.convertedSize)} <span class="saved">(${pct}% smaller)</span>`;
      } else if (item.status === 'error') {
        sizesEl.textContent = item.errorMsg;
      } else {
        sizesEl.textContent = formatBytes(item.originalSize);
      }
      info.appendChild(sizesEl);
      row.appendChild(info);

      const status = document.createElement('div');
      status.className = 'file-status';
      if (item.status === 'pending') { status.textContent = 'Queued'; }
      else if (item.status === 'converting') { status.textContent = 'Converting…'; }
      else if (item.status === 'done') { status.textContent = 'Done'; status.classList.add('status-done'); }
      else if (item.status === 'error') { status.textContent = 'Failed'; status.classList.add('status-error'); }
      row.appendChild(status);

      const actions = document.createElement('div');
      actions.className = 'file-actions';

      if (item.status === 'done' && item.downloadUrl) {
        const link = document.createElement('a');
        link.className = 'file-download';
        link.href = item.downloadUrl;
        link.download = `${item.baseName}.webp`;
        link.textContent = 'Download';
        actions.appendChild(link);
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'file-remove';
      removeBtn.setAttribute('aria-label', 'Remove');
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => removeItem(item.id));
      actions.appendChild(removeBtn);

      row.appendChild(actions);
      fileListEl.appendChild(row);
    });
  }

  function removeItem(id) {
    const item = items.find((i) => i.id === id);
    if (item) {
      URL.revokeObjectURL(item.thumbUrl);
      if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
    }
    items = items.filter((i) => i.id !== id);
    limitNotice.classList.toggle('hidden', items.length < FREE_LIMIT);
    controls.classList.toggle('hidden', items.length === 0);
    render();
    updateSummary();
    updateZipButton();
  }

  function clearAll() {
    items.forEach((item) => {
      URL.revokeObjectURL(item.thumbUrl);
      if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
    });
    items = [];
    controls.classList.add('hidden');
    limitNotice.classList.add('hidden');
    summaryEl.classList.add('hidden');
    fileInput.value = '';
    render();
    updateZipButton();
  }

  async function downloadZip() {
    const done = items.filter((i) => i.status === 'done' && i.convertedBlob);
    if (done.length === 0) return;

    downloadZipBtn.disabled = true;
    downloadZipBtn.textContent = 'Zipping…';

    const zip = new JSZip();
    const usedNames = new Set();
    done.forEach((item) => {
      let name = `${item.baseName}.webp`;
      let n = 1;
      while (usedNames.has(name)) {
        name = `${item.baseName}-${n}.webp`;
        n += 1;
      }
      usedNames.add(name);
      zip.file(name, item.convertedBlob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'webpiq-images.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    downloadZipBtn.textContent = 'Download all as ZIP';
    downloadZipBtn.disabled = false;
  }

  // Events
  browseBtn.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('click', (e) => {
    if (e.target === browseBtn) return;
    fileInput.click();
  });
  fileInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  qualitySlider.addEventListener('input', () => {
    qualityValue.textContent = qualitySlider.value;
    scheduleReconvert();
  });
  maxWidthInput.addEventListener('change', scheduleReconvert);
  maxHeightInput.addEventListener('change', scheduleReconvert);

  downloadZipBtn.addEventListener('click', downloadZip);
  clearAllBtn.addEventListener('click', clearAll);
})();
