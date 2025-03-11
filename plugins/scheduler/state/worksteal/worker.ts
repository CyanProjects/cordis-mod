import type { WorkQueue } from './queue.ts'
import WorkerFate, { decide as decideMy } from './fate.ts'
import { Tracker } from '../../tracker.ts'
import { TASK_NOTIFY } from './constants.ts'

export async function worker(id: number, fate: Promise<WorkerFate>, state: Int32Array, queue: WorkQueue) {
  let { value: newTask } = Atomics.waitAsync(state, TASK_NOTIFY, state[0])

  while (await newTask) {
    const task = queue.get()
    await Tracker.promise(
      task.call(),
      'worksteal::worker::worker@task.call', `worker-${id}`
    )
    switch (await decideMy(fate)) {
      case WorkerFate.KILL:
        return
      case WorkerFate.CONTINUE:
        break
    }
    ; ({ value: newTask } = Atomics.waitAsync(state, TASK_NOTIFY, state[0]))
  }
  await fate
}
