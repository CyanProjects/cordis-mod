import type { Awaitable, Promisify } from 'cosmokit'
import { Item, List } from 'linked-list'
import { Tracker } from '../../tracker.ts'

export class WorkQueue extends List<WorkTask> {
  // biome-ignore lint/suspicious/noExplicitAny: args can be any type
  put<R, A extends any[]>(
    tag: string | undefined,
    fn: (...args: A[]) => Awaitable<R>,
    ...args: A[]
  ): WorkTask

  put<R, A extends any[]>(
    tag: string | undefined,
    promise: Promise<unknown>,
    fn: (...args: A[]) => Awaitable<R>,
    ...args: A[]
  ): WorkTask

  put(
    tag: string | undefined,
    promiseOrFn:
      | Promise<unknown>
      | ((...args: unknown[]) => Awaitable<unknown>),
    ...args: unknown[]
  ) {
    if (Object.getPrototypeOf(promiseOrFn) === Promise.prototype) {
      return <WorkTask> this.append(
        new WorkTask(
          tag,
          // biome-ignore lint/suspicious/noExplicitAny: args is any
          ...(<[() => unknown, ...any[]]>args),
        ).or(<Promise<unknown>>promiseOrFn),
      )
    }
    // biome-ignore lint/suspicious/noExplicitAny: args is any
    return <WorkTask>(
      this.append(
        new WorkTask(tag, <() => unknown>promiseOrFn, ...(<any[]>args)),
      )
    )
  }

  has(): boolean {
    return (!!this.head)
  }

  get(): WorkTask | undefined {
    if (!this.head) return null
    return this.head.detach()
  }
}

// biome-ignore lint/suspicious/noExplicitAny: args can be any type
export class WorkTask<R = any, A extends any[] = any[]> extends Item {
  fn: (...args: A[]) => Awaitable<R>
  args: A[]
  promise?: Promise<unknown>

  hasError = false
  error?: unknown

  constructor(
    public tag: string | undefined,
    fn: (...args: A[]) => Awaitable<R>,
    ...args: A[]
  ) {
    super()
    this.fn = fn
    this.args = args
  }

  or(promise: Promise<unknown>) {
    this.promise = Tracker.promise(promise, 'worksteal::Queue::or@promise')
    return this
  }

  markError(reason?: unknown) {
    this.hasError = true
    this.error = reason
  }

  throwIfError() {
    if (!this.hasError) return
    throw this.error
  }

  call(): Promisify<R> {
    const resolved = Tracker.promise(
      Promise.try(this.fn, ...this.args),
      'worksteal::Queue::call@try',
      this.fn,
    )

    if (this.promise) Tracker.promiseAny([resolved, this.promise])
    return <Promisify<R>>resolved
  }
}
