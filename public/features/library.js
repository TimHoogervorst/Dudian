import {api,el,link,ui} from '../ui.js';
import {icon} from '../icons.js';

const labels = {gray:'Unseen',red:'Struggling',yellow:'Learning',green:'Strong',gold:'Perfect'};
const labelFor = kind => kind === 'word' ? 'Words' : 'Characters';
const sizes = [20,50,100,200];
const libraryUrl = (kind,level,page=1,size=localStorage.getItem('libraryPageSize')||50,q='',filter='') =>
  '#/library/' + [kind,level,page,size].join('/') + (q ? '/'+encodeURIComponent(q) : '') + (filter?'/status/'+filter:'');
const detail = (kind,text,sense) => '#/library/' + kind + '/entry/' + encodeURIComponent(text) + (sense ? '/' + encodeURIComponent(sense) : '');

async function renderList(root, kind, level, page, size, query, filter,signal) {
  const browse=(kind,level,page,size,term)=>libraryUrl(kind,level,page,size,term,filter);
  const controls = el('div',null,'lib-controls');
  const tabs = el('nav',null,'lib-tabs');
  tabs.setAttribute('aria-label','Dictionary collection');
  for (const type of ['character','word']) {
    const tab = link(labelFor(type),browse(type,level,1,size,query));
    const symbol=el('span',type==='word'?'词':'字','lib-tab-symbol');
    symbol.lang='zh-Hans';
    tab.prepend(symbol);
    tab.dataset.kind=type;
    if (type === kind) tab.setAttribute('aria-current','page');
    tabs.append(tab);
  }
  const select = el('select');
  select.setAttribute('aria-label','HSK level');
  for (let n=1;n<=6;n++) {
    const option = el('option','HSK '+n);
    option.value=n;
    option.selected=n===level;
    select.append(option);
  }
  select.onchange = () => {location.hash=browse(kind,select.value,1,size,search.value.trim());};
  const filters=el('div',null,'lib-filters');
  const searchBox=el('label',null,'lib-search-box');
  const search=el('input',null,'lib-search');
  search.type='search';
  search.placeholder='Search Chinese, pinyin, or English';
  search.setAttribute('aria-label','Search by Chinese, pinyin, or English meaning');
  search.value=query;
  searchBox.append(icon('search'),search);
  filters.append(select,searchBox);
  controls.append(tabs,filters);
  const summary = el('div',null,'lib-summary');
  const count=el('p');
  count.setAttribute('role','status');
  summary.append(count);
  const legend = el('div',null,'lib-legend');
  legend.setAttribute('role','group');legend.setAttribute('aria-label','Filter by reading status');
  for(const [color,label] of Object.entries(labels)){
    const button=el('button',label,'lib-status lib-'+color);
    button.setAttribute('aria-pressed',String(filter===color));
    button.onclick=()=>{location.hash=libraryUrl(kind,level,1,size,search.value.trim(),filter===color?'':color);};
    legend.append(button);
  }
  summary.append(legend);
  const grid = el('div',null,'lib-grid');
  function tileFor(item) {
    const tile = link('',detail(kind,item.text,item.sense),'lib-tile lib-'+item.color);
    const status=labels[item.color];
    const gloss=item.meaning?.split(';')[0].trim() || item.meaning;
    tile.setAttribute('aria-label',[item.text,item.pinyin,status,gloss].filter(Boolean).join(' · '));
    const badge=el('span',null,'tile-badge');
    badge.append(el('span',status,'tile-status-label'));
    const headword=el('strong',item.text);
    headword.lang='zh-Hans';
    const reading=el('div',null,'tile-reading');
    reading.append(headword,el('span',item.pinyin));
    tile.append(badge,reading);
    if(gloss)tile.append(el('small',gloss,'tile-gloss'));
    return tile;
  }
  const pages = el('nav',null,'lib-pages');
  pages.setAttribute('aria-label','Dictionary pages');
  const sizeLabel=el('label','Per page ');
  const sizeSelect=el('select');
  for (const n of sizes) sizeSelect.append(new Option(String(n),String(n),false,n===size));
  sizeSelect.onchange=()=>{
    localStorage.setItem('libraryPageSize',sizeSelect.value);
    location.hash=browse(kind,level,1,sizeSelect.value,search.value.trim());
  };
  sizeLabel.append(sizeSelect);
  let version=0;
  async function refresh(pageNumber,term) {
    const request=++version;
    const result=await api('/api/library?'+new URLSearchParams({kind,level,page:pageNumber,pageSize:size,q:term,status:filter}),undefined,signal);
    if (signal.aborted || request!==version) return;
    count.textContent=result.total+' '+(result.total===1?kind:labelFor(kind).toLowerCase());
    grid.replaceChildren(...result.items.map(tileFor));
    if (!result.total) grid.append(el('p','No entries match these filters.'));
    pages.replaceChildren();
    if (result.page>1) pages.append(link('← Previous',browse(kind,level,result.page-1,size,term)));
    if (result.total) pages.append(el('span','Page '+result.page+' of '+result.pages));
    if (result.page<result.pages) pages.append(link('Next →',browse(kind,level,result.page+1,size,term)));
    pages.append(sizeLabel);
  }
  let timer;
  search.oninput=()=>{
    clearTimeout(timer);
    version++;
    const term=search.value.trim();
    history.replaceState(null,'',browse(kind,level,1,size,term));
    for (const tab of tabs.children) tab.href=browse(tab.dataset.kind,level,1,size,term);
    timer=setTimeout(()=>refresh(1,term).catch(error=>{if(!signal.aborted) count.textContent=error.message;}),150);
  };
  signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
  const sources = el('footer',null,'lib-sources');
  sources.append('Dictionary by ',link('CC-CEDICT contributors','https://cc-cedict.org/wiki/'), ' · ',
    link('CC BY-SA 4.0','https://creativecommons.org/licenses/by-sa/4.0/'),' · ',
    link('HSK vocabulary','https://github.com/drkameleon/complete-hsk-vocabulary/tree/7ac65bf1a6387d35f1ade478906172a19311c7f9'));
  root.append(controls,link('Meet the cast · 包包','#/cast','text-link'),summary,grid,pages,sources);
  await refresh(page,query);
}

function strengthMeter(text){
  const meter=el('div',null,'lib-strength-meter');
  meter.setAttribute('role','meter');
  meter.setAttribute('aria-label','Reading strength for '+text);
  meter.setAttribute('aria-valuemin','-7');
  meter.setAttribute('aria-valuemax','36');
  meter.setAttribute('aria-description','Perfect at 36 points.');
  const marker=el('span',null,'lib-strength-marker');
  const bands={};
  for(const color of ['gray','red','yellow','green','gold']){
    const band=el('span',null,'lib-strength-band lib-'+color);
    band.title=color==='gold'?'Perfect at 36 points':labels[color];
    bands[color]=band;
    meter.append(band);
  }
  function update({score,color}){
    // Each band's endpoints keep the marker visibly inside its status color.
    const ranges={red:[-6,0],yellow:[0,6],green:[6,36]};
    const range=ranges[color];
    const fraction=range?(score-range[0])/(range[1]-range[0]):0;
    marker.style.left=(color==='gold'?100:color==='gray'?0:10+(color==='green'?90:80)*fraction)+'%';
    marker.className='lib-strength-marker lib-'+color;
    bands[color].append(marker);
    meter.setAttribute('aria-valuenow',String(score??-7));
    meter.setAttribute('aria-valuetext',labels[color]);
  }
  return {meter,update};
}

async function renderDetail(root,kind,text,sense) {
  const query = new URLSearchParams({kind,text});
  if (sense) query.set('sense',sense);
  const item = await api('/api/library?'+query);
  const primary = item.senses.find(s=>s.id===item.primarySense) ?? item.senses[0];
  const current = item.senses.find(s=>s.id===sense) ?? primary;
  const entry = el('article',null,'lib-entry');
  const header = el('header');
  const headword = el('h1',text);
  headword.lang='zh-Hans';
  const badge=el('label',null,'lib-status lib-'+item.color);
  const select=el('select');
  const strength=strengthMeter(text);
  const time=el('time');
  function updateSeen(timestamp){
    time.hidden=timestamp==null;
    if(timestamp==null)return;
    const seen=new Date(timestamp);
    time.textContent='Last seen '+seen.toLocaleDateString(undefined,{dateStyle:'medium'});
    time.dateTime=seen.toISOString();
  }
  strength.update(item);
  updateSeen(item.lastSeen);
  select.setAttribute('aria-label','Reading status for '+text);
  for(const [color,label] of Object.entries(labels)){
    select.append(new Option(label,color,false,color===item.color));
  }
  select.onchange=async()=>{
    select.disabled=true;
    try{
      const result=await api('/api/library?'+query,{color:select.value});
      item.color=result.color;badge.className='lib-status lib-'+item.color;
      strength.update(result);
      updateSeen(result.lastSeen);
    }catch(error){select.value=item.color;ui.notice(error.message);}
    finally{select.disabled=false;}
  };
  badge.append(select);
  header.append(el('p',labelFor(kind)+(item.level ? ' · HSK '+item.level : ''),'overline'),badge,headword);
  const mainReading=el('div',null,'lib-primary-reading');
  mainReading.append(el('strong',primary.pinyin),el('p',primary.meaning));
  header.append(mainReading);
  entry.append(header,strength.meter,time);

  const readings = new Map();
  for (const s of item.senses) {
    if(s.id===primary.id)continue;
    if (!readings.has(s.pinyin)) readings.set(s.pinyin,[]);
    readings.get(s.pinyin).push(s);
  }
  const others=el('details',null,'lib-other-readings');
  others.open=current.id!==primary.id;
  others.append(el('summary','Other readings and meanings'));
  for (const [pinyin, senses] of readings) {
    const section = el('section',null,'lib-reading');
    const h = el('h2');
    const pronunciation = link(pinyin,detail(kind,text,senses[0].id));
    if (current.pinyin===pinyin) pronunciation.setAttribute('aria-current','true');
    h.append(pronunciation);
    const meanings = el('ul');
    for (const s of senses) {
      const meaning=el('li');
      if(s.id===current.id)meaning.append(el('strong',s.meaning));
      else meaning.textContent=s.meaning;
      meanings.append(meaning);
    }
    section.append(h,meanings);
    others.append(section);
  }
  if(readings.size)entry.append(others);
  if (item.components.length) {
    entry.append(el('h2','Characters in '+text));
    const pieces = el('div',null,'lib-pieces');
    for (const piece of item.components) {
      const a = link('',detail('character',piece.text));
      a.append(el('strong',piece.text),el('span',piece.pinyin));
      pieces.append(a);
    }
    entry.append(pieces);
  }
  if (item.examples.length) {
    entry.append(el('h2','Words using '+text));
    const list = el('ul',null,'lib-examples');
    for (const word of item.examples) {
      const row = el('li');
      const target = link('',detail('word',word.text,word.sense));
      const form = el('strong',word.text);
      form.lang='zh-Hans';
      const words = el('span',null,'example-copy');
      words.append(form,el('span',word.meaning,'example-meaning'));
      const arrow = el('span','→');
      arrow.setAttribute('aria-hidden','true');
      target.append(words,el('small','HSK '+word.level),arrow);
      row.append(target);
      list.append(row);
    }
    entry.append(list);
  }
  root.append(link('← '+labelFor(kind),libraryUrl(kind,item.level??1),'text-link'),entry);
}

export function setup(ui) {
  ui.route('library', async ({root,parts,signal})=>{
    const kind=parts[0]==='word'?'word':'character';
    if (parts[1]==='entry'){
      if(kind==='word' && Array.from(parts[2]??'').length===1){
        location.replace(detail('character',parts[2],parts[3]));
        return;
      }
      return renderDetail(root,kind,parts[2],parts[3]);
    }
    const size=Number(parts[3]??localStorage.getItem('libraryPageSize')??50);
    const hasFilter=parts.length>=6 && parts.at(-2)==='status' && Object.hasOwn(labels,parts.at(-1));
    const term=(hasFilter?parts.slice(0,-2):parts)[4]??'';
    await renderList(root,kind,Number(parts[1]??1),Number(parts[2]??1),sizes.includes(size)?size:50,term,hasFilter?parts.at(-1):'',signal);
  });
}
