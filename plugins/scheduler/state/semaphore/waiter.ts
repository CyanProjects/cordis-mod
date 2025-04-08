import { Item, List } from 'linked-list'
import { Tracker } from '../../tracker.ts'
import type Seat from './seat.ts'

export class WaiterCallback extends Item {
  constructor(public callback: (seat: Seat) => void) {
    Tracker.callback(callback, 'WaiterCallback::constructor@callback')
    super()
  }
}

export class WaiterChain extends List<WaiterCallback> {
  wait(callback: (seat: Seat) => void) {
    return <WaiterCallback>this.prepend(new WaiterCallback(callback))
  }

  notify(seat: Seat) {
    const value = this.tail?.detach()
    if (value)
      Tracker.callback(value.callback, 'WaiterChain::notify@call')(seat)
    return !!value
  }
}
