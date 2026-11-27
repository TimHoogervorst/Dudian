import {ui,el,link,api,pageNavigation} from './ui.js';
import {reader} from './reader.js';
import {signIn,accountMenu} from './account.js';
import {icon} from './icons.js';
const root=document.querySelector('main');
const nav=document.querySelector('#nav');
document.querySelector('.skip').onclick=event=>{event.preventDefault();root.focus();};
const tabs=[
  ['practice','Generate','pencil'],
  ['stories','Library','book'],
  ['library','Dictionary','dictionary'],
  ['progression','Progression','flag'],
];
for(const [route,name,mark] of tabs) {
  const a=link(name,'#/'+route);
  a.prepend(icon(mark));nav.append(a);
}
async function settingsPage(context) {
  const {root}=context;
  root.append(el('h1','Settings'));
  const jobs=[];
  for(const [title,sections] of [
    ['Your preferences',['reading','difficulty']],
    ['Shared story generation',['connection','artwork']]
  ]) {
    const group=el('section',null,'settings-group');
    group.append(el('h2',title));
    for(const section of sections){
      const slot=el('div',null,'settings-card');
      group.append(slot);
      jobs.push(ui.emit('settings-'+section,{...context,root:slot}).catch(error=>{
        if(!context.signal.aborted)slot.append(el('p',error.message));
      }));
    }
    root.append(group);
  }
  await Promise.all(jobs);
}
const pages={read:reader,settings:settingsPage};
const navigation=pageNavigation(error=>ui.notice(error.message));
async function render() {
  const session=navigation.next();
  const [route='home',...parts]=location.hash.replace(/^#\/?/,'').split('/').filter(Boolean).map(decodeURIComponent);
  const name=route==='reading'?'practice':route;
  const page=el('div',null,'page page-'+(Object.hasOwn(pages,name)||ui.routes.has(name)?name:'missing'));
  root.replaceChildren(page);ui.notice('');
  const tab=tabs.find(([route])=>route===name);
  document.title=(tab?.[1]??(name==='home'?'Reading desk':name.charAt(0).toUpperCase()+name.slice(1)))+' · Dudian';
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
  const username=await signIn();
  nav.after(accountMenu(username));
  const assets=await api('/api/features');
  for(const name of assets.css){ const l=document.createElement('link');l.rel='stylesheet';l.href='/features/'+encodeURIComponent(name);document.head.append(l); }
  for(const name of assets.js){const module=await import('/features/'+encodeURIComponent(name));await module.setup?.(ui);}
  window.addEventListener('hashchange',render);
  await render();
} catch(e){ui.notice(e.message);}
