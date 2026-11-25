import {el} from './ui.js';
import {addSpeaker} from './reader-audio.js';

export function questionCard({number,total,title,audio,signal,className='check-card'}){
  const card=el('section',null,className);
  const prompt=el('h2');
  prompt.append(title);
  card.append(el('p','Question '+number+' of '+total,'overline'),prompt);
  addSpeaker(card,'Listen to question '+number+' and answers',audio,signal);
  return {card,prompt};
}
