import {el} from './ui.js';
import {addSpeaker} from './reader-audio.js';

export function comprehensionChoices(answers){
  const grid=el('div',null,'check-choices comprehension-choices');
  const longest=Math.max(...answers.map(text=>Array.from(text).length));
  grid.style.setProperty('--characters-per-line',String(Math.max(1,Math.ceil(longest/2))));
  return grid;
}

export function questionCard({number,total,title,audio,signal,className='check-card'}){
  const card=el('section',null,className);
  const prompt=el('h2');
  prompt.append(title);
  card.append(el('p','Question '+number+' of '+total,'overline'),prompt);
  addSpeaker(card,'Listen to question '+number+' and answers',audio,signal);
  return {card,prompt};
}
