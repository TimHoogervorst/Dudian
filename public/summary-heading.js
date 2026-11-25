import {el} from './ui.js';

function pointsCounter(total){
  const counter=el('div',null,'summary-points');
  const format=new Intl.NumberFormat(undefined,{signDisplay:'exceptZero',maximumFractionDigits:3});
  counter.setAttribute('role','img');
  counter.setAttribute('aria-label',format.format(total)+' net points');
  const number=el('strong');
  const caption=el('span','Net points');
  counter.append(number,caption);
  counter.style.setProperty('--offset',total<0?'-.18em':'.18em');
  counter.style.setProperty('--score-color',total<0?'#ae343c':'#16723e');
  function display(value){
    number.textContent=format.format(value);
    number.style.setProperty('--intensity',Math.min(Math.abs(value)/30,1)*100+'%');
  }
  if(!total||matchMedia('(prefers-reduced-motion: reduce)').matches){
    display(total);
  }else{
    display(0);
    const start=performance.now();
    function tick(now){
      if(!counter.isConnected)return;
      const progress=Math.min(1,Math.max(0,(now-start)/950));
      const value=total*(1-(1-progress)**2);
      display(progress===1?total:Math.trunc(value*10)/10);
      if(progress<1)requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  return counter;
}

export function summaryHeading(label,title,metrics,tags,{celebrate=true,points}={}){
  const heading=el('header',null,'summary-heading');
  const celebration=el('div',null,'summary-celebration');
  if(celebrate){
    if(points===undefined){
      const mascot=el('img');mascot.src='/baobao.png';mascot.alt='Bāobāo smiling and waving';
      celebration.append(mascot);
    }else celebration.append(pointsCounter(points));
  }
  for(const side of celebrate&&(points===undefined||points>0)?[-1,1]:[]){
    for(let i=0;i<7;i++){
      const piece=el('i',null,'summary-confetti');piece.setAttribute('aria-hidden','true');
      piece.style.setProperty('--x',side*(23+i*4)+'%');
      piece.style.setProperty('--y',(12+(i*17+(side+1)*6)%71)+'%');
      piece.style.setProperty('--angle',side*(14+i*11)+'deg');
      piece.style.setProperty('--delay',i*55+'ms');
      celebration.append(piece);
    }
  }
  const complete=el('p',label,'summary-complete');
  if(celebrate)heading.append(celebration);
  heading.append(complete,el('h1',title));
  if(tags)heading.append(tags);
  const stats=el('dl',null,'summary-stats');
  function stat(value,label){
    const group=el('div');group.append(el('dt',label),el('dd',String(value)));stats.append(group);
  }
  for(const [value,name] of metrics)stat(value,name);
  heading.append(stats);
  return heading;
}
