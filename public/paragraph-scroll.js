export function trackParagraph(rectangles,height,save) {
  let timer,userScroll=false,pending=false;
  function flush(){
    clearTimeout(timer);
    if(!pending)return;
    pending=false;
    const viewport=height(),anchor=viewport*0.35;
    let best=-1,distance=Infinity;
    rectangles().forEach(({top,bottom},i)=>{
      if(bottom<=0 || top>=viewport)return;
      const d=Math.max(0,top-anchor,anchor-bottom);
      if(d<distance){distance=d;best=i;}
    });
    if(best>=0)return save(best);
  }
  return {
    intent(){userScroll=true;},
    programmatic(){userScroll=false;pending=false;clearTimeout(timer);},
    scrolled(){
      if(!userScroll)return;
      pending=true;clearTimeout(timer);timer=setTimeout(flush,200);
    },
    flush,
  };
}

