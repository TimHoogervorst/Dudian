import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { connection, generateText } from '../provider.ts';

const port = 14551;
const origin = 'http://127.0.0.1:' + port;
let ready: Promise<void> | undefined;

function startHostSignIn() {
  if (ready) return ready;
  let session: string | undefined;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'");
    if (req.headers.host !== '127.0.0.1:' + port) {
      res.writeHead(403).end('Open Settings on the Docker host.');
      return;
    }
    const url = new URL(req.url ?? '/',origin);
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.setHeader('Content-Type','text/html; charset=utf-8');
        res.end('<!doctype html><html lang="en"><title>Connect Street Talk</title><main><h1>Connect Street Talk</h1><p>Allow this local app to use your ChatGPT plan for Chinese stories.</p><form action="/begin" method="post"><button data-oai-siwc-button>Continue with ChatGPT</button></form></main></html>');
      } else if (req.method === 'POST' && url.pathname === '/begin' && req.headers.origin === origin) {
        session = randomBytes(32).toString('base64url');
        const location = connection().begin(origin + '/auth/callback');
        res.setHeader('Set-Cookie','streettalk_signin='+session+'; HttpOnly; SameSite=Lax; Max-Age=600; Path=/auth/callback');
        res.writeHead(303,{location:location.href}).end();
      } else if (req.method === 'GET' && url.pathname === '/auth/callback') {
        if (!session || !req.headers.cookie?.split(/;\s*/).includes('streettalk_signin='+session)) {
          throw new Error('Sign-in must finish in the browser that started it.');
        }
        await connection().complete(url);
        session = undefined;
        res.setHeader('Set-Cookie','streettalk_signin=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/auth/callback');
        res.setHeader('Content-Type','text/plain; charset=utf-8');
        res.end('Street Talk is connected. Return to Settings and generate a test passage.');
      } else res.writeHead(404).end();
    } catch (error) {
      res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'}).end(error instanceof Error ? error.message : 'Sign-in failed.');
    }
  });
  ready = new Promise<void>((resolve,reject) => {
    server.once('error',reject);
    server.listen(port, process.env.SIWC_BIND || '127.0.0.1',resolve);
  }).catch(error => {ready=undefined; throw error;});
  return ready;
}

export function passage(text: string) {
  try {
    const {entries} = JSON.parse(text);
    if (!Array.isArray(entries) || !entries.length || entries.length > 300 ||
        !entries.every(item => item && typeof item.text === 'string' &&
          ((item.kind === 'word' && /^\p{Script=Han}+$/u.test(item.text)) ||
           (item.kind === 'punctuation' && /^\p{P}+$/u.test(item.text))))) {
      throw new Error();
    }
    return entries.map(({kind,text}:{kind:string,text:string}) => ({kind,text}));
  } catch {
    throw new Error('The passage did not contain the requested Chinese word and punctuation entries. Try again.');
  }
}

export default async function provider(ctx: any) {
  const {req,url,json} = ctx;
  if (url.pathname === '/api/provider/status' && req.method === 'GET') {
    await startHostSignIn();
    json(200,{connected:connection().connected,hostSignIn:origin});
  } else if (url.pathname === '/api/provider/passage' && req.method === 'POST') {
    const raw = await generateText('Write two short sentences about tea in simplified Chinese for an HSK 1 learner. Return only JSON {"entries":[{"kind":"word","text":"我"},{"kind":"punctuation","text":"。"}]}. Each Chinese word or punctuation mark is a separate entry, in reading order.');
    json(200,{entries:passage(raw)});
  } else return false;
  return true;
}
