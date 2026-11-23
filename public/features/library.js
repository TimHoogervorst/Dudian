import {api,el,link} from '../ui.js';

const labels = {gray:'Unseen',red:'Struggling',yellow:'Learning',green:'Strong'};
const labelFor = kind => kind === 'word' ? 'Words' : 'Characters';
const browse = (kind,level,page=1) => '#/library/' + kind + '/' + level + '/' + page;
const detail = (kind,text,sense) => '#/library/' + kind + '/entry/' + encodeURIComponent(text) + (sense ? '/' + encodeURIComponent(sense) : '');

function status(color) {
  const mark = el('span',labels[color],'lib-status lib-'+color);
  return mark;
}

async function renderList(root, kind, level, page) {
  const result = await api('/api/library?' + new URLSearchParams({kind,level,page}));
  const controls = el('div',null,'lib-controls');
  const tabs = el('nav',null,'lib-tabs');
  tabs.setAttribute('aria-label','Library collection');
  for (const type of ['character','word']) {
    const tab = link(labelFor(type),browse(type,level));
    if (type === kind) tab.setAttribute('aria-current','page');
    tabs.append(tab);
  }
  const label = el('label','Curriculum level ');
  const select = el('select');
  for (let n=1;n<=6;n++) {
    const option = el('option','HSK '+n);
    option.value=n;
    option.selected=n===level;
    select.append(option);
  }
  select.onchange = () => {location.hash=browse(kind,select.value);};
  label.append(select);
  controls.append(tabs,label);
  const summary = el('div',null,'lib-summary');
  summary.append(el('p',result.total+' '+labelFor(kind).toLowerCase()+' · HSK '+level));
  const legend = el('div',null,'lib-legend');
  Object.keys(labels).forEach(color => legend.append(status(color)));
  summary.append(legend);
  const grid = el('div',null,'lib-grid');
  for (const item of result.items) {
    const tile = link('',detail(kind,item.text),'lib-tile lib-'+item.color);
    tile.title = item.meaning;
    tile.setAttribute('aria-label',item.text+' · '+item.pinyin+' · '+labels[item.color]);
    tile.append(el('strong',item.text),el('span',item.pinyin));
    grid.append(tile);
  }
  const pages = el('nav',null,'lib-pages');
  pages.setAttribute('aria-label','Library pages');
  if (page>1) pages.append(link('← Previous',browse(kind,level,page-1)));
  pages.append(el('span','Page '+page+' of '+result.pages));
  if (page<result.pages) pages.append(link('Next →',browse(kind,level,page+1)));
  const sources = el('footer',null,'lib-sources');
  sources.append('Dictionary by ',link('CC-CEDICT contributors','https://cc-cedict.org/wiki/'), ' · ',
    link('CC BY-SA 4.0','https://creativecommons.org/licenses/by-sa/4.0/'),' · ',
    link('HSK vocabulary','https://github.com/drkameleon/complete-hsk-vocabulary/tree/7ac65bf1a6387d35f1ade478906172a19311c7f9'));
  root.append(el('h1','Library'),controls,summary,grid,pages,sources);
}

async function renderDetail(root,kind,text,sense) {
  const query = new URLSearchParams({kind,text});
  if (sense) query.set('sense',sense);
  const item = await api('/api/library?'+query);
  const current = item.senses.find(s=>s.id===sense) ?? item.senses[0];
  const entry = el('article',null,'lib-entry');
  const header = el('header');
  header.append(el('p',labelFor(kind)+(item.level ? ' · HSK '+item.level : ''),'overline'),el('h1',text),status(item.color));
  entry.append(header);

  const readings = new Map();
  for (const s of item.senses) {
    if (!readings.has(s.pinyin)) readings.set(s.pinyin,[]);
    readings.get(s.pinyin).push(s);
  }
  for (const [pinyin, senses] of readings) {
    const section = el('section',null,'lib-reading');
    const h = el('h2');
    const pronunciation = link(pinyin,detail(kind,text,senses[0].id));
    if (current.pinyin===pinyin) pronunciation.setAttribute('aria-current','true');
    h.append(pronunciation);
    const meanings = el('ul');
    for (const s of senses) meanings.append(el('li',s.meaning));
    section.append(h,meanings);
    entry.append(section);
  }
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
    const list = el('div',null,'lib-examples');
    for (const word of item.examples) list.append(link(word.text+' · HSK '+word.level,detail('word',word.text)));
    entry.append(list);
  }
  root.append(link('← '+labelFor(kind),browse(kind,item.level??1),'text-link'),entry);
}

export function setup(ui) {
  ui.route('library', async ({root,parts})=>{
    const kind=parts[0]==='word'?'word':'character';
    if (parts[1]==='entry') return renderDetail(root,kind,parts[2],parts[3]);
    await renderList(root,kind,Number(parts[1]??1),Number(parts[2]??1));
  });
}
