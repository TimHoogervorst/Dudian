import {ui,el,link,api} from './ui.js';
import {reader} from './reader.js';
const root=document.querySelector('main');
const nav=document.querySelector('#nav');
for(const [name,mark] of [['Practice','◈'],['Library','▤'],['Settings','⚙']]) {
  const a=link(name,'#/'+name.toLowerCase());
  const icon=el('span',mark,'nav-icon');icon.setAttribute('aria-hidden','true');a.prepend(icon);nav.append(a);
}
function home({root}) {
  const title=el('header',null,'page-heading');
  title.append(el('p','Mandarin reading practice','overline'),el('h1','Your reading week'));
  const shelf=el('section',null,'home-hero');
  const art=el('div',null,'tea-art');art.setAttribute('role','img');art.setAttribute('aria-label','A rainy afternoon at a neighborhood tea shop');
  const copy=el('div',null,'hero-copy');
  copy.append(el('p','Featured story','overline'),el('h2','At the tea shop'),link('Start reading  →','#/read/tea-shop','button'));
  shelf.append(art,copy);root.append(title,shelf);
}
function practice({root}) {
  root.append(el('h1','Practice'));
  const options=el('section',null,'practice-options');
  options.append(link('Reading  →','#/reading','practice-choice'));
  for (const label of ['Speaking','Listening']) {const button=el('button',label,'practice-choice');button.disabled=true;options.append(button);}
  root.append(options);
}
const pages={home,practice,read:reader,library:({root})=>root.append(el('h1','Library')),settings:({root})=>root.append(el('h1','Settings')),reading:({root})=>{
  root.append(el('h1','Reading'),link('Open At the tea shop  →','#/read/tea-shop','button'));
}};
let epoch=0;
async function render() {
  const current=++epoch;
  const [name='home',...parts]=location.hash.replace(/^#\/?/,'').split('/').filter(Boolean).map(decodeURIComponent);
  const page=el('div',null,'page page-'+(Object.hasOwn(pages,name)||ui.routes.has(name)?name:'missing'));
  root.replaceChildren(page);ui.notice('');
  document.title=(name==='home'?'Reading desk':name.charAt(0).toUpperCase()+name.slice(1))+' · Street Talk';
  for(const a of nav.children) {
    if(a.hash==='#/'+name)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  }
  try {
    await ui.emit('leave',{});
    const draw=ui.routes.get(name)??(Object.hasOwn(pages,name)?pages[name]:null);
    if(!draw)throw Error('Page not found.');
    await draw({root:page,parts});
    if(current!==epoch)return;
    if(name!=='read')await ui.emit(name,{root:page,parts});
  } catch(e){ if(current===epoch) {page.replaceChildren(el('h1','Unable to open page'),el('p',e.message),link('Back to reading desk','#/home','text-link'));} }
}
window.addEventListener('unhandledrejection',e=>{ui.notice(e.reason?.message||'The action could not be completed.');});
try {
  const assets=await api('/api/features');
  for(const name of assets.css){ const l=document.createElement('link');l.rel='stylesheet';l.href='/features/'+encodeURIComponent(name);document.head.append(l); }
  for(const name of assets.js){const module=await import('/features/'+encodeURIComponent(name));await module.setup?.(ui);}
  window.addEventListener('hashchange',render);
  await render();
} catch(e){ui.notice(e.message);}

