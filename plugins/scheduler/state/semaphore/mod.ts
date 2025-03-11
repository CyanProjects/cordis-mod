import type { Context } from '@cordisjs/core'
import { symbols } from '@cordisjs/core'
import z from 'schemastery'
import util from 'node:util'
import type { Awaitable } from 'cosmokit'
import { after } from '../../utils.ts'
import { WaiterChain } from './waiter.ts'
import Seat from './seat.ts'
import { SchedulerState } from '../base.ts'
import { Tracker } from '../../tracker.ts'

export class Semaphore extends SchedulerState {
  tasks: Seat[]
  waiter: WaiterChain = new WaiterChain();

  [symbols.tracker] = {
    associate: '$scheduler',
    property: 'ctx',
  }

  constructor(
    public ctx: Context,
    public options: Semaphore.Config,
  ) {
    super()
    this.tasks = Array.from(
      { length: options.cap },
      (_, idx) => new Seat(idx, this.waiter),
    )
  }

  get cap() {
    return this.tasks.length
  }

  set cap(cap: number) {
    if (this.tasks.length === cap) return
    if (this.tasks.length > cap) this.tasks.length = cap
    const diff = cap - this.tasks.length
    this.tasks.push(
      ...Array.from({ length: diff }, (_, idx) => new Seat(idx, this.waiter)),
    )
  }

  completancy<T>(callback: () => Awaitable<T>): Promise<T> {
    const { promise: disposed, resolve: interrupt } = Promise.withResolvers<void>()
    this.ctx.on('dispose', interrupt)
    const { promise, resolve } = Promise.withResolvers<T>()
    return this.next(
      callback.name,
      Tracker.promiseAny([
        Tracker.promise(promise, 'Semaphore::completancy@done', callback.name),
        Tracker.promise(disposed, 'Semaphore::completancy@disposed'),
      ], 'Semaphore::completancy@Promise.any')
    ).then(() =>
      Promise.try(
        Tracker.callback(callback, 'Semaphore::completancy@callback')
      ).finally(resolve),
    )
  }

  period(tag?: string, period?: number): Promise<void>
  period(period: number): Promise<void>
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
    const { promise: disposed, resolve: interrupt } = Promise.withResolvers<void>()
    this.ctx.on('dispose', interrupt)
    if (tag) {
      return this.next(tag, Tracker.promiseAny([
        Tracker.promise(after(period), 'Semaphore::period@after'),
        disposed
      ], 'Semaphore::period@Promise.any'))
    }

    return this.next(Tracker.promiseAny([
      Tracker.promise(after(period), 'Semaphore::period@after'),
      Tracker.promise(disposed, 'Semaphore::period@disposed')
    ], 'Semaphore::period@Promise.any'))
  }

  available() {
    return this.tasks.some(x => x.free())
  }

  private querySlow() {
    const { promise, resolve } = Promise.withResolvers<Seat>()
    this.waiter.wait(resolve)
    return Tracker.promise(promise, 'Semaphore::querySlow@wait')
  }

  private queryQuick() {
    return this.tasks.find(x => x.free())
  }

  query() {
    const free = this.queryQuick()
    if (free) return free
    return this.querySlow()
  }

  nextSlow = async (
    promise: Promise<unknown>,
    tag?: string
  ): Promise<void> => {
    this.ctx.scope.assertActive()
    const free = await this.querySlow()

    free.use(promise, tag)

    return Tracker.promise(Promise.resolve(), 'Semaphore::nextSlow@resolve', tag)
  }

  next = (promiseOrTag: Promise<unknown>| string | undefined, maybePromise?: Promise<unknown>) => {
    this.ctx.scope.assertActive()

    const promise = Tracker.promise((() => {
      if (Object.getPrototypeOf(promiseOrTag) === Promise.prototype) {
        return <Promise<unknown>>promiseOrTag
      }
      return maybePromise
    })(), 'Semaphore::next@promise')
    const tag = typeof promiseOrTag === 'string' ? promiseOrTag : undefined

    const free = this.queryQuick()
    if (!free) return this.nextSlow(promise, tag)

    free.use(promise, tag)

    return Tracker.promise(Promise.resolve(), 'Semaphore::next@resolve', tag)
  }

  get free() {
    return this.tasks.filter((x) => x.free()).length
  }

  [util.inspect.custom]() {
    if (this.waiter.size) {
      return `ScheduleState<${this.free}/${this.tasks.length},pending=${this.waiter.size}>`
    }
    return `ScheduleState<${this.free}/${this.tasks.length},clear>`
  }
}

export namespace Semaphore {
  export interface Config extends SchedulerState.Config {
    mode: 'semaphore'
  }

  export const Config: z<Config> = z.object({
    mode: z.union(['semaphore']).default('semaphore'),
    cap: z.number().min(1).max(99999),
    period: z.number().min(10).default(1000),
  })
}

export default Semaphore
