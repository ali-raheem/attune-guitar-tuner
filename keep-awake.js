// Screen wake locks are released by browsers when the page is hidden. Reacquire
// on return, but never spin on denials caused by battery saver or device policy.
export class KeepAwake {
  constructor({ wakeLock, document, onChange = () => {} }) {
    this.api = wakeLock;
    this.document = document;
    this.onChange = onChange;
    this.wanted = false;
    this.lock = null;
    this.pending = null;
    document.addEventListener('visibilitychange', () => { void this.sync(); });
  }
  setWanted(wanted) {
    this.wanted = wanted;
    return this.sync();
  }
  async sync() {
    if (!this.api?.request) { this.onChange('unsupported'); return; }
    if (!this.wanted || this.document.visibilityState !== 'visible') {
      const lock = this.lock;
      this.lock = null;
      this.onChange(this.wanted ? 'paused' : 'idle');
      if (lock) { try { await lock.release(); } catch {} }
      return;
    }
    if (this.lock && !this.lock.released) { this.onChange('active'); return; }
    if (this.pending) return this.pending;
    this.onChange('pending');
    this.pending = this.acquire();
    try { await this.pending; } finally { this.pending = null; }
  }
  async acquire() {
    try {
      const lock = await this.api.request('screen');
      if (!this.wanted || this.document.visibilityState !== 'visible') {
        await lock.release();
        return;
      }
      if (lock.released) { this.onChange('unavailable'); return; }
      this.lock = lock;
      lock.addEventListener('release', () => {
        if (this.lock !== lock) return;
        this.lock = null;
        this.onChange(this.wanted ? 'unavailable' : 'idle');
      });
      this.onChange('active');
    } catch {
      if (this.wanted && this.document.visibilityState === 'visible') this.onChange('unavailable');
    }
  }
}
