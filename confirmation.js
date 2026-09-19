// Require a steady note, and re-arm only after a sustained detune. Silence and
// switching strings break the dwell time but don't repeatedly reward the same note.
export class TuningConfirmation {
  constructor(tolerance = 5) { this.setTolerance(tolerance); }
  setTolerance(tolerance) { this.tolerance = tolerance; this.reset(); }
  reset() { this.confirmed = new Set(); this.interrupt(); }
  interrupt() { this.note = null; this.since = null; this.detunedSince = null; this.lastTime = null; }
  update(note, cents, time) {
    if (note === null || !Number.isFinite(cents)) { this.interrupt(); return false; }
    if (note !== this.note || (this.lastTime !== null && time - this.lastTime > 250)) {
      this.since = null; this.detunedSince = null;
    }
    this.note = note; this.lastTime = time;
    if (Math.abs(cents) > this.tolerance + 7) {
      this.detunedSince ??= time;
      if (time - this.detunedSince >= 700) this.confirmed.delete(note);
    } else this.detunedSince = null;
    if (Math.abs(cents) > this.tolerance) { this.since = null; return false; }
    this.since ??= time;
    if (time - this.since < 600 || this.confirmed.has(note)) return false;
    this.confirmed.add(note);
    return true;
  }
}
