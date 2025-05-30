import WorkerFate from './fate.ts'
import type { WorkQueue } from './queue.ts'
import { worker } from './worker.ts'

export class WorkerRef {
  fate: WorkerFate

  constructor(
    public id: number,
    public queue: WorkQueue,
    public shared: Int32Array,
  ) {
    this.fate = new WorkerFate()
  }

  start() {
    worker(this.id, Promise.resolve(this.fate), this.shared, this.queue)
    return this
  }
}
