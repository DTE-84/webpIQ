const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;

export function sanitizeName(name) {
  return String(name).replace(ILLEGAL, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 120);
}

export function stripExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

// Pasted lists: "oldname,newname" lines map by original filename; plain lines are assigned in list order.
export function parseNameList(text) {
  const byOriginal = new Map();
  const ordered = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/[,\t]/).map((c) => c.trim());
    if (cols.length >= 2 && cols[0] && cols[1]) byOriginal.set(stripExt(cols[0]).toLowerCase(), cols[1]);
    else ordered.push(cols[0]);
  }
  return { byOriginal, ordered };
}

// Tokens: {name} original name, {sku} SKU field, {n} counter ({nn} / {nnn} zero-pad to that width).
export function buildBaseName(item, index, { pattern, sku, start, list }) {
  const original = stripExt(item.file.name);
  const mapped = list.byOriginal.get(original.toLowerCase());
  if (mapped) return sanitizeName(mapped) || original;
  if (list.ordered[index]) return sanitizeName(list.ordered[index]) || original;

  const tpl = pattern.trim() || '{name}';
  const counter = start + index;
  const out = tpl
    .replace(/\{name\}/gi, original)
    .replace(/\{sku\}/gi, sku)
    .replace(/\{(n+)\}/gi, (_, ns) => String(counter).padStart(ns.length, '0'));
  return sanitizeName(out) || original;
}

export function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i + 1) : '';
}

// Returns a map id -> final path (without extension), unique across the batch.
export function resolveOutputPaths(items, settings) {
  const used = new Set();
  const out = new Map();
  items.forEach((item, index) => {
    const dir = item.dir;
    const base = buildBaseName(item, index, settings);
    let candidate = `${dir}${base}`;
    let n = 1;
    while (used.has(candidate.toLowerCase())) candidate = `${dir}${base}-${n++}`;
    used.add(candidate.toLowerCase());
    out.set(item.id, candidate);
  });
  return out;
}
