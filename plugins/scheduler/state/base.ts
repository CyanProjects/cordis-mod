import { symbols } from '@cordisjs/core'
import { withRetry } from '../utils.ts'
import type { Awaitable } from 'cosmokit'
import { Tracker } from '../tracker.ts'

export type Callback<T> = () => Awaitable<T>

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

  withRetry: typeof withRetry = function $withRetry(fn, tries, wait) {
    return withRetry(fn, tries, Tracker.callback(
      wait ?? this.period.bind(this),
      'SchedulerState::withRetry@wait'
    ))
  }

  limited(): never {
    throw new Error('`SchedulerState::limited()` is removed, use `ScheduleState::throttled()` instead')
  }

  throttled<T>(iterable: Iterable<Callback<T>>, period?: number): Promise<T[]> {
    return Promise.all(
      Array.from(iterable, (callback) => Tracker.promise(
        this.period(callback.name, period).then(callback),
        'SchedulerState::throttled@promise'
      )),
    )
  }

  all<T>(iterable: Iterable<Callback<T>>): Promise<T[]> {
    return Promise.all(
      Array.from(iterable, (callback) => Tracker.promise(
        this.completancy(callback),
        'SchedulerState::all@promise'
      )),
    )
  }

  abstract period(tag: string, period: number): Promise<void>
  abstract period(period: number): Promise<void>
  abstract period(tag: string): Promise<void>
  abstract period(): Promise<void>

  abstract completancy<T>(callback: Callback<T>): Promise<T>

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
