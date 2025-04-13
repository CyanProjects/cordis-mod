import { Tracker } from '../../tracker.ts'
import { TASK_NOTIFY } from './constants.ts'
import WorkerFate, { decide as decideMy } from './fate.ts'
import type { WorkQueue } from './queue.ts'

export async function worker(
  id: number,
  fate: Promise<WorkerFate>,
  shared: Int32Array,
  queue: WorkQueue,
) {
  let { value: newTask } = Atomics.waitAsync(shared, TASK_NOTIFY, shared[0])

  while (await newTask) {
    switch (await decideMy(fate)) {
      case WorkerFate.KILL:
        return
      case WorkerFate.CONTINUE:
        break
    }
    const task = queue.get()
    await Tracker.promise(
      task.call(),
      'worksteal::worker::worker@task.call',
      `worker-${id}`,
    ).catch(reason => task.markError(reason))
    if (queue.has()) continue
    ;({ value: newTask } = Atomics.waitAsync(shared, TASK_NOTIFY, shared[0]))
  }
  await decideMy(fate)
}
