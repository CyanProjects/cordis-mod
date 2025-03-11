import { Item, List } from 'linked-list'
import type Seat from './seat.ts'
import { Tracker } from '../../tracker.ts'

export class WaiterCallback extends Item {
  constructor(public callback: (seat: Seat) => void) {
    Tracker.callback(callback, 'WaiterCallback::constructor@callback')
    super()
  }
}

export class WaiterChain extends List<WaiterCallback> {
  wait(callback: (seat: Seat) => void) {
    return <WaiterCallback> this.prepend(new WaiterCallback(callback))
  }

  notify(seat: Seat) {
    const value = this.tail?.detach()
    if (value) Tracker.callback(value.callback, 'WaiterChain::notify@call')(seat)
    return !!value
  }
}
