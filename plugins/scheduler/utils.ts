// import { Tracker } from "./tracker.ts"

export interface RetryOptions {
  wait?: () => Promise<void>
  intercept?: (error: unknown) => boolean
}

// biome-ignore lint/suspicious/noExplicitAny: let args in!!
export function withRetry<Ret, Args extends any[]>(
  fn: (...args: Args) => Promise<Ret>,
  tries = 3,
  { wait, intercept }: RetryOptions = {},
): (...args: Args) => Promise<Ret> {
  return async (...args: Args) => {
    try {
      return await fn(...args)
    } catch (error) {
      if (intercept?.(error)) throw error
      await Promise.try(() => wait?.())
      if (tries-- <= 0) {
        throw new Error(
          `max retries exceeded for ${fn.name || '<unknown>'}()`,
          { cause: error },
        )
      }
      return await withRetry(fn, tries, { wait, intercept })(...args)
    }
  }
}

export async function after(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
