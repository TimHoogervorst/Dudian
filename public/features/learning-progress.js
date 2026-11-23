import {el,link,api} from '../ui.js';

const signed=n=>n>0?'+'+n:String(n);
function dateLabel(date,options){
  return new Intl.DateTimeFormat(undefined,{timeZone:'UTC',...options}).format(new Date((date.length===7?date+'-01':date)+'T12:00:00Z'));
}

function pointsChart(buckets,period){
  const chart=el('section',null,'points-chart');
  const heading=el('div',null,'points-heading');
  const detail=el('span');
  const label=b=>dateLabel(b.date,period==='year'?{month:'long'}:{weekday:'short',month:'short',day:'numeric'});
  const describe=b=>label(b)+' · '+signed(b.points)+(Math.abs(b.points)===1?' point':' points');
  const latest=buckets.filter(b=>b.points!==null).at(-1);
  detail.textContent=latest?describe(latest):'';
  heading.append(el('h3',period==='year'?'Monthly reading points':'Daily reading points'),detail);
  const graph=el('div',null,'points-graph');
  const values=buckets.map(b=>b.points??0);
  const high=Math.max(1,...values),low=Math.min(0,...values);
  const y=value=>8+84*(high-value)/(high-low);
  const x=i=>100*(i+.5)/buckets.length;
  const axis=el('div',null,'points-axis');
  for(const value of new Set([high,0,low])){
    const tick=el('span',signed(value));tick.style.top=y(value)+'%';axis.append(tick);
  }
  const plot=el('div',null,'points-plot');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
  for(const value of new Set([high,0,low])){
    const grid=document.createElementNS(svg.namespaceURI,'line');
    grid.setAttribute('x2','100');grid.setAttribute('y1',y(value));grid.setAttribute('y2',y(value));svg.append(grid);
  }
  const line=document.createElementNS(svg.namespaceURI,'polyline');
  line.setAttribute('points',buckets.flatMap((b,i)=>b.points===null?[]:[x(i)+','+y(b.points)]).join(' '));
  svg.append(line);plot.append(svg);
  const dates=el('div',null,'points-dates');
  buckets.forEach((b,i)=>{
    if(b.points!==null){
      const hit=el('button',null,'points-hit');hit.type='button';
      hit.style.left=(100*i/buckets.length)+'%';hit.style.width=(100/buckets.length)+'%';
      hit.style.setProperty('--dot',y(b.points)+'%');
      hit.setAttribute('aria-label',describe(b));
      hit.onpointerenter=hit.onfocus=hit.onclick=()=>{detail.textContent=describe(b);};
      plot.append(hit);
    }
    if(period==='week' || i===buckets.length-1 || i%(period==='month'?7:3)===0 && i<buckets.length-2){
      const tick=el('span',dateLabel(b.date,period==='year'?{month:'short'}:period==='week'?{weekday:'short'}:{day:'numeric'}));
      tick.style.left=x(i)+'%';dates.append(tick);
    }
  });
  graph.append(axis,plot,dates);chart.append(heading,graph);
  return chart;
}

export function setup(ui){
  ui.on('home',async({root,signal})=>{
    const panel=el('section',null,'learning-progress');
    const header=el('header',null,'learning-header');
    const switcher=el('div',null,'learning-period');
    switcher.setAttribute('role','group');switcher.setAttribute('aria-label','Progress period');
    header.append(el('h2','Learning progress'),switcher);
    const content=el('div');
    panel.append(header,content);root.append(panel);
    let revision=0;
    async function show(period){
      const request=++revision;
      for(const button of switcher.children)button.setAttribute('aria-pressed',String(button.value===period));
      content.setAttribute('aria-busy','true');
      try{
        const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
        const data=await api('/api/learning-progress?period='+period+'&zone='+encodeURIComponent(zone),undefined,signal);
        if(signal.aborted||request!==revision)return;
        const cards=el('div',null,'progress-cards');
        const strong=el('section'),points=el('section');
        strong.append(el('h3','Reached Strong'),el('strong',String(data.strong)),el('span','Words and characters'));
        if(data.examples.length){
          const examples=el('div',null,'strong-examples');
          for(const item of data.examples){
            const a=link(item.text,'#/library/'+item.kind+'/entry/'+encodeURIComponent(item.text));a.lang='zh-Hans';examples.append(a);
          }
          strong.append(examples);
        }
        points.append(el('h3','Net reading points'),el('strong',signed(data.net)),el('span',data.gained+' gained · '+data.lost+' lost'));
        cards.append(strong,points);content.replaceChildren(cards,pointsChart(data.buckets,period));
        if(data.trackedSince)content.append(el('p','Tracked since '+dateLabel(data.trackedSince,{dateStyle:'medium'}),'tracking-note'));
      }catch(error){if(!signal.aborted&&request===revision)content.replaceChildren(el('p',error.message));}
      finally{if(request===revision)content.removeAttribute('aria-busy');}
    }
    for(const period of ['week','month','year']){
      const button=el('button','This '+period);button.value=period;button.onclick=()=>show(period);switcher.append(button);
    }
    await show('week');
  });
}
