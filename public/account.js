import { api, el } from './ui.js';

export async function signIn() {
  const session=await api('/api/session');
  if(session.username) return session.username;
  const dialog=el('dialog',null,'account-dialog');
  dialog.setAttribute('aria-labelledby','account-title');
  const form=el('form');
  const title=el('h1','Log in to Dudian');
  title.id='account-title';
  const username=el('input'), password=el('input');
  username.required=password.required=true;
  username.autocomplete='username';
  username.maxLength=40;
  password.type='password';
  password.autocomplete='current-password';
  const nameLabel=el('label','Username'), passwordLabel=el('label','Password');
  nameLabel.append(username);passwordLabel.append(password);
  const error=el('p');
  error.setAttribute('role','alert');
  const submit=el('button','Log in'),toggle=el('button','Create an account');
  toggle.type='button';
  let register=false;
  toggle.onclick=()=>{
    register=!register;
    title.textContent=register?'Create your account':'Log in to Dudian';
    submit.textContent=register?'Create account':'Log in';
    toggle.textContent=register?'Use an existing account':'Create an account';
    password.autocomplete=register?'new-password':'current-password';
    password.minLength=register?8:1;
    error.textContent='';
  };
  form.append(title,nameLabel,passwordLabel,error,submit,toggle);
  dialog.append(form);
  document.body.append(dialog);
  dialog.oncancel=event=>event.preventDefault();
  dialog.showModal();
  username.focus();
  return new Promise(resolve=>{
    form.onsubmit=async event=>{
      event.preventDefault();
      submit.disabled=toggle.disabled=true;
      try {
        const result=await api(register?'/api/register':'/api/login',{username:username.value,password:password.value});
        dialog.close();dialog.remove();resolve(result.username);
      } catch(e) {
        error.textContent=e.message;
      } finally {submit.disabled=toggle.disabled=false;}
    };
  });
}
