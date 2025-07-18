import { type Context, Service } from '@cordisjs/core'
import type Schema from 'schemastery'

export { default as Schema, default as z } from 'schemastery'

declare module '@cordisjs/core' {
  interface Intercept {
    schema: Schema
  }
}

export class SchemaService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'schema')
  }

  [Service.check](ctx: Context) {
    ctx.scope.inject.schema.config?.(ctx.scope.config)
    return true
  }
}

export default SchemaService
