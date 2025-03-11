export class WorkerFate {
  static CONTINUE = Symbol.for('kra.scheduler.worker.continue')
  static KILL = Symbol.for('kra.scheduler.worker.stop')

  #nexted?: Promise<WorkerFate>
  #decision: Promise<symbol>
  #resolve: (decision: symbol) => void

  static decided(fate: WorkerFate | symbol) {
    if (typeof fate === 'symbol') return new WorkerFate(fate)
    return fate
  }

  constructor(decide?: symbol | Promise<symbol>) {
    const { promise, resolve } = Promise.withResolvers<symbol>()
    this.#decision = promise
    this.#resolve = resolve
    if (decide) resolve(decide)
  }

  found(): Promise<symbol> {
    return this.#decision
  }

  decide(decision: symbol, next?: Promise<WorkerFate>) {
    this.#resolve(decision)
    this.#nexted = next ?? Promise.resolve(this)
  }

  async next(): Promise<WorkerFate> {
    await this.#decision
    return this.#nexted || Promise.resolve(this)
  }
}

export async function decide(
  fate: Promise<WorkerFate>,
  defaulted: WorkerFate | symbol = WorkerFate.CONTINUE
) {
  const result = await Promise.any([fate, WorkerFate.decided(defaulted)])
  return await result.found()
}

export default WorkerFate
