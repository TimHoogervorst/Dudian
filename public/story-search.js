import {icon} from './icons.js';
import {el} from './ui.js';

export const storyStatuses={new:'Not started',reading:'In progress',finished:'Finished'};
export const storyStatus=story=>story.finished?'finished':story.opened?'reading':'new';

function plainPinyin(text){
  return text.toLowerCase().replace(/u:|v/g,'ü').normalize('NFD')
    .replace(/[\u0300\u0301\u0304\u030c]/g,'').replace(/[1-5\s'’\-]/g,'').normalize('NFC');
}

export function matchesStory(story,{q,status,level,difficulty}){
  if(status && storyStatus(story)!==status)return false;
  if(level && String(story.hskLevel)!==level)return false;
  if(difficulty && story.difficulty!==difficulty)return false;
  const term=q.trim().toLowerCase();
  if(!term || story.title.toLowerCase().includes(term))return true;
  const sound=plainPinyin(term);
  return story.focus?.some(({text,meaning,pinyin})=>text.includes(term)
    || meaning?.toLowerCase().includes(term) || Boolean(sound && pinyin && plainPinyin(pinyin).includes(sound)));
}

export function storySearch(root,parts,onChange){
  const saved=new URLSearchParams(parts[0]);
  const controls=el('div',null,'lib-controls story-controls');
  const search=el('input',null,'lib-search');
  search.type='search';
  search.placeholder='Search titles, Chinese, pinyin, or English';
  search.setAttribute('aria-label','Search stories by title or focus vocabulary');
  search.value=saved.get('q')??'';
  const box=el('label',null,'lib-search-box');
  box.append(icon('search'),search);
  controls.append(box);
  function select(key,label,choices){
    const input=el('select');
    input.setAttribute('aria-label',label);
    input.append(new Option('All '+label,''));
    for(const [value,name] of choices)input.append(new Option(name,value,false,value===saved.get(key)));
    controls.append(input);
    input.onchange=change;
    return input;
  }
  const level=select('level','HSK levels',Array.from({length:6},(_,i)=>[String(i+1),'HSK '+(i+1)]));
  const difficulty=select('difficulty','difficulties',[['easy','Easy'],['medium','Medium'],['hard','Hard']]);
  const summary=el('div',null,'lib-summary');
  const count=el('p');
  count.setAttribute('role','status');
  const chips=el('div',null,'lib-legend');
  chips.setAttribute('role','group');
  chips.setAttribute('aria-label','Filter by story status');
  let status=Object.hasOwn(storyStatuses,saved.get('status'))?saved.get('status'):'';
  for(const [value,label] of Object.entries(storyStatuses)){
    const chip=el('button',label);
    chip.setAttribute('aria-pressed',String(status===value));
    chip.onclick=()=>{
      status=status===value?'':value;
      for(const button of chips.children)button.setAttribute('aria-pressed',String(button===chip && Boolean(status)));
      change();
    };
    chips.append(chip);
  }
  const filters=()=>({q:search.value,status,level:level.value,difficulty:difficulty.value});
  function change(){
    const params=new URLSearchParams(Object.entries(filters()).filter(([,value])=>value));
    history.replaceState(null,'','#/stories'+(params.size?'/'+encodeURIComponent(params.toString()):''));
    onChange();
  }
  search.oninput=change;
  summary.append(count,chips);
  root.append(controls,summary);
  return {filters,count};
}
