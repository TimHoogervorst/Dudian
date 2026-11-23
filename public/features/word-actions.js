import {api,el,link} from '../ui.js';
import {icon} from '../icons.js';

// getRandomValues also works on a phone visiting the host over plain LAN HTTP.
const actionId=()=>Array.from(crypto.getRandomValues(new Uint32Array(4)),x=>x.toString(16).padStart(8,'0')).join('');

export function setup(ui) {
  ui.on('settings',async ({root})=>{
    const {pinyin}=await api('/api/reader-preferences');
    const panel=el('section',null,'reader-pref');
    const label=el('label');
    const input=el('input');input.type='checkbox';input.checked=pinyin;
    input.onchange=async ()=>{
      input.disabled=true;
      try{await api('/api/reader-preferences',{pinyin:input.checked});}
      catch(error){input.checked=!input.checked;ui.notice(error.message);}
      finally{input.disabled=false;}
    };
    label.append(input,' Show pinyin above words');panel.append(el('h2','Reading'),label);root.append(panel);
  });
  async function bindWords(context){
    const {story,position,article,aside,definition}=context;
    const cover=position.chapter===-1;
    const [{pinyin},marked]=await Promise.all([api('/api/reader-preferences',undefined,context.signal),
      cover?api('/api/cover-marks?story='+encodeURIComponent(story.id),undefined,context.signal):[]]);
    if(context.signal.aborted)return;
    const chapter=position.chapter;
    let sequence=0;
    let pending;
    const saving=new Set();
    async function select(word,kind) {
      const action=++sequence;
      const paragraph=Number(word.dataset.paragraph),token=Number(word.dataset.token);
      const id=cover && kind==='difficulty'?'cover/'+story.id+'/'+token:actionId();
      const meaning=kind==='preview'?story.cover.tokens[token]:
        await api('/api/word-action',{storyId:story.id,chapter,paragraph,token,kind,id});
      if(cover && kind==='difficulty' && !meaning.cast)word.classList.add('marked-word');
      if(cover && meaning.color)context.onStrengthChange?.(meaning.text,meaning.color);
      if(action!==sequence || !article.isConnected)return;
      article.querySelector('.selected-word')?.classList.remove('selected-word');
      word.classList.add('selected-word');
      const form=el('strong',meaning.text,'dictionary-word');form.lang='zh-Hans';
      const mark=el('button');
      const isMarked=kind==='difficulty'||word.classList.contains('marked-word');
      mark.title=isMarked?'Marked for review':'Mark as difficult';
      mark.setAttribute('aria-label',mark.title);
      mark.append(icon('flag'));
      mark.disabled=isMarked;mark.onclick=()=>{mark.disabled=true;write(word,'difficulty').catch(()=>{mark.disabled=false;});};
      const entryKind=Array.from(meaning.text).length===1?'character':'word';
      const entry=link('','#/library/'+entryKind+'/entry/'+encodeURIComponent(meaning.text)+'/'+meaning.sense);
      entry.title='View '+entryKind+' in Library';
      entry.setAttribute('aria-label',entry.title);
      entry.append(icon('books'));
      const actions=el('div',null,'dictionary-actions');
      actions.append(mark,entry);
      if(meaning.cast)actions.replaceChildren(link('Meet 包包','#/cast','text-link'));
      definition.replaceChildren(form,el('p',meaning.pinyin,'dictionary-reading'),el('p',meaning.meaning,'dictionary-meaning'),actions);
      aside.classList.add('has-word');
      const dismiss=el('button','×','dictionary-close');
      dismiss.setAttribute('aria-label','Close dictionary');
      dismiss.onclick=()=>{word.focus({preventScroll:true});aside.classList.remove('has-word');};
      definition.append(dismiss);
    }
    function write(word,kind) {
      const request=select(word,kind);
      saving.add(request);
      request.then(()=>saving.delete(request),error=>{saving.delete(request);ui.notice(error.message);});
      return request;
    }
    function action(word,kind) { void write(word,kind); }
    function clearPending() {
      if(pending)clearTimeout(pending.timer);
      pending=undefined;
    }
    function tap(word) {
      if(pending?.word===word){clearPending();action(word,'difficulty');return;}
      if(pending){const previous=pending.word;clearPending();action(previous,'lookup');}
      pending={word,timer:setTimeout(()=>{clearPending();action(word,'lookup');},300)};
    }
    context.flushWordActions=async ()=>{
      if(pending){const word=pending.word;clearPending();action(word,'lookup');}
      await Promise.all(saving);
    };
    for(const span of article.querySelectorAll('[data-word]')) {
      const index=Number(span.dataset.token);
      const token=cover?story.cover.tokens[index]:story.chapters[chapter].paragraphs[Number(span.dataset.paragraph)][index];
      if(cover){
        if(marked.includes(index))span.classList.add('marked-word');
        span.onpointerenter=e=>{if(e.pointerType==='mouse')action(span,'preview');};
        span.onfocus=()=>action(span,'preview');
      }
      span.tabIndex=0;span.setAttribute('role','button');span.setAttribute('aria-label','Look up '+token.text);
      if(pinyin && token.pinyin) {
        const ruby=el('ruby',token.text);ruby.append(el('rt',token.pinyin));span.replaceChildren(ruby);
      }
      span.onclick=()=>tap(span);
      span.onkeydown=e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();action(span,'lookup');}
      };
    }
    // A navigation can occur before the second-tap window expires.
    context.onLeave(context.flushWordActions);
  }
  ui.on('reader',bindWords);
  ui.on('cover-reader',bindWords);
  ui.on('library',async ({root,parts})=>{
    if(parts[0]!=='character'||parts[1]!=='entry'||!parts[2])return;
    const rows=await api('/api/usage-history?character='+encodeURIComponent(parts[2]));
    if(!rows.length)return;
    const section=el('section',null,'usage-history');section.append(el('h2','Marked in context'));
    for(const row of rows) {
      const item=el('p');item.append(el('strong',row.word+' · '),el('span',row.sentence),el('br'),
        row.chapter===-1?link(row.title+' · Cover','#/introduction/'+encodeURIComponent(row.storyId)):
          link(row.title,'#/read/'+encodeURIComponent(row.storyId)+'/'+row.chapter));
      section.append(item);
    }
    root.append(section);
  });
}
