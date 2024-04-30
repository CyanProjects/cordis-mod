import { mock } from 'node:test'
import { expect } from 'chai'
import { Context, Service } from '@cordisjs/core'
import { defineProperty } from 'cosmokit'
import MockLoader from './utils'

describe('@cordisjs/loader', () => {
  describe('basic support', () => {
    const root = new Context()
    root.plugin(MockLoader)

    const foo = root.loader.mock('foo', (ctx: Context) => ctx.accept())
    const bar = root.loader.mock('bar', (ctx: Context) => ctx.accept())
    const qux = root.loader.mock('qux', (ctx: Context) => ctx.accept())

    it('loader initiate', async () => {
      await root.loader.restart([{
        id: '1',
        name: 'foo',
      }, {
        id: '2',
        name: 'cordis/group',
        config: [{
          id: '3',
          name: 'bar',
          config: {
            a: 1,
          },
        }, {
          id: '4',
          name: 'qux',
          disabled: true,
        }],
      }])

      root.loader.expectEnable(foo, {})
      root.loader.expectEnable(bar, { a: 1 })
      root.loader.expectDisable(qux)
      expect(foo.mock.calls).to.have.length(1)
      expect(bar.mock.calls).to.have.length(1)
      expect(qux.mock.calls).to.have.length(0)
    })

    it('loader update', async () => {
      foo.mock.resetCalls()
      bar.mock.resetCalls()
      root.loader.restart([{
        id: '1',
        name: 'foo',
      }, {
        id: '4',
        name: 'qux',
      }])

      await new Promise((resolve) => setTimeout(resolve, 0))
      root.loader.expectEnable(foo, {})
      root.loader.expectDisable(bar)
      root.loader.expectEnable(qux, {})
      expect(foo.mock.calls).to.have.length(0)
      expect(bar.mock.calls).to.have.length(0)
      expect(qux.mock.calls).to.have.length(1)
    })

    it('plugin self-update 1', async () => {
      root.registry.get(foo)!.update({ a: 3 })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(root.loader.config).to.deep.equal([{
        id: '1',
        name: 'foo',
        config: { a: 3 },
      }, {
        id: '4',
        name: 'qux',
      }])
    })

    it('plugin self-update 2', async () => {
      root.registry.get(foo)!.children[0].update({ a: 5 })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(root.loader.config).to.deep.equal([{
        id: '1',
        name: 'foo',
        config: { a: 5 },
      }, {
        id: '4',
        name: 'qux',
      }])
    })

    it('plugin self-dispose 1', async () => {
      root.registry.get(foo)!.dispose()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(root.loader.config).to.deep.equal([{
        id: '1',
        name: 'foo',
        disabled: true,
        config: { a: 5 },
      }, {
        id: '4',
        name: 'qux',
      }])
    })

    it('plugin self-dispose 2', async () => {
      root.registry.get(qux)!.children[0].dispose()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(root.loader.config).to.deep.equal([{
        id: '1',
        name: 'foo',
        disabled: true,
        config: { a: 5 },
      }, {
        id: '4',
        name: 'qux',
        disabled: true,
      }])
    })
  })

  describe('service isolation', async () => {
    const root = new Context()
    root.plugin(MockLoader)

    const dispose = mock.fn()

    const foo = defineProperty(root.loader.mock('foo', (ctx: Context) => {
      ctx.on('dispose', dispose)
    }), 'inject', ['bar'])

    const Bar = root.loader.mock('bar', class Bar extends Service {
      static [Service.provide] = 'bar'
      static [Service.immediate] = true
    })

    const Qux = root.loader.mock('qux', class Qux extends Service {
      static [Service.provide] = 'qux'
      static [Service.immediate] = true
    })

    it('basic support', async () => {
      await root.loader.restart([{
        id: '1',
        name: 'bar',
      }, {
        id: '2',
        name: 'qux',
      }, {
        id: '3',
        name: 'foo',
      }])
      expect(root.registry.get(foo)).to.be.ok
      expect(root.registry.get(Bar)).to.be.ok
      expect(root.registry.get(Qux)).to.be.ok
      expect(foo.mock.calls).to.have.length(1)
      expect(dispose.mock.calls).to.have.length(0)
    })

    it('add isolate on injector (relavent)', async () => {
      foo.mock.resetCalls()
      dispose.mock.resetCalls()
      await root.loader.restart([{
        id: '1',
        name: 'bar',
      }, {
        id: '2',
        name: 'qux',
      }, {
        id: '3',
        name: 'foo',
        isolate: {
          bar: true,
        },
      }])

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(foo.mock.calls).to.have.length(0)
      expect(dispose.mock.calls).to.have.length(1)
    })

    it('add isolate on injector (irrelavent)', async () => {
      foo.mock.resetCalls()
      dispose.mock.resetCalls()
      await root.loader.restart([{
        id: '1',
        name: 'bar',
      }, {
        id: '2',
        name: 'qux',
      }, {
        id: '3',
        name: 'foo',
        isolate: {
          bar: true,
          qux: true,
        },
      }])

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(foo.mock.calls).to.have.length(0)
      expect(dispose.mock.calls).to.have.length(0)
    })

    it('remove isolate on injector (relavent)', async () => {
      foo.mock.resetCalls()
      dispose.mock.resetCalls()
      await root.loader.restart([{
        id: '1',
        name: 'bar',
      }, {
        id: '2',
        name: 'qux',
      }, {
        id: '3',
        name: 'foo',
        isolate: {
          qux: true,
        },
      }])

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(foo.mock.calls).to.have.length(1)
      expect(dispose.mock.calls).to.have.length(0)
    })

    it('remove isolate on injector (irrelavent)', async () => {
      foo.mock.resetCalls()
      dispose.mock.resetCalls()
      await root.loader.restart([{
        id: '1',
        name: 'bar',
      }, {
        id: '2',
        name: 'qux',
      }, {
        id: '3',
        name: 'foo',
      }])

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(foo.mock.calls).to.have.length(0)
      expect(dispose.mock.calls).to.have.length(0)
    })

    it('add isolate on provider (relavent)', async () => {
      foo.mock.resetCalls()
      dispose.mock.resetCalls()
      await root.loader.restart([{
        id: '1',
        name: 'bar',
        isolate: {
          bar: 'custom',
        },
      }, {
        id: '2',
        name: 'qux',
      }, {
        id: '3',
        name: 'foo',
      }])

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(foo.mock.calls).to.have.length(0)
      expect(dispose.mock.calls).to.have.length(1)
    })

    it('add isolate on provider (irrelavent)', async () => {
      foo.mock.resetCalls()
      dispose.mock.resetCalls()
      await root.loader.restart([{
        id: '1',
        name: 'bar',
        isolate: {
          bar: 'custom',
        },
      }, {
        id: '2',
        name: 'qux',
        isolate: {
          qux: 'custom',
        },
      }, {
        id: '3',
        name: 'foo',
      }])

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(foo.mock.calls).to.have.length(0)
      expect(dispose.mock.calls).to.have.length(0)
    })

    it('remove isolate on provider (relavent)', async () => {
      foo.mock.resetCalls()
      dispose.mock.resetCalls()
      await root.loader.restart([{
        id: '1',
        name: 'bar',
      }, {
        id: '2',
        name: 'qux',
      }, {
        id: '3',
        name: 'foo',
      }])

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(foo.mock.calls).to.have.length(1)
      expect(dispose.mock.calls).to.have.length(0)
    })

    it('remove isolate on provider (irrelavent)', async () => {
      foo.mock.resetCalls()
      dispose.mock.resetCalls()
      await root.loader.restart([{
        id: '1',
        name: 'bar',
      }, {
        id: '2',
        name: 'qux',
      }, {
        id: '3',
        name: 'foo',
      }])

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(foo.mock.calls).to.have.length(0)
      expect(dispose.mock.calls).to.have.length(0)
    })
  })
})
