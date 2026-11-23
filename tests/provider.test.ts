import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlanConnection } from '../src/provider.ts';
import { passage } from '../src/features/provider.ts';
import { generateKeyPairSync, sign } from 'node:crypto';

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
    if (path.endsWith('/models')) return Response.json({models:[{visibility:'list',slug:'eligible'}]});
    assert.equal(path,'/v1/responses');
    const call = JSON.parse(String(options?.body));
    assert.equal(call.model,'eligible');
    assert.equal(call.store,false);
    assert.equal(call.stream,true);
    assert.ok(Array.isArray(call.input));
    return new Response('data: {"type":"response.output_text.delta","delta":"我喝茶。"}\n\ndata: '+JSON.stringify({type:terminal})+'\n\n');
  };
  const connection = new PlanConnection(dir, request);
  const callback = new URL('http://127.0.0.1:14551/auth/callback');
  const auth = connection.begin(callback.href);
  nonce = auth.searchParams.get('nonce')!;
  callback.search = new URLSearchParams({state:auth.searchParams.get('state')!,code:'test',client_id:'oaiapp_fixture'}).toString();
  await connection.complete(callback);
  const resumed = new PlanConnection(dir, request);
  assert.equal(await resumed.generateText('One passage'), '我喝茶。');
  terminal = 'response.incomplete';
  await assert.rejects(resumed.generateText('One passage'), /incomplete/);
  assert.equal(resumed.begin(callback.origin+'/auth/callback').searchParams.get('client_id'), 'oaiapp_fixture');
});
