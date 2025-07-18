import { CordisError, symbols } from '@cordisjs/core'
import type { Promisify } from 'cosmokit'
import { Tracker } from '../tracker.ts'
import { withRetry } from '../utils.ts'

export type Callback<T> = () => T | PromiseLike<T>

declare module '@cordisjs/core' {
  interface Context {
    $scheduler?: SchedulerState
  }
}

export abstract class SchedulerState {
  [symbols.tracker] = {
    associate: '$scheduler',
    property: 'ctx',
  }

  abstract get cap(): number
  abstract set cap(newCap: number)

  withRetry: typeof withRetry = function $withRetry(fn, tries, options) {
    options ??= {}
    const wait = options?.wait || Tracker.callback(
      this.period.bind(this),
      'SchedulerState::withRetry@wait',
    )
    return withRetry(
      fn,
      tries,
      {
        wait,
        intercept: Tracker.callback((err) => {
          if (CordisError.isError(err)) return true // do not retry CordisError
          return options.intercept?.(err)
        }, 'SchedulerState::withRetry@intercept')
      },
    )
  }

  limited(): never {
    throw new Error(
      '`SchedulerState::limited()` is removed, use `ScheduleState::throttled()` instead',
    )
  }

  throttled<T>(iterable: Iterable<Callback<T>>, period?: number): Promise<Awaited<T>[]> {
    return Promise.all(
      Array.from(iterable, (callback) =>
        <Promise<T>>Tracker.promise(
          this.period(callback.name, period).then(callback),
          'SchedulerState::throttled@promise',
        ),
      ),
    )
  }

  all<T>(iterable: Iterable<Callback<T>>): Promise<Awaited<T>[]> {
    return Promise.all(
      Array.from(iterable, (callback) =>
        <Promise<T>>Tracker.promise(
          this.completancy(callback),
          'SchedulerState::all@promise',
        ),
      ),
    )
  }

  abstract period(tag: string, period: number): Promise<void>
  abstract period(period: number): Promise<void>
  abstract period(tag: string): Promise<void>
  abstract period(): Promise<void>

  abstract completancy<T>(callback: Callback<T>): Promisify<T>

  abstract next(block: Promise<unknown>): Promise<void>
  abstract next(tag: string, block: Promise<unknown>): Promise<void>
}

export namespace SchedulerState {
  export interface Config {
    cap: number
    period: number
  }
}

export default SchedulerState
