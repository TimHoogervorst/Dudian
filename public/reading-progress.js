import {el,link} from './ui.js';
export function displayLevel(level){
  return level>0 && level<0.01?'<0.01':String(Math.floor(level*100)/100);
}
export function readingProgress(level,projected,state={}){
  const start=state.milestone?Math.min(Math.floor(level),state.milestone-1):Math.min(5,Math.floor(level));
  const milestone=start+1;
  const panel=el('section',null,'hsk-progress');
  const heading=el('div',null,'hsk-progress-heading');
  const display=displayLevel(level);
  heading.append(el('h2','HSK reading progress'),el('strong',display));
  const track=el('div',null,'hsk-progress-track');
  track.setAttribute('role','meter');
  track.setAttribute('aria-label','Estimated HSK reading progress');
  track.setAttribute('aria-valuemin',String(start));track.setAttribute('aria-valuemax',String(milestone));
  track.setAttribute('aria-valuenow',String(level));track.setAttribute('aria-valuetext','HSK '+display+' of '+milestone);
  track.style.setProperty('--progress',(level-start)*100+'%');
  const labels=el('div',null,'hsk-progress-labels');
  labels.setAttribute('aria-hidden','true');
  for(const i of [start,milestone]){
    const tick=el('span',String(i));tick.style.left=(i-start)*100+'%';labels.append(tick);
  }
  panel.append(heading,track);
  if(state.milestone){
    const note=el('div',null,'hsk-milestone milestone-link');
    note.append(el('span','HSK '+state.milestone+' milestone reached'),link('Take test →','#/progression/'+state.milestone));
    panel.append(note);
  }else{
    panel.append(labels);
    if(state.passed)panel.append(el('p','HSK '+state.passed+' passed','hsk-milestone'));
    else if(level<6)panel.append(el('p','Next milestone: HSK '+milestone,'hsk-milestone'));
  }
  if(projected!==undefined){
    const gain=Math.max(0,projected-level);
    const delta=gain>0 && gain<0.0001?'<0.0001':Number(gain.toFixed(4));
    const extension=el('span',null,'hsk-projection');
    extension.style.width=Math.min(gain,milestone-level)*100+'%';
    track.append(extension);
    panel.append(el('p','Estimated focus gain · +'+delta+' HSK','hsk-estimate'));
  }
  return panel;
}
