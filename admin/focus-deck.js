export function focusDeck(){
  let audienceKey, candidates=[], cards=[], used=new Set();
  function next(){
    const showing=new Set(cards.map(card=>card.text));
    return candidates.find(text=>!showing.has(text)&&!used.has(text))
      ??candidates.find(text=>!showing.has(text));
  }
  function fill(key,ranked,limit){
    if(key!==audienceKey){cards=[];used=new Set();audienceKey=key;}
    candidates=ranked;
    cards.length=Math.min(cards.length,limit);
    while(cards.length<limit){
      const text=next();
      if(!text)break;
      cards.push({text,selected:true});used.add(text);
    }
    return cards;
  }
  function replace(index,text){
    if(!text || cards.some((c,i)=>i!==index&&c.text===text))return;
    cards[index]={text,selected:true};used.add(text);
  }
  function include(text){
    const existing=cards.find(c=>c.text===text);
    if(existing){existing.selected=true;return;}
    const unchecked=cards.findIndex(c=>!c.selected);
    replace(unchecked<0?cards.length-1:unchecked,text);
  }
  return {fill,include,reroll(index){replace(index,next());},canReroll(){return Boolean(next());},
    toggle(index){cards[index].selected=!cards[index].selected;},
    selected(){return cards.filter(c=>c.selected).map(c=>c.text);}};
}
