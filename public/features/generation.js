const levels = ['easy','medium','hard'];
const title = value => value[0].toUpperCase()+value.slice(1);
function difficultySelect(ui,value) {
  const select=ui.el('select');
  for (const level of levels) {
    const option=ui.el('option',title(level));
    option.value=level;
    select.append(option);
  }
  select.value=value;
  return select;
}
function field(ui,text,control) {
  const label=ui.el('label',text);
  label.append(control);
  return label;
}
export function setup(ui) {
  const {el,api,link}=ui;
  ui.on('settings',async({root})=>{
    const preferences=await api('/api/story-preferences');
    const form=el('form',null,'story-settings');
    form.append(el('h2','Story difficulty'));
    const difficulty=difficultySelect(ui,preferences.difficulty);
    form.append(field(ui,'Default difficulty',difficulty),el('p','Maximum new characters in a story'));
    const inputs={};
    for (const level of levels) {
      const input=el('input');
      input.type='number'; input.min='0'; input.step='1'; input.required=true;
      input.value=String(preferences.ceilings[level]);
      inputs[level]=input;
      form.append(field(ui,title(level),input));
    }
    const button=el('button','Save story settings');
    const result=el('p');result.setAttribute('role','status');
    form.append(button,result);root.append(form);
    form.onsubmit=async e=>{
      e.preventDefault();button.disabled=true;
      try {
        const ceilings=Object.fromEntries(levels.map(key=>[key,inputs[key].valueAsNumber]));
        await api('/api/story-preferences',{difficulty:difficulty.value,ceilings});
        result.textContent='Story settings saved.';
      } catch(error){result.textContent=error.message;}
      finally{button.disabled=false;}
    };
  });
  ui.route('reading',async({root})=>{
    const preferences=await api('/api/story-preferences');
    root.append(el('h1','Reading'));
    const form=el('form',null,'story-options');
    const duration=el('select');
    for (const [value,label] of [[10,'Short · 10 minutes'],[30,'Long · 30 minutes']]) {
      const option=el('option',label);option.value=String(value);duration.append(option);
    }
    const difficulty=difficultySelect(ui,preferences.difficulty);
    const button=el('button','Generate story','button');
    const status=el('p');status.setAttribute('role','status');
    form.append(field(ui,'Reading time',duration),field(ui,'Difficulty',difficulty),button,status);
    root.append(form,link('Read the saved tea shop story','#/read/tea-shop','text-link'));
    form.onsubmit=async e=>{
      e.preventDefault();
      if(button.disabled)return;
      button.disabled=true;
      status.textContent='Writing and checking your story…';
      try{
        const story=await api('/api/generate-story',{minutes:Number(duration.value),difficulty:difficulty.value});
        ui.navigate('introduction/'+encodeURIComponent(story.id));
      }catch(error){
        status.textContent=error.message;
        button.textContent='Try again';
      }finally{button.disabled=false;}
    };
  });
  ui.route('introduction',async({root,parts})=>{
    const {story}=await api('/api/stories/'+encodeURIComponent(parts[0]));
    root.append(el('h1',story.title));
    const preview=story.preview;
    if(preview) {
      const groups=[['New this story',[...preview.characters,...(preview.compound?[preview.compound]:[])]],['Practice again',preview.review]];
      for(const [heading,items] of groups) {
        if(!items.length)continue;
        root.append(el('h2',heading));
        const list=el('ul',null,'target-list');
        for(const item of items) {
          const li=el('li');
          li.append(el('strong',item.text),el('span',item.pinyin),el('span',item.meaning));
          if(item.example && item.example!==item.text)li.append(el('span','In '+item.example));
          list.append(li);
        }
        root.append(list);
      }
    }
    root.append(link('Begin reading','#/read/'+encodeURIComponent(story.id),'button'));
  });
}
