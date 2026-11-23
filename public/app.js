import {ui,el,link,api,pageNavigation} from './ui.js';
import {reader} from './reader.js';
import {icon} from './icons.js';
const root=document.querySelector('main');
const nav=document.querySelector('#nav');
document.querySelector('.skip').onclick=event=>{event.preventDefault();root.focus();};
for(const [name,mark] of [['Practice','book'],['Library','books'],['Settings','settings']]) {
  const a=link(name,'#/'+name.toLowerCase());
  a.prepend(icon(mark));nav.append(a);
}
const pages={read:reader,settings:({root})=>root.append(el('h1','Settings'))};
const navigation=pageNavigation(error=>ui.notice(error.message));
async function render() {
  const session=navigation.next();
  const [route='home',...parts]=location.hash.replace(/^#\/?/,'').split('/').filter(Boolean).map(decodeURIComponent);
  const name=route==='reading'?'practice':route;
  const page=el('div',null,'page page-'+(Object.hasOwn(pages,name)||ui.routes.has(name)?name:'missing'));
  root.replaceChildren(page);ui.notice('');
  document.title=(name==='home'?'Reading desk':name.charAt(0).toUpperCase()+name.slice(1))+' · Dudian';
  for(const a of nav.children) {
    if(a.hash==='#/'+name)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  }
  try {
    await session.ready;
    if(session.signal.aborted)return;
    const draw=ui.routes.get(name)??(Object.hasOwn(pages,name)?pages[name]:null);
    if(!draw)throw Error('Page not found.');
    const context={root:page,parts,...session};
    await draw(context);
    if(name!=='read')await ui.emit(name,context);
  } catch(e){ if(!session.signal.aborted) {page.replaceChildren(el('h1','Unable to open page'),el('p',e.message),link('Back to reading desk','#/home','text-link'));} }
}
window.addEventListener('unhandledrejection',e=>{ui.notice(e.reason?.message||'The action could not be completed.');});
try {
  const assets=await api('/api/features');
  for(const name of assets.css){ const l=document.createElement('link');l.rel='stylesheet';l.href='/features/'+encodeURIComponent(name);document.head.append(l); }
  for(const name of assets.js){const module=await import('/features/'+encodeURIComponent(name));await module.setup?.(ui);}
  window.addEventListener('hashchange',render);
  await render();
} catch(e){ui.notice(e.message);}
