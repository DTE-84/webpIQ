import encodeWebpWasm from '@jsquash/webp/encode.js';

let nativeWebp;
async function hasNativeWebp() {
  if (nativeWebp === undefined) {
    try {
      const c = new OffscreenCanvas(1, 1);
      c.getContext('2d');
      const blob = await c.convertToBlob({ type: 'image/webp' });
      nativeWebp = blob.type === 'image/webp';
    } catch {
      nativeWebp = false;
    }
  }
  return nativeWebp;
}

const clampDim = (n) => Math.max(1, Math.round(n));

function planLayout(bw, bh, { w, h, fit }) {
  if (!w && !h) return { cw: bw, ch: bh, sx: 0, sy: 0, sw: bw, sh: bh, dx: 0, dy: 0, dw: bw, dh: bh };

  if (fit === 'inside') {
    let s = 1;
    if (w) s = Math.min(s, w / bw);
    if (h) s = Math.min(s, h / bh);
    const cw = clampDim(bw * s);
    const ch = clampDim(bh * s);
    return { cw, ch, sx: 0, sy: 0, sw: bw, sh: bh, dx: 0, dy: 0, dw: cw, dh: ch };
  }

  const tw = w || h;
  const th = h || w;

  if (fit === 'pad') {
    const s = Math.min(1, tw / bw, th / bh);
    const dw = clampDim(bw * s);
    const dh = clampDim(bh * s);
    return { cw: tw, ch: th, sx: 0, sy: 0, sw: bw, sh: bh, dx: Math.round((tw - dw) / 2), dy: Math.round((th - dh) / 2), dw, dh };
  }

  // crop
  const ratio = tw / th;
  let sw = bw;
  let sh = bh;
  if (bw / bh > ratio) sw = Math.round(bh * ratio);
  else sh = Math.round(bw / ratio);
  const cw = clampDim(Math.min(tw, sw));
  const ch = clampDim(cw / ratio);
  return { cw, ch, sx: Math.round((bw - sw) / 2), sy: Math.round((bh - sh) / 2), sw, sh, dx: 0, dy: 0, dw: cw, dh: ch };
}

function paintBackground(ctx, bitmap, plan, fill) {
  if (fill === 'blur') {
    // Cheap cross-browser blur (ctx.filter is unsupported in Safari): shrink a cover-fit copy, then scale back up smoothed.
    const sw = Math.max(8, Math.round(plan.cw / 24));
    const sh = Math.max(8, Math.round(plan.ch / 24));
    const small = new OffscreenCanvas(sw, sh);
    const sctx = small.getContext('2d');
    const scale = Math.max(sw / bitmap.width, sh / bitmap.height);
    const dw = bitmap.width * scale;
    const dh = bitmap.height * scale;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(bitmap, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, plan.cw, plan.ch);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, plan.cw, plan.ch);
  }
}

async function process({ blob, opts }) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const plan = planLayout(bitmap.width, bitmap.height, opts);
    const canvas = new OffscreenCanvas(plan.cw, plan.ch);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (opts.fit === 'pad' && (opts.w || opts.h)) paintBackground(ctx, bitmap, plan, opts.fill);
    ctx.drawImage(bitmap, plan.sx, plan.sy, plan.sw, plan.sh, plan.dx, plan.dy, plan.dw, plan.dh);

    let webp;
    if (!opts.forceWasm && (await hasNativeWebp())) {
      webp = await canvas.convertToBlob({ type: 'image/webp', quality: opts.quality / 100 });
    } else {
      const data = ctx.getImageData(0, 0, plan.cw, plan.ch);
      webp = new Blob([await encodeWebpWasm(data, { quality: opts.quality })], { type: 'image/webp' });
    }

    const result = { webp, width: plan.cw, height: plan.ch };

    if (opts.jpg) {
      const jc = new OffscreenCanvas(plan.cw, plan.ch);
      const jctx = jc.getContext('2d');
      jctx.fillStyle = '#ffffff';
      jctx.fillRect(0, 0, plan.cw, plan.ch);
      jctx.drawImage(canvas, 0, 0);
      result.jpg = await jc.convertToBlob({ type: 'image/jpeg', quality: Math.max(0.5, opts.quality / 100) });
    }

    if (opts.thumb) {
      const s = Math.min(1, 96 / Math.max(plan.cw, plan.ch));
      const tc = new OffscreenCanvas(clampDim(plan.cw * s), clampDim(plan.ch * s));
      const tctx = tc.getContext('2d');
      tctx.fillStyle = '#ffffff';
      tctx.fillRect(0, 0, tc.width, tc.height);
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(canvas, 0, 0, tc.width, tc.height);
      result.thumb = await tc.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    }

    return result;
  } finally {
    bitmap.close();
  }
}

self.onmessage = async (event) => {
  const { id } = event.data;
  try {
    self.postMessage({ id, ok: true, ...(await process(event.data)) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err && err.message ? err.message : String(err) });
  }
};
