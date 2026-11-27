import {api,el,link} from '../ui.js';

const portrait='/api/cast/baobao/portrait';
const endpoint=id=>'/api/stories/'+encodeURIComponent(id)+'/art';
export function coverImage(story,className='') {
  const img=el('img',null,'story-illustration '+className);
  img.alt='Cover for '+story.title;
  img.src=endpoint(story.id)+'/image';
  if(story.artStatus==='drawing'){
    async function check(){
      if(!img.isConnected)return;
      try{
        const state=await api(endpoint(story.id)+'/status');
        if(state.status==='drawing')setTimeout(check,2500);
        else if(state.status==='ready'||state.status==='imported')img.src=endpoint(story.id)+'/image?v='+Date.now();
      }catch{if(img.isConnected)setTimeout(check,5000);}
    }
    setTimeout(check,2500);
  }
  return img;
}
export function showCover({root},story,article) {
  root.append(coverImage(story,'cover-scene'),article,link('Start reading','#/read/'+encodeURIComponent(story.id),'button'));
}
export function setup(ui){
  ui.route('cast',({root})=>{
    const img=el('img',null,'cast-portrait');img.src=portrait;img.alt='包包 with a green crossbody satchel';
    root.append(link('← Dictionary','#/library','text-link'),el('h1','Meet the cast'),img,el('h2','包包 · Bāobāo'),
      el('p','Our little steamed-bun friend carries a green satchel and finds adventures in everyday life.'));
  });
}
