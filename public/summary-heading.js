import {el} from './ui.js';

export function summaryHeading(label,title,metrics,tags){
  const heading=el('header',null,'summary-heading');
  const celebration=el('div',null,'summary-celebration');
  const mascot=el('img');mascot.src='/baobao.png';mascot.alt='Bāobāo smiling and waving';
  celebration.append(mascot);
  for(const side of [-1,1]){
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
  heading.append(celebration,complete,el('h1',title));
  if(tags)heading.append(tags);
  const stats=el('dl',null,'summary-stats');
  function stat(value,label){
    const group=el('div');group.append(el('dt',label),el('dd',String(value)));stats.append(group);
  }
  for(const [value,name] of metrics)stat(value,name);
  heading.append(stats);
  return heading;
}
