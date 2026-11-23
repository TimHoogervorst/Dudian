const listeners = new Map();
const routes = new Map();
export function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = text;
  if (className) element.className = className;
  return element;
}
export function link(label,href,className) {
  const a = el('a',label,className);
  a.href=href;
  return a;
}
export async function api(path,data,signal,keepalive=false) {
  const options = data===undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)};
  const res=await fetch(path,{...options,signal,keepalive});
  const result=await res.json();
  if(!res.ok) throw Error(result.error || 'Request failed.');
  return result;
}
// Finish writes from the previous page before a new page reads shared learner state.
export function pageNavigation(onError=()=>{}) {
  let close=()=>[], ready=Promise.resolve();
  return {next(){
    const closing=close();
    ready=Promise.allSettled([ready,...closing]).then(results=>{
      for(const result of results)if(result.status==='rejected')onError(result.reason);
    });
    const controller=new AbortController(), cleanups=[];
    close=()=>{
      controller.abort();
      return cleanups.map(cleanup=>{try{return cleanup();}catch(error){return Promise.reject(error);}});
    };
    return {signal:controller.signal,ready,onLeave(fn){if(!controller.signal.aborted)cleanups.push(fn);}};
  }};
}
export const ui={
  el,link,api,
  on(name,fn) { if(!listeners.has(name))listeners.set(name,[]); listeners.get(name).push(fn); },
  async emit(name,payload) {
    for(const fn of listeners.get(name)??[]) {
      if(payload.signal?.aborted)return;
      await fn(payload);
    }
  },
  route(name,fn) { routes.set(name,fn); },
  routes,
  notice(message) { document.querySelector('#notice').textContent=message; },
  navigate(path) { location.hash=path.startsWith('/')?path:'/'+path; },
};
