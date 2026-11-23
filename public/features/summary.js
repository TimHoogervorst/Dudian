import {summaryHeading} from '../summary-heading.js';
import {startWordReview} from './flashcards.js';
import {icon} from '../icons.js';
export function setup(ui) {
  const {el,api,link}=ui;
  ui.route('summary',async({root,parts,signal})=>{
    const id=encodeURIComponent(parts[0]);
    const base='/api/stories/'+id;
    const result=await api(base+'/summary',undefined,signal);
    if(signal.aborted)return;
    const metrics=[[result.chapters,result.chapters===1?'Chapter read':'Chapters read'],[result.distinctWords,'Distinct words']];
    if(result.quiz)metrics.push([result.quiz.correct+'/'+result.quiz.total,'Questions correct']);
    if(result.wordReview)metrics.push([result.wordReview.correct+'/'+result.wordReview.total,'Word cards correct']);
    root.append(summaryHeading('Story complete',result.title,metrics));
    const gains=el('section',null,'summary-panel');
    const gainHeading=el('div',null,'summary-section-heading');
    const total=result.characterGains.highlights.length+result.characterGains.otherCount;
    gainHeading.append(el('h2','Character progress'));
    if(total)gainHeading.append(el('span',total+(total===1?' character improved':' characters improved')));
    gains.append(gainHeading);
    const cards=el('div',null,'summary-characters');
    function characterCard(item){
      const card=link('','#/library/character/entry/'+encodeURIComponent(item.text),'summary-character');
      const glyph=el('strong',item.text);glyph.lang='zh-Hans';
      card.append(glyph,el('span',item.pinyin??''),el('b','+'+item.points+(item.points===1?' point':' points')));
      if(item.focus)card.append(el('small','Story focus'));
      return card;
    }
    cards.append(...result.characterGains.highlights.map(characterCard));
    if(cards.childElementCount)gains.append(cards);
    else gains.append(el('p','No character gains were recorded for this story.'));
    const others=result.characterGains.otherCount;
    if(others){
      const more=el('details',null,'summary-more');
      const toggle=el('summary','Show '+others+' more');
      const rest=el('div',null,'summary-characters');
      more.ontoggle=()=>{
        toggle.textContent=more.open?'Show fewer characters':'Show '+others+' more';
        if(more.open&&!rest.childElementCount)rest.append(...result.characterGains.others.map(characterCard));
      };
      more.append(toggle,rest);gains.append(more);
    }
    root.append(gains);
    const actions=el('div',null,'summary-actions');
    if(result.marked.length){
      const review=el('section',null,'summary-panel');
      review.append(el('h2','Words you marked'));
      const list=el('dl',null,'summary-words');
      for(const word of result.marked) {
        const row=el('div');
        const term=el('dt',word.text);term.lang='zh-Hans';term.prepend(icon('bookmark'));row.append(term);
        for(const sentence of word.sentences) {
          const example=el('dd',sentence);example.lang='zh-Hans';row.append(example);
        }
        list.append(row);
      }
      review.append(list);
      const practice=el('button','Review '+result.marked.length+(result.marked.length===1?' word':' words'),'button');
      practice.onclick=async()=>{
        practice.disabled=true;
        try{await startWordReview(result.marked.map(word=>word.text));}
        catch(error){ui.notice(error.message);}
        finally{practice.disabled=false;}
      };
      actions.append(practice);root.append(review);
    }else{
      root.append(el('p','You finished this story without marking a word as difficult.'));
    }
    actions.append(link('Back to practice','#/practice',result.marked.length?'summary-back':'button'));
    root.append(actions);
    const rating=el('section',null,'summary-rating');
    rating.append(el('span','Did you enjoy this story?'));
    const choices=el('div',null,'rating-options');
    const buttons=[];
    for(const [value,label] of [['up','👍 Liked it'],['down','👎 Didn’t like it']]) {
      const b=el('button',label);b.setAttribute('aria-pressed',String(result.rating===value));
      buttons.push(b);choices.append(b);
      b.onclick=async()=>{
        buttons.forEach(button=>button.disabled=true);
        try{
          await api(base+'/rating',{rating:value});
          buttons.forEach(button=>button.setAttribute('aria-pressed',String(button===b)));
        }catch(error){ui.notice(error.message);}
        finally{buttons.forEach(button=>button.disabled=false);}
      };
    }
    rating.append(choices);root.append(rating);
  });
}
