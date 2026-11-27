import { AsyncLocalStorage } from 'node:async_hooks';
import { types, type Pool, type PoolClient } from 'pg';
import { transaction } from './database.ts';

// Content and exercise payloads are decoded into their domain types by their readers.
const readerTypes: typeof types = {
  ...types,
  getTypeParser(oid,format) {
    if (oid===types.builtins.JSONB || oid===types.builtins.JSON) return String;
    if (oid===types.builtins.INT8 || oid===types.builtins.NUMERIC) return Number;
    return types.getTypeParser(oid,format);
  }
};

type Scope = {client: PoolClient, pending: Promise<unknown>};
export class LearnerDatabase {
  readonly pool: Pool;
  readonly accountId: string;
  private readonly active = new AsyncLocalStorage<Scope>();
  constructor(pool: Pool, accountId: string) {
    this.pool = pool;
    this.accountId = accountId;
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return this.scoped(work,true);
  }

  private async scoped<T>(work: () => Promise<T>, lockAccount: boolean): Promise<T> {
    if (this.active.getStore()) return work();
    return transaction(this.pool, async client => {
      await client.query('SET LOCAL ROLE dudian_learner');
      await client.query("SELECT set_config('dudian.account_id',$1,true)", [this.accountId]);
      // Grade and advance operations can read several rows before recording their result.
      if (lockAccount) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[this.accountId]);
      return this.active.run({client,pending:Promise.resolve()},work);
    });
  }

  prepare(sql: string) {
    const query = (...values: unknown[]) => this.scoped(async () => {
      const scope=this.active.getStore()!;
      const result=scope.pending.then(()=>scope.client.query({text:sql, values, types:readerTypes}));
      scope.pending=result;
      return result;
    },false);
    return {
      all: async (...values: unknown[]) => (await query(...values)).rows,
      get: async (...values: unknown[]) => (await query(...values)).rows[0],
      run: async (...values: unknown[]) => ({changes:(await query(...values)).rowCount})
    };
  }
}
export type Statement = ReturnType<LearnerDatabase['prepare']>;
