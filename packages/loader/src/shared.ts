import { Context, EffectScope } from '@cordisjs/core'
import { Dict, isNullable, valueMap } from 'cosmokit'
import { ModuleLoader } from './internal.ts'
import { interpolate } from './utils.ts'
import { Entry } from './entry.ts'
import { BaseLoader, LoaderFile } from './file.ts'

export * from './entry.ts'
export * from './file.ts'
export * from './group.ts'

declare module '@cordisjs/core' {
  interface Events {
    'config'(): void
    'exit'(signal: NodeJS.Signals): Promise<void>
    'loader/entry'(type: string, entry: Entry): void
    'loader/patch'(entry: Entry, legacy?: Entry.Options): void
  }

  interface Context {
    baseDir: string
    loader: Loader
  }

  interface EnvData {
    startTime?: number
  }

  // Theoretically, these properties will only appear on `ForkScope`.
  // We define them directly on `EffectScope` for typing convenience.
  interface EffectScope {
    entry?: Entry
  }
}

export namespace Loader {
  export interface Config {
    name: string
    initial?: Omit<Entry.Options, 'id'>[]
    filename?: string
  }
}

export abstract class Loader extends BaseLoader {
  // TODO auto inject optional when provided?
  static inject = {
    optional: ['loader'],
  }

  // process
  public envData = process.env.CORDIS_SHARED
    ? JSON.parse(process.env.CORDIS_SHARED)
    : { startTime: Date.now() }

  public params = {
    env: process.env,
  }

  public files: Dict<LoaderFile> = Object.create(null)
  public entries: Dict<Entry> = Object.create(null)
  public realms: Dict<Dict<symbol>> = Object.create(null)
  public delims: Dict<symbol> = Object.create(null)
  public internal?: ModuleLoader

  constructor(public ctx: Context, public config: Loader.Config) {
    super(ctx)
    this.ctx.set('loader', this)
    this.realms['#'] = ctx.root[Context.isolate]

    this.ctx.on('internal/update', (fork) => {
      if (!fork.entry) return
      fork.parent.emit('loader/entry', 'reload', fork.entry)
    })

    this.ctx.on('internal/before-update', (fork, config) => {
      if (!fork.entry) return
      if (fork.entry.suspend) return fork.entry.suspend = false
      const { schema } = fork.runtime
      fork.entry.options.config = schema ? schema.simplify(config) : config
      fork.entry.parent.write()
    })

    this.ctx.on('internal/fork', (fork) => {
      if (fork.parent[Entry.key]) {
        fork.entry = fork.parent[Entry.key]
        delete fork.parent[Entry.key]
      }
      // fork.uid: fork is created (we only care about fork dispose event)
      // fork.parent.runtime.plugin !== group: fork is not tracked by loader
      if (fork.uid || !fork.entry) return
      // fork is disposed by main scope (e.g. hmr plugin)
      // normal: ctx.dispose() -> fork / runtime dispose -> delete(plugin)
      // hmr: delete(plugin) -> runtime dispose -> fork dispose
      if (!this.ctx.registry.has(fork.runtime.plugin)) return
      fork.parent.emit('loader/entry', 'unload', fork.entry)
      fork.entry.options.disabled = true
      fork.entry.fork = undefined
      fork.entry.stop()
      fork.entry.parent.write()
    })
  }

  async start() {
    await this.init(process.cwd(), this.config)
    await super.start()
  }

  interpolate(source: any) {
    if (typeof source === 'string') {
      return interpolate(source, this.params, /\$\{\{(.+?)\}\}/g)
    } else if (!source || typeof source !== 'object') {
      return source
    } else if (Array.isArray(source)) {
      return source.map(item => this.interpolate(item))
    } else {
      return valueMap(source, item => this.interpolate(item))
    }
  }

  isTruthyLike(expr: any) {
    if (isNullable(expr)) return true
    return !!this.interpolate(`\${{ ${expr} }}`)
  }

  ensureId(options: Partial<Entry.Options>) {
    if (!options.id) {
      do {
        options.id = Math.random().toString(36).slice(2, 8)
      } while (this.entries[options.id])
    }
    return options.id!
  }

  async update(id: string, options: Partial<Omit<Entry.Options, 'id' | 'name'>>) {
    const entry = this.entries[id]
    if (!entry) throw new Error(`entry ${id} not found`)
    const override = { ...entry.options }
    for (const [key, value] of Object.entries(options)) {
      if (isNullable(value)) {
        delete override[key]
      } else {
        override[key] = value
      }
    }
    entry.parent.write()
    return entry.update(override)
  }

  resolveGroup(id: string | null) {
    const group = id ? this.entries[id]?.children : this
    if (!group) throw new Error(`entry ${id} not found`)
    return group
  }

  async create(options: Omit<Entry.Options, 'id'>, parent: string | null = null, position = Infinity) {
    const group = this.resolveGroup(parent)
    group.data.splice(position, 0, options as Entry.Options)
    group.write()
    return group._create(options)
  }

  remove(id: string) {
    const entry = this.entries[id]
    if (!entry) throw new Error(`entry ${id} not found`)
    entry.parent._remove(id)
    entry.parent.write()
  }

  transfer(id: string, parent: string | null, position = Infinity) {
    const entry = this.entries[id]
    if (!entry) throw new Error(`entry ${id} not found`)
    const source = entry.parent
    const target = this.resolveGroup(parent)
    source._unlink(entry.options)
    target.data.splice(position, 0, entry.options)
    source.write()
    target.write()
    if (source === target) return
    entry.parent = target
    if (!entry.fork) return
    const ctx = entry.createContext()
    entry.patch(entry.fork.parent, ctx)
  }

  locate(ctx = this[Context.current]) {
    return this._locate(ctx.scope).map(entry => entry.options.id)
  }

  _locate(scope: EffectScope): Entry[] {
    // root scope
    if (scope === scope.parent.scope) return []

    // runtime scope
    if (scope.runtime === scope) {
      return ([] as Entry[]).concat(...scope.runtime.children.map(child => this._locate(child)))
    }

    if (scope.entry) return [scope.entry]
    return this._locate(scope.parent.scope)
  }

  async import(name: string, baseURL = this.url) {
    if (this.internal) {
      return this.internal.import(name, baseURL, {})
    } else {
      return import(name)
    }
  }

  exit() {}

  unwrapExports(exports: any) {
    if (isNullable(exports)) return exports
    exports = exports.default ?? exports
    // https://github.com/evanw/esbuild/issues/2623
    // https://esbuild.github.io/content-types/#default-interop
    if (!exports.__esModule) return exports
    return exports.default ?? exports
  }

  _clearRealm(key: string, name: string) {
    const hasRef = Object.values(this.entries).some((entry) => {
      if (!entry.fork) return false
      const label = entry.options.isolate?.[key]
      if (!label) return false
      return name === entry.resolveRealm(label)
    })
    if (hasRef) return
    delete this.realms[name][key]
    if (!Object.keys(this.realms[name]).length) {
      delete this.realms[name]
    }
  }
}

export default Loader
