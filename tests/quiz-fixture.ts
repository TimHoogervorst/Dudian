import type {CandidateWriter} from '../src/story-generation.ts';

export function withChapterQuestions(write:CandidateWriter,count=1):CandidateWriter {
  return async prompt=>{
    if(!prompt.startsWith('Write a chapter comprehension check.')){
      const draft=JSON.parse(await write(prompt));
      for(const chapter of draft.chapters??[draft])chapter.translations??=chapter.paragraphs.map(()=>'Baobao is here.');
      if(draft.chapters){
        draft.chapters[0].paragraphs[0][0].push('包包:1');
        draft.teaser=['包包:1','来:1','了:1','。'];
      }
      return JSON.stringify(draft);
    }
    const text=(zh:string,en:string)=>({zh:[zh],en});
    const prompts=[text('什么','What?'),text('谁','Who?'),text('几','How many?')];
    const choices=[text('茶','Tea'),text('水','Water'),text('家','Home')];
    const word=prompt.match(/Paragraph 0: 0=(\S+)/)?.[1];
    return JSON.stringify({questions:prompts.slice(0,count).map((prompt,i)=>({
      prompt,choices,correct:i,paragraph:0,token:0,word,characters:[]
    }))});
  };
}
