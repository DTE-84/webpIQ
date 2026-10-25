export function isHeic(file) {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');
}

export function isSupportedImage(file) {
  if (file.name.startsWith('.')) return false;
  if (isHeic(file)) return true;
  const type = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  return type === 'image/jpeg' || type === 'image/png' || /\.(jpe?g|png)$/.test(name);
}

function entryFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readAllEntries(reader) {
  const all = [];
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return all;
    all.push(...batch);
  }
}

async function walk(entry, prefix, out) {
  if (entry.isFile) {
    out.push({ file: await entryFile(entry), path: prefix + entry.name });
  } else if (entry.isDirectory) {
    for (const child of await readAllEntries(entry.createReader())) {
      await walk(child, `${prefix}${entry.name}/`, out);
    }
  }
}

// Must be called synchronously inside the drop handler: DataTransfer items are invalidated after it returns.
export async function collectFromDataTransfer(dataTransfer) {
  const entries = [];
  const direct = [];
  for (const item of dataTransfer.items || []) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) direct.push({ file, path: file.name });
    }
  }
  const out = [...direct];
  for (const entry of entries) {
    await walk(entry, '', out);
  }
  return out.filter(({ file }) => isSupportedImage(file));
}

export function collectFromInput(fileList) {
  return Array.from(fileList)
    .map((file) => ({ file, path: file.webkitRelativePath || file.name }))
    .filter(({ file }) => isSupportedImage(file));
}
