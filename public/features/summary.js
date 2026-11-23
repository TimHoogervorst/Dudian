import {startWordReview} from './flashcards.js';
export function setup(ui) {
  const {el,api,link}=ui;
  ui.route('summary',async({root,parts})=>{
    const id=encodeURIComponent(parts[0]);
    const base='/api/stories/'+id;
    const result=await api(base+'/summary');
    const heading=el('header',null,'page-heading');
    heading.append(el('p','Story finished','overline'),el('h1',result.title));
    const stats=el('p',result.chapters+' '+(result.chapters===1?'chapter':'chapters')+' read · '+result.distinctWords+' distinct words');
    heading.append(stats);root.append(heading);
    if(result.marked.length){
      const review=el('section',null,'summary-panel');
      review.append(el('h2','Words you marked'));
      const list=el('dl');
      for(const word of result.marked) {
        const term=el('dt',word.text);term.lang='zh-Hans';list.append(term);
        for(const sentence of word.sentences) {
          const example=el('dd',sentence);example.lang='zh-Hans';list.append(example);
        }
      }
      review.append(list);
      const practice=el('button','Practice these words','button');
      practice.onclick=async()=>{
        practice.disabled=true;
        try{await startWordReview(result.marked.map(word=>word.text));}
        catch(error){ui.notice(error.message);}
        finally{practice.disabled=false;}
      };
      review.append(practice);root.append(review);
    }else{
      root.append(el('p','You finished this story without marking a word as difficult.'));
    }
    const rating=el('section',null,'summary-panel');
    rating.append(el('h2','Did you enjoy this story?'));
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
    rating.append(choices);root.append(rating,link('Back to reading desk','#/home','text-link'));
  });
}
