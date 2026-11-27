import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool, PoolClient } from 'pg';
import { accountInput, createAccount, verifyPassword } from './accounts.ts';
import { transaction } from './database.ts';
import { seedStory } from '../seed.ts';
import { HttpError } from '../store.ts';

export async function initializeAccount(client: PoolClient, id: string) {
  await client.query('INSERT INTO stories VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
    [seedStory.id,seedStory.title,JSON.stringify(seedStory),Date.now()]);
  await client.query("INSERT INTO art_settings(id,enabled,key) VALUES(1,1,'') ON CONFLICT DO NOTHING");
  await client.query("INSERT INTO art_provider VALUES(1,'subscription') ON CONFLICT DO NOTHING");
  await client.query("INSERT INTO cover_models VALUES(1,'gpt-image-2.5-sunburst','') ON CONFLICT DO NOTHING");
  await client.query('INSERT INTO reader_preferences(account_id,id,pinyin) VALUES($1,1,0) ON CONFLICT DO NOTHING',[id]);
  await client.query('INSERT INTO score_tracking(account_id,id,started_at) VALUES($1,1,$2) ON CONFLICT DO NOTHING',[id,Date.now()]);
  await client.query('INSERT INTO milestone_progress(account_id,id,reached,last_change) VALUES($1,1,0,0) ON CONFLICT DO NOTHING',[id]);
}

const cookieName = 'dudian_session';
const lifetime = 30 * 86400;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
function token(req: IncomingMessage) {
  return req.headers.cookie?.match(/(?:^|;\s*)dudian_session=([a-f0-9]{64})(?:;|$)/)?.[1];
}
function cookie(res: ServerResponse, value: string, seconds: number) {
  const secure=process.env.COOKIE_SECURE==='true' ? '; Secure' : '';
  res.setHeader('Set-Cookie',cookieName+'='+value+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+seconds+secure);
}
export async function sessionAccount(pool: Pool, req: IncomingMessage) {
  const value = token(req);
  if (!value) return null;
  return (await pool.query(`SELECT a.id,a.username FROM sessions s JOIN accounts a ON a.id=s.account_id
    WHERE s.token_hash=$1 AND s.expires_at>now()`,[digest(value)])).rows[0] ?? null;
}
export async function authenticate(pool: Pool, path: string, req: IncomingMessage, res: ServerResponse, input: any) {
  if (path==='/api/logout') {
    const value=token(req);
    if (value) await pool.query('DELETE FROM sessions WHERE token_hash=$1',[digest(value)]);
    cookie(res,'',0);
    return {ok:true};
  }
  let credentials;
  try { credentials=accountInput(input?.username,input?.password); }
  catch (error) { throw new HttpError(400,(error as Error).message); }
  const {username,password}=credentials;
  const raw=randomBytes(32).toString('hex');
  const account=await transaction(pool,async client=>{
    let account;
    if (path==='/api/register') {
      try { account={id:await createAccount(client,username,password),username}; }
      catch (error) {
        if ((error as {code?:string}).code==='23505') throw new HttpError(409,'That username is already taken.');
        throw error;
      }
      await initializeAccount(client,account.id);
    } else {
      const row=(await client.query('SELECT id,username,password_hash FROM accounts WHERE lower(username)=lower($1)',[username])).rows[0];
      if (!row || !await verifyPassword(password,row.password_hash)) throw new HttpError(401,'Incorrect username or password.');
      account={id:row.id,username:row.username};
    }
    await client.query("DELETE FROM sessions WHERE account_id=$1 AND expires_at<=now()",[account.id]);
    await client.query("INSERT INTO sessions VALUES ($1,$2,now()+interval '30 days')",[digest(raw),account.id]);
    return account;
  });
  cookie(res,raw,lifetime);
  return {username:account.username};
}
