import type { Awaitable } from 'cosmokit'

export class WorkerFate {
  static CONTINUE = Symbol.for('kra.scheduler.worker.continue')
  static KILL = Symbol.for('kra.scheduler.worker.stop')

  #nexted?: Promise<WorkerFate>
  #decision: Promise<symbol>
  #resolve: (decision: symbol) => void

  #reflection: WorkerFate | null = null

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

  async found(): Promise<symbol> {
    const self = this.#reflection || this
    if (self) return await self.#decision
    return await this.#decision
  }

  decide(decision: symbol, next?: Promise<WorkerFate>) {
    const self = this.#reflection || this
    self.#resolve(decision)
    if (next) self.#nexted = next
  }

  async next(): Promise<WorkerFate> {
    const self = this.#reflection || this
    await self.#decision
    if (self.#nexted) this.#reflection = await self.#nexted
    return self.#nexted || Promise.resolve(self)
  }
}

export async function futureOf(fate: Awaitable<WorkerFate>) {
  return Promise.any([
    (await fate).found().then(() => fate),
    (await fate).next(),
  ])
}

export async function decide(
  fate: Promise<WorkerFate>,
  defaulted: WorkerFate | symbol = WorkerFate.CONTINUE,
) {
  const result = await Promise.any([
    futureOf(fate),
    WorkerFate.decided(defaulted),
  ])
  return await result.found()
}

export default WorkerFate
