// import { Tracker } from "./tracker.ts"

// biome-ignore lint/suspicious/noExplicitAny: let args in!!
export function withRetry<Ret, Args extends any[]>(
  fn: (...args: Args) => Promise<Ret>,
  tries = 3,
  wait?: () => Promise<void>,
): (...args: Args) => Promise<Ret> {
  return async (...args: Args) => {
    try {
      return await fn(...args)
    } catch (error) {
      await new Promise<void>((resolve) =>
        wait ? wait().then(resolve) : resolve(),
      )
      if (tries-- <= 0)
        throw new Error(
          `max retries exceeded for ${fn.name || '<unknown>'}()`,
          { cause: error },
        )
      return await withRetry(fn, tries, wait)(...args)
    }
  }
}

export async function after(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
