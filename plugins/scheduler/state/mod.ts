import type { Context } from '@cordisjs/core'
import z from 'schemastery'
import Semaphore from './semaphore/mod.ts'
import WorkSteal from './worksteal/mod.ts'
import type { SchedulerState } from './base.ts'

export const kScheduleState = Symbol.for('kra.scheduler.state')

export interface $ScheduleState extends SchedulerState {}

export class $ScheduleState {
  constructor(ctx: Context, options: $ScheduleState.Config) {
    switch (options.mode) {
      case 'semaphore':
        return new Semaphore(ctx, options as Semaphore.Config)
      case 'work-steal':
        return new WorkSteal(ctx, options as WorkSteal.Config)
      default:
        throw new TypeError(`unknown mode '${options.mode}'`)
    }
  }

  static pluggedOn(ctx: Context, options: $ScheduleState.Config) {
    const scheduler = new $ScheduleState(ctx, options)
    ctx[kScheduleState] = scheduler
    return scheduler
  }
}

export namespace $ScheduleState {
  export interface Config {
    mode: 'work-steal' | 'semaphore'
    cap: number
    period: number
  }

  export const Config: z<Config> = z.object({
    mode: z.union(['work-steal', 'semaphore']).default('semaphore'),
    cap: z.number().min(1).max(99999),
    period: z.number().min(10).default(1000),
  })
}

export { $ScheduleState as ScheduleState }

// @deprecated: use `ScheduleState` instead
export { $ScheduleState as SchedulerState }

export default $ScheduleState
