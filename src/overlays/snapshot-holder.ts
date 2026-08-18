
import type { OverlaySnapshot } from "./snapshot";

export class SnapshotHolder {
  private readonly byRevision = new Map<string, OverlaySnapshot>();
  private order: string[] = [];
  private currentRevision: string | undefined;

  constructor(private readonly keep = 4) {}

  /** Activate a snapshot for new page loads; returns it for convenience. */
  set(snapshot: OverlaySnapshot): OverlaySnapshot {
    this.byRevision.set(snapshot.revision, snapshot);
    this.order = this.order.filter((revision) => revision !== snapshot.revision);
    this.order.push(snapshot.revision);
    this.currentRevision = snapshot.revision;

    while (this.order.length > this.keep) {
      const oldest = this.order[0] as string;
      if (oldest === this.currentRevision) break;
      this.order.shift();
      this.byRevision.delete(oldest);
    }
    return snapshot;
  }

  current(): OverlaySnapshot | undefined {
    return this.currentRevision ? this.byRevision.get(this.currentRevision) : undefined;
  }

  get(revision: string): OverlaySnapshot | undefined {
    return this.byRevision.get(revision);
  }
}
