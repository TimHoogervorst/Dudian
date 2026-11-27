import { afterEach } from 'node:test';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { initializeDatabase, transaction } from '../src/postgres/database.ts';
import { initializeAccount } from '../src/postgres/session.ts';
import { createAccount } from '../src/postgres/accounts.ts';
import { LearnerDatabase } from '../src/postgres/learner-database.ts';
import { ReadingStore } from '../src/store.ts';

const resources: {admin:Pool,pool:Pool,schema:string}[] = [];
afterEach(async()=>{
  for(const {admin,pool,schema} of resources.splice(0)) {
    await pool.end();
    try { await admin.query('DROP SCHEMA '+schema+' CASCADE'); }
    finally { await admin.end(); }
  }
});
export async function testPool() {
  const connectionString=process.env.TEST_DATABASE_URL;
  if(!connectionString) throw Error('Set TEST_DATABASE_URL to a PostgreSQL test database.');
  const admin=new Pool({connectionString,max:1});
  const schema='test_'+randomUUID().replaceAll('-','');
  await admin.query('CREATE SCHEMA '+schema);
  const pool=new Pool({connectionString,options:'-c search_path='+schema,max:6});
  resources.push({admin,pool,schema});
  await initializeDatabase(pool);
  return pool;
}

export async function testStore(pool?:Pool) {
  pool??=await testPool();
  const raw=randomBytes(32).toString('hex');
  const id=await transaction(pool,async client=>{
    const id=await createAccount(client,randomUUID(),'test-password');
    await initializeAccount(client,id);
    await client.query("INSERT INTO sessions VALUES ($1,$2,now()+interval '1 day')",
      [createHash('sha256').update(raw).digest('hex'),id]);
    return id;
  });
  const store=new ReadingStore(new LearnerDatabase(pool,id));
  const authenticatedFetch=(url:RequestInfo|URL,options:RequestInit={})=>{
    const headers=new Headers(options.headers);
    headers.set('Cookie','dudian_session='+raw);
    return fetch(url,{...options,headers});
  };
  return Object.assign(store,{fetch:authenticatedFetch});
}
