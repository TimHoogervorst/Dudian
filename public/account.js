import { api, el, link, ui } from './ui.js';
import { icon } from './icons.js';

export function accountMenu(username) {
  const menu=el('details',null,'account-menu');
  const trigger=el('summary');
  trigger.setAttribute('aria-label','Account for '+username);
  trigger.title='Account for '+username;
  trigger.append(icon('person'));
  const panel=el('div',null,'account-panel');
  const identity=el('div',null,'account-identity');
  identity.append(el('small','Signed in as'),el('strong',username));
  const settings=link('Settings','#/settings');
  settings.prepend(icon('settings'));
  settings.onclick=()=>{
    menu.open=false;
    document.querySelector('main').focus();
  };
  const logout=el('button','Log out');
  logout.type='button';
  logout.prepend(icon('logout'));
  logout.onclick=async()=>{
    logout.disabled=true;
    try { await api('/api/logout',{}); location.reload(); }
    catch(error) { logout.disabled=false; ui.notice(error.message); }
  };
  panel.append(identity,settings,logout);
  menu.append(trigger,panel);
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))menu.open=false;});
  menu.addEventListener('focusout',event=>{if(!menu.contains(event.relatedTarget))menu.open=false;});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && menu.open){menu.open=false;trigger.focus();}
  });
  function syncRoute(){
    menu.open=false;
    if(location.hash==='#/settings')settings.setAttribute('aria-current','page');
    else settings.removeAttribute('aria-current');
  }
  syncRoute();
  window.addEventListener('hashchange',syncRoute);
  return menu;
}
