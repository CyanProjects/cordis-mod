import util from 'node:util'
import { Tracker } from '../../tracker.ts'
import type { WaiterChain } from './waiter.ts'

export default class $seat {
  tag: string | null = null
  #working = false
  #waiter: WaiterChain

  constructor(
    public readonly id: number,
    waiter: WaiterChain,
  ) {
    this.#waiter = waiter
  }

  free() {
    return !this.#working
  }

  working() {
    return this.#working
  }

  #done() {
    this.#working = false
    this.tag = null
    this.#waiter.notify(this)
  }

  use(after: Promise<unknown>, tag?: string) {
    tag ??= '<anonymous>'
    if (this.#working) throw new Error('seat already taken')
    this.#working = true
    this.tag = tag
    Tracker.promise(after, 'semaphore::Seat::use@finally').finally(() =>
      this.#done(),
    )
  }

  [util.inspect.custom]() {
    return `<${this.id}:${this.free() ? '%free%' : `${this.tag ?? 'Filled'}`}>`
  }
}
