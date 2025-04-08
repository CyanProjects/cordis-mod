import { defineProperty, pick } from 'cosmokit'

export interface TrackInfo {
  parent: TrackInfo | TrackInfo[] | null

  raw?: unknown
  for?: unknown
  time: number
  trace: { stack?: string }
  desc?: string
}

export namespace Tracker {
  // biome-ignore lint/style/useConst: might be set by user
  // eslint-disable-next-line prefer-const
  export let disabled = typeof process === 'undefined' || process.env.NODE_ENV === 'production'

  export const kTracked = Symbol.for('kra.scheduler.track')
  // biome-ignore lint/style/useConst: reassigned by caller
  export let trackRaw = false // eslint-disable-line prefer-const

  function getTrace(strip: (...args: unknown[]) => unknown, msg = '@TRACK') {
    if (Error.captureStackTrace) {
      const trace = {}
      Error.captureStackTrace(trace, strip)
      return <{ stack: string }>trace
    }
    const error = new Error(msg)
    error.stack = error.stack?.split('\n').slice(1).join('\n')
    return pick(error, ['stack'])
  }

  const parentOf = <T extends object>(object: T) => {
    if (Array.isArray(object)) return object.map(parentOf)
    try {
      const prop = Reflect.get(object, kTracked)
      return Object.create(typeof prop === 'object' ? prop : null)
    } catch {
      return null
    }
  }

  const createRaw = <T>(raw: T) => {
    if (trackRaw) return { raw }
    return null
  }

  export function promise<T>(
    promise: Promise<T>,
    desc?: string,
    trackedFor?: unknown,
  ): Promise<T> {
    if (disabled) return promise
    return defineProperty(
      promise,
      kTracked,
      Object.assign(
        {
          parent: parentOf(promise),
          for: trackedFor,
          time: Date.now(),
          trace: getTrace(Tracker.promise),
          desc,
        } satisfies TrackInfo,
        createRaw(promise),
      ),
    )
  }

  // Tracked `Promise.any` alternative
  export function promiseAny<T extends readonly unknown[] | []>(
    promises: T,
    desc?: string,
    trackedFor?: unknown,
  ): Promise<T[number]> {
    if (disabled) return Promise.any(promises)
    return defineProperty(
      Promise.any(promises),
      kTracked,
      Object.assign(
        {
          parent: parentOf(promises),
          for: trackedFor,
          time: Date.now(),
          trace: getTrace(Tracker.promiseAny),
          desc,
        } satisfies TrackInfo,
        createRaw(promises),
      ),
    )
  }

  export function callback<T, A extends unknown[]>(
    callback: (...args: A) => T,
    desc?: string,
  ): (...args: A) => T {
    if (disabled) return callback
    return defineProperty(
      callback,
      kTracked,
      Object.assign(
        {
          parent: parentOf(callback),
          for: callback.name,
          time: Date.now(),
          trace: getTrace(Tracker.callback),
          desc,
        } satisfies TrackInfo,
        createRaw(callback),
      ),
    )
  }
}
