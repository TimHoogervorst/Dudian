import {el} from './ui.js';
import {icon} from './icons.js';

let playing;
export function stopReading(){
  if(!playing)return;
  playing.button.setAttribute('aria-pressed','false');
  playing.cleanup();
  playing=undefined;
  window.speechSynthesis.cancel();
}
export function addSpeaker(container,label,parts,signal){
  const synth=window.speechSynthesis;
  if(!synth||!window.SpeechSynthesisUtterance)return;
  const button=el('button',null,'reader-speaker');
  button.type='button';
  button.title=label;
  button.setAttribute('aria-label',label);
  button.setAttribute('aria-pressed','false');
  button.append(icon('speaker'));
  button.onclick=event=>{
    event.stopPropagation();
    const toggleOff=playing?.button===button;
    stopReading();
    if(toggleOff)return;
    const utterances=parts.map(part=>{
      const speech=new SpeechSynthesisUtterance(part.text);
      speech.lang=part.lang??'zh-CN';
      return speech;
    });
    const session={button,utterances,cleanup:()=>signal.removeEventListener('abort',finish)};
    playing=session;
    button.setAttribute('aria-pressed','true');
    const finish=()=>{if(playing===session)stopReading();};
    signal.addEventListener('abort',finish,{once:true});
    for(const speech of utterances)speech.onerror=finish;
    utterances.at(-1).onend=finish;
    for(const speech of utterances)synth.speak(speech);
  };
  container.prepend(button);
}
