import { createHash, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const auth = 'https://auth.openai.com';
const resource = 'https://api.openai.com/v1';
const permission = 'chatgpt.tokens.use.direct';
const fresh = () => randomBytes(32).toString('base64url');

interface Grant {
  client: string;
  subject: string;
  email?: string;
  access: string;
  refresh: string;
  expires: number;
}
interface Installation { host: string; grant?: Grant }

async function checked(response: Response, action: string) {
  if (!response.ok) throw new Error(action + ' failed (HTTP ' + response.status + '). Check your ChatGPT plan, usage limit, and connection in Settings.');
  return response;
}

async function completedText(response: Response) {
  // Each SSE data event is a JSON record. Only a completed response is usable.
  const records = (await response.text()).split(/\r?\n\r?\n/);
  let output = '';
  for (const record of records) {
    const data = record.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') continue;
    const event = JSON.parse(data);
    if (event.type === 'response.output_text.delta') output += event.delta;
    if (event.type === 'response.completed' && output) return output;
    if (['response.failed', 'response.incomplete', 'error'].includes(event.type)) {
      throw new Error('ChatGPT returned ' + event.type + '. Check plan usage in Settings and retry.');
    }
  }
  throw new Error('ChatGPT ended the stream before completing the response. Retry the request.');
}

export class PlanConnection {
  private path: string;
  private install: Installation;
  private pending?: { state: string, nonce: string, verifier: string, redirect: string, expires: number };
  private request: typeof fetch;
  private refreshing?: Promise<Grant>;
  constructor(directory: string, request: typeof fetch = fetch) {
    this.request = request;
    mkdirSync(directory, {recursive: true, mode: 0o700});
    this.path = join(directory, 'chatgpt-registration.json');
    this.install = existsSync(this.path)
      ? JSON.parse(readFileSync(this.path, 'utf8'))
      : {host: 'urn:uuid:' + randomUUID()};
    if (!existsSync(this.path)) this.save(this.install);
  }
  private save(installation: Installation) {
    const tmp = this.path + '.' + randomUUID();
    writeFileSync(tmp, JSON.stringify(installation), {mode: 0o600, flag: 'wx'});
    renameSync(tmp, this.path);
    this.install = installation;
  }
  begin(redirect: string) {
    const attempt = {state: fresh(), nonce: fresh(), verifier: fresh(), redirect, expires: Date.now() + 600000};
    this.pending = attempt;
    const url = new URL('/api/accounts/authorize', auth);
    url.search = new URLSearchParams({
      client_id: this.install.grant?.client ?? 'dynamic_agent_client',
      ext_agent_host_id: this.install.host,
      response_type: 'code', scope: 'openid profile email offline_access resource.invoke ' + permission,
      resource, redirect_uri: redirect, state: attempt.state, nonce: attempt.nonce,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(attempt.verifier).digest('base64url')
    }).toString();
    if (!this.install.grant) url.searchParams.set('agent_name_hint', 'Street Talk');
    return url;
  }
  async complete(url: URL) {
    const attempt = this.pending;
    if (!attempt || attempt.expires < Date.now() || url.searchParams.get('state') !== attempt.state) {
      throw new Error('Invalid or expired sign-in. Start again from Settings.');
    }
    this.pending = undefined;
    if (url.searchParams.has('error')) throw new Error('Plan authorization was declined. You can try again from Settings.');
    const previous = this.install.grant;
    const client = url.searchParams.get('client_id') ?? previous?.client;
    const code = url.searchParams.get('code');
    if (!code || !client || client === 'dynamic_agent_client' || (previous && previous.client !== client)) {
      throw new Error('Registration incomplete. Start a fresh authorization.');
    }
    const tokens = await this.tokens({grant_type:'authorization_code',client_id:client,code,
      code_verifier:attempt.verifier,redirect_uri:attempt.redirect});
    const identity = await this.identity(tokens.id_token, client, attempt.nonce);
    if (previous && identity.sub !== previous.subject) throw new Error('Use the originally connected ChatGPT account.');
    this.save({...this.install, grant: this.grant(tokens, {client,subject:identity.sub,email:identity.email})});
  }
  private async tokens(fields: Record<string,string>) {
    const response = await this.request(auth + '/api/accounts/oauth/token', {method:'POST',
      body:new URLSearchParams({...fields,resource}),signal:AbortSignal.timeout(30000)});
    return (await checked(response, 'Authorization')).json();
  }
  private async identity(token: string, client: string, nonce: string) {
    if (typeof token !== 'string') throw new Error('Missing signed OpenAI identity.');
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed OpenAI identity.');
    const decode = (value: string) => JSON.parse(Buffer.from(value,'base64url').toString());
    const header = decode(parts[0]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Unsupported identity signature.');
    const keys = await (await checked(await this.request(auth + '/.well-known/jwks.json', {signal:AbortSignal.timeout(30000)}),'Identity verification')).json();
    const key = keys.keys.find((key: {kid:string,kty:string}) => key.kid === header.kid && key.kty === 'RSA');
    if (!key || !verify('RSA-SHA256', Buffer.from(parts.slice(0,2).join('.')),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url'))) {
      throw new Error('Invalid OpenAI identity signature.');
    }
    const claims = decode(parts[1]);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== auth || !audience.includes(client) || claims.nonce !== nonce || !Number.isFinite(claims.exp) ||
        claims.exp <= Date.now()/1000 || typeof claims.sub !== 'string' || !claims.sub ||
        (audience.length > 1 && claims.azp !== client) || (claims.nbf && claims.nbf > Date.now()/1000 + 5)) {
      throw new Error('OpenAI identity did not match this sign-in.');
    }
    return claims;
  }
  private grant(tokens: Record<string,any>, identity: Pick<Grant,'client'|'subject'|'email'>, old?: Grant): Grant {
    if (!(tokens.scope ?? (old ? permission : '')).split(/\s+/).includes(permission)) throw new Error('ChatGPT plan permission was not granted.');
    const refresh = tokens.refresh_token ?? old?.refresh;
    if (typeof tokens.access_token !== 'string' || !tokens.access_token || typeof refresh !== 'string' ||
        !refresh || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 || String(tokens.token_type).toLowerCase() !== 'bearer') {
      throw new Error('OpenAI returned incomplete plan credentials. Reconnect in Settings.');
    }
    return {...identity,access:tokens.access_token,refresh,expires:Date.now()+1000*tokens.expires_in};
  }
  get connected() { return Boolean(this.install.grant); }
  private async credentials() {
    const grant = this.install.grant;
    if (!grant) throw new Error('Choose Continue with ChatGPT in Settings on your Docker host.');
    if (grant.expires > Date.now()+60000) return grant;
    if (!this.refreshing) this.refreshing = this.tokens({grant_type:'refresh_token',refresh_token:grant.refresh,client_id:grant.client})
      .then(tokens => {
        if (this.install.grant !== grant) throw new Error('Authorization changed. Retry with the current session.');
        const renewed = this.grant(tokens, grant, grant);
        this.save({...this.install,grant:renewed});
        return renewed;
      }).finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  async generateText(prompt: string, instructions = 'Return only the requested text.') {
    const {access} = await this.credentials();
    const headers = {Authorization:'Bearer ' + access,'Content-Type':'application/json'};
    const models = await (await checked(await this.request(resource+'/models',{headers,signal:AbortSignal.timeout(30000)}),'Model selection')).json();
    const model = models.models?.find((model:{visibility:string,slug:string}) => model.visibility === 'list' && model.slug)?.slug;
    if (!model) throw new Error('This ChatGPT account has no available plan models.');
    const result = await this.request(resource+'/responses',{method:'POST',headers,signal:AbortSignal.timeout(240000),
      body:JSON.stringify({model,instructions,input:[{role:'user',content:prompt}],store:false,stream:true})});
    return completedText(await checked(result,'Generation'));
  }
}

let defaultConnection: PlanConnection;
export function connection() {
  return defaultConnection ??= new PlanConnection(process.env.DATA_DIR || fileURLToPath(new URL('../runtime/',import.meta.url)));
}
export const generateText = (prompt: string, instructions?: string) => connection().generateText(prompt,instructions);
