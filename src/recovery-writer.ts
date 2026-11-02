// Autosave needs the latest completed workspace, not every intermediate revision.
// Keep at most one in-flight snapshot and one replaceable pending snapshot.
export type RecoveryOutcome = { ok: true } | { ok: false; error: unknown };
export class RecoveryWriter<T> {
  private pending: { value: T } | undefined;
  private running: Promise<void> | undefined;
  private readonly write: (value: T) => Promise<unknown>;
  private readonly settled: (outcome: RecoveryOutcome) => void;

  constructor(
    write: (value: T) => Promise<unknown>,
    settled: (outcome: RecoveryOutcome) => void,
  ) {
    this.write = write;
    this.settled = settled;
  }

  enqueue(value: T): void {
    this.pending = { value };
    if (this.running) return;
    // Publish running before invoking a writer that could throw synchronously.
    this.running = Promise.resolve().then(() => this.drain());
    // Background autosave reports through settled; explicit flush still rejects.
    void this.running.catch(() => {});
  }

  flush(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private async drain(): Promise<void> {
    let failure: { error: unknown } | undefined;
    try {
      while (this.pending) {
        const value = this.pending.value;
        this.pending = undefined;
        try {
          await this.write(value);
          failure = undefined;
        } catch (error) {
          failure = { error };
        }
      }
    } finally {
      this.running = undefined;
    }
    this.settled(failure ? { ok: false, error: failure.error } : { ok: true });
    if (failure) throw failure.error;
  }
}
