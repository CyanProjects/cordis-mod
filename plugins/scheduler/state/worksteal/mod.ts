import type { Context } from '@cordisjs/core'
import { Tracker } from '../../tracker.ts'
import { after } from '../../utils.ts'
import { type Callback, SchedulerState } from '../base.ts'
import { TASK_NOTIFY } from './constants.ts'
import { WorkerFate } from './fate.ts'
import { WorkQueue } from './queue.ts'
import { WorkerRef } from './state.ts'
import { Promisify } from 'cosmokit'

export class WorkSteal extends SchedulerState {
  queue: WorkQueue = new WorkQueue()
  workers: WorkerRef[] = []
  shared: Int32Array = new Int32Array(new SharedArrayBuffer(4))

  constructor(
    public ctx: Context,
    public options: WorkSteal.Config,
  ) {
    super()
    this.workers = Array.from({ length: this.options.cap }, (_, idx) =>
      new WorkerRef(idx, this.queue, this.shared).start(),
    )
  }

  get cap(): number {
    return this.workers.length
  }

  set cap(newCap: number) {
    if (this.workers.length === newCap) return
    if (newCap < this.workers.length) {
      const toBeSliced = this.workers.splice(newCap)
      for (const worker of toBeSliced) worker.fate.decide(WorkerFate.KILL)
    } else {
      const diff = newCap - this.workers.length
      this.workers.push(
        ...Array.from({ length: diff }, (_, idx) =>
          new WorkerRef(
            this.workers.length + idx,
            this.queue,
            this.shared,
          ).start(),
        ),
      )
    }
  }

  period(tag: string, period: number): Promise<void>
  period(period: number): Promise<void>
  period(tag: string): Promise<void>
  period(): Promise<void>
  period(tagOrPeriod?: string | number, maybePeriod?: number): Promise<void> {
    const tag = (() => {
      if (typeof tagOrPeriod !== 'number') {
        return tagOrPeriod
      }
    })()
    const period = (() => {
      if (typeof tagOrPeriod === 'number') {
        return tagOrPeriod
      }
      if (typeof maybePeriod === 'number') {
        return maybePeriod
      }
      return this.options.period
    })()

    const { promise, resolve } = Promise.withResolvers<void>()
    this.queue.put(tag, () => {
      resolve()
      return Tracker.promise(after(period), 'WorkSteal::period@after')
    })
    Atomics.notify(this.shared, TASK_NOTIFY, 1)

    return promise
  }

  completancy<T>(callback: Callback<T>): Promisify<T> {
    const { promise, resolve, reject } = Promise.withResolvers<T>()

    this.queue.put(callback.name, () => {
      return Tracker.promise(
        Promise.try(
          Tracker.callback(callback, 'WorkSteal::completancy@callback'),
        ).then(resolve, reject),
        'WorkSteal::completancy@Promise.try',
      )
    })
    Atomics.notify(this.shared, TASK_NOTIFY, 1)

    return <Promisify<T>>promise
  }

  next(block: Promise<unknown>): Promise<void>
  next(tag: string, block: Promise<unknown>): Promise<void>
  next(
    tagOrBlock: Promise<unknown> | string,
    maybeBlock?: Promise<unknown>,
  ): Promise<void> {
    const block = Tracker.promise(
      (() => {
        if (Object.getPrototypeOf(tagOrBlock) === Promise.prototype) {
          return <Promise<unknown>>tagOrBlock
        }
        return maybeBlock
      })(),
      'WorkSteal::next@promise',
    )
    const tag = typeof tagOrBlock === 'string' ? tagOrBlock : undefined

    const { promise, resolve } = Promise.withResolvers<void>()

    this.queue.put(tag, () => {
      resolve()
      return block
    })
    Atomics.notify(this.shared, TASK_NOTIFY, 1)

    return promise
  }
}

export namespace WorkSteal {
  export interface Config extends SchedulerState.Config {
    mode: 'work-steal'
  }
}

export default WorkSteal
