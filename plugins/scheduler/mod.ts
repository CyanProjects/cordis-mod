import { type Context, Service } from '@cordisjs/core'
import z from 'schemastery'
import { Time } from 'cosmokit'
import ScheduleState from './state/mod.ts'
import { kScheduleState } from './mod.ts'

declare module '@cordisjs/core' {
  interface Context {
    scheduler: Scheduler
  }
}

export { kScheduleState } from './state/mod.ts'
export { withRetry } from './utils.ts'
export { ScheduleState, ScheduleState as SchedulerState }

export interface ScheduleOptions extends ScheduleState.Config {
  id?: string | number
  cap: number
  period: number
}

export interface Scheduler {
  // biome-ignore lint/style/useShorthandFunctionType: scheduler is callable
  (options?: Partial<ScheduleOptions>): ScheduleState
}

export class Scheduler extends Service {
  protected states: Map<number | string, ScheduleState> = new Map()

  protected constructor(
    ctx: Context,
    public options: Scheduler.Config,
  ) {
    super(ctx, 'scheduler')

    ctx.accessor('$scheduler', {
      get: () => this[kScheduleState],
      set: (value: ScheduleState, receiver) => Reflect.set(this, kScheduleState, receiver),
    })
  }

  [Service.invoke](options: Partial<ScheduleOptions> = {}) {
    options.id ??= this.ctx.scope.uid
    if (this.states.has(options.id)) return this.states.get(options.id)
    const state = ScheduleState.pluggedOn(this.ctx, {
      ...this.options.default,
      ...options,
    })
    this.states.set(options.id, state)
    return state
  }
}

export namespace Scheduler {
  export interface Config {
    default: ScheduleState.Config
  }

  export const Config: z<Config> = z.object({
    default: ScheduleState.Config.default({
      mode: 'semaphore',
      cap: 99999,
      period: Time.second,
    }).description('Default Scheduler Options'),
  })
}

export default Scheduler
