import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlanConnection } from '../src/provider.ts';
import { createSignInServer, passage } from '../src/features/provider.ts';
import { generateKeyPairSync, sign } from 'node:crypto';
import { request, type IncomingMessage } from 'node:http';

test('host consent form preserves its local origin and permits the OpenAI handoff', async t => {
  const server = createSignInServer(() => new PlanConnection(mkdtempSync(join(tmpdir(), 'street-talk-form-'))));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = 'http://127.0.0.1:' + address.port;
  const host = '127.0.0.1:14551';
  function visit(path: string, method = 'GET', origin = 'http://' + host) {
    return new Promise<IncomingMessage>((resolve,reject) => {
      request(url + path, {method, headers:{host,origin}}, res => {
        res.resume();
        resolve(res);
      }).on('error',reject).end();
    });
  }
  const page = await visit('/');
  assert.equal(page.statusCode, 200);
  assert.equal(page.headers['referrer-policy'], 'same-origin');
  assert.match(String(page.headers['content-security-policy']), /form-action 'self' https:\/\/auth\.openai\.com/);
  const post = await visit('/begin','POST');
  assert.equal(post.statusCode, 303);
  assert.equal(new URL(post.headers.location!).origin, 'https://auth.openai.com');
  assert.equal((await visit('/begin','POST','null')).statusCode, 403);
  assert.equal((await visit('/begin')).headers.location, '/');
});

test('a passage preserves compound boundaries and rejects a block of text', () => {
  const entries = [{kind:'word',text:'银行'}, {kind:'punctuation',text:'。'}];
  assert.deepEqual(passage(JSON.stringify({entries})), entries);
  assert.throws(() => passage('我在银行。'), /Try again/);
  assert.throws(() => passage('{"entries":[{"kind":"word","text":"我在银行。"}]}'), /Try again/);
});

test('a new installation prompts for consent before requesting a passage', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'street-talk-'));
  const connection = new PlanConnection(dir);
  await assert.rejects(connection.generateText('hello'), /Continue with ChatGPT/);
  const first = connection.begin('http://127.0.0.1:14551/auth/callback');
  const next = new PlanConnection(dir).begin('http://127.0.0.1:14551/auth/callback');
  assert.equal(first.origin, 'https://auth.openai.com');
  assert.equal(first.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(first.searchParams.get('ext_agent_host_id'), next.searchParams.get('ext_agent_host_id'));
  assert.notEqual(first.searchParams.get('code_challenge'), next.searchParams.get('code_challenge'));
  await assert.rejects(connection.complete(new URL('http://127.0.0.1/?state=unrelated')), /expired|invalid/i);
});

test('a validated registration survives restart and consumes only a completed text response', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'street-talk-'));
  const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
  let nonce = '';
  let terminal = 'response.completed';
  let details={};
  let httpFailure=false;
  let expectedModel='eligible';
  const request: typeof fetch = async (input, options) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/oauth/token')) {
      const form = options?.body as URLSearchParams;
      assert.equal(form.get('client_id'), 'oaiapp_fixture');
      const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
      const data = encode({alg:'RS256',kid:'k'}) + '.' + encode({iss:'https://auth.openai.com',
        sub:'reader', aud:['oaiapp_fixture'], nonce, exp:Date.now()/1000+3600, iat:Date.now()/1000});
      return Response.json({id_token:data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url'),
        token_type:'Bearer',scope:'resource.invoke chatgpt.tokens.use.direct',access_token:'test', refresh_token:'renew',expires_in:3600});
    }
    if (path.endsWith('/jwks.json')) return Response.json({keys:[{kid:'k',...publicKey.export({format:'jwk'})}]});
    if (path.endsWith('/models')) return Response.json({models:['eligible','alternate'].map(slug=>({visibility:'list',slug}))});
    assert.equal(path,'/v1/responses');
    const call = JSON.parse(String(options?.body));
    assert.equal(call.model,expectedModel);
    assert.equal(call.store,false);
    assert.equal(call.stream,true);
    assert.ok(Array.isArray(call.input));
    if(httpFailure)return Response.json({error:{code:'rate_limit',message:'Try again later.'}},
      {status:429,headers:{'x-request-id':'req_http'}});
    return new Response('data: {"type":"response.output_text.delta","delta":"我喝茶。"}\n\ndata: '+JSON.stringify({type:terminal,...details})+'\n\n',
      {headers:{'x-request-id':'req_stream'}});
  };
  const connection = new PlanConnection(dir, request);
  const callback = new URL('http://127.0.0.1:14551/auth/callback');
  const auth = connection.begin(callback.href);
  nonce = auth.searchParams.get('nonce')!;
  callback.search = new URLSearchParams({state:auth.searchParams.get('state')!,code:'test',client_id:'oaiapp_fixture'}).toString();
  await connection.complete(callback);
  const resumed = new PlanConnection(dir, request);
  assert.equal(await resumed.generateText('One passage'), '我喝茶。');
  await assert.rejects(resumed.selectTextModel('missing'),/available story text model/);
  await resumed.selectTextModel('alternate');
  expectedModel='alternate';
  assert.equal(await new PlanConnection(dir,request).generateText('One passage'),'我喝茶。');
  terminal = 'response.incomplete';
  details={response:{incomplete_details:{reason:'max_output_tokens'}}};
  await assert.rejects(resumed.generateText('One passage'), /incomplete.*max_output_tokens.*req_stream/);
  terminal='error';details={code:'server_error',message:'Please retry.'};
  await assert.rejects(resumed.generateText('One passage'), /server_error.*Please retry.*req_stream/);
  terminal='response.failed';details={response:{error:{code:'invalid_request',message:'Rejected Bearer token123'}}};
  await assert.rejects(resumed.generateText('One passage'), /invalid_request.*Rejected \[redacted\].*req_stream/);
  httpFailure=true;
  await assert.rejects(resumed.generateText('One passage'), /HTTP 429.*rate_limit.*Try again later.*req_http/);
  assert.equal(resumed.begin(callback.origin+'/auth/callback').searchParams.get('client_id'), 'oaiapp_fixture');
});
