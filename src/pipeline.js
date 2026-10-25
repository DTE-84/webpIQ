import { isNative } from './platform.js';

export const poolSize = Math.max(1, Math.min(isNative ? 2 : 4, (navigator.hardwareConcurrency || 4) - 1));

class WorkerPool {
  constructor(size) {
    this.size = size;
    this.idle = [];
    this.queue = [];
    this.nextId = 1;
    this.generation = 0;
    for (let i = 0; i < size; i++) this.idle.push(this.spawn());
  }

  spawn() {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.current = null;
    worker.onmessage = (event) => {
      const task = worker.current;
      worker.current = null;
      this.idle.push(worker);
      if (task) (event.data.ok ? task.resolve(event.data) : task.reject(new Error(event.data.error)));
      this.pump();
    };
    worker.onerror = (event) => {
      const task = worker.current;
      worker.terminate();
      if (task) task.reject(new Error(event.message || 'Worker crashed'));
      this.idle.push(this.spawn());
      this.pump();
    };
    return worker;
  }

  // Invalidates queued (not yet started) jobs; in-flight ones finish and are ignored by the caller.
  cancelQueued() {
    this.generation++;
    const dropped = this.queue.splice(0);
    dropped.forEach((task) => task.reject(Object.assign(new Error('cancelled'), { cancelled: true })));
  }

  run(blob, opts) {
    return new Promise((resolve, reject) => {
      this.queue.push({ id: this.nextId++, blob, opts, resolve, reject });
      this.pump();
    });
  }

  pump() {
    while (this.idle.length && this.queue.length) {
      const worker = this.idle.pop();
      const task = this.queue.shift();
      worker.current = task;
      worker.postMessage({ id: task.id, blob: task.blob, opts: task.opts });
    }
  }
}

let pool;
export const getPool = () => (pool ||= new WorkerPool(poolSize));

let heicQueue = Promise.resolve();
// HEIC decoding needs the DOM, so it runs on the main thread, one at a time to bound memory.
export function decodeHeic(file) {
  const job = heicQueue.then(async () => {
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    return Array.isArray(out) ? out[0] : out;
  });
  heicQueue = job.catch(() => {});
  return job;
}
