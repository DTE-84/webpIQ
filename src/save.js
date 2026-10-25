import { isNative } from './platform.js';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function anchorDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Native WebViews can't trigger <a download>, so files are written to cache and handed to the OS share sheet.
async function writeToCache(blob, filename) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const safe = filename.replace(/\//g, '_');
  const res = await Filesystem.writeFile({ path: safe, data: await blobToBase64(blob), directory: Directory.Cache });
  return res.uri;
}

export async function saveBlob(blob, filename) {
  if (!isNative) return anchorDownload(blob, filename);
  const { Share } = await import('@capacitor/share');
  await Share.share({ files: [await writeToCache(blob, filename)] });
}

export async function shareMany(entries) {
  const { Share } = await import('@capacitor/share');
  const files = [];
  for (const { blob, filename } of entries) files.push(await writeToCache(blob, filename));
  await Share.share({ files });
}

export async function buildZip(entries, onProgress) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const { path, blob } of entries) zip.file(path, blob);
  // Outputs are already compressed, so STORE keeps zipping fast for large batches.
  return zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true }, (m) => onProgress && onProgress(m.percent));
}
