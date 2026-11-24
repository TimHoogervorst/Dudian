import type {Story} from './store.ts';

export function coverTemplate({format,title,chapters}:Pick<Story,'format'|'title'|'chapters'>){
  // Stories created before reading types were introduced were Bāobāo children's books.
  const reference=!format || (format.type==='book' && format.stage==='Children’s book');
  const firstChapter=chapters[0];
  let passage=firstChapter.paragraphs;
  let direction:string;
  if(reference){
    direction='Create a warm ink-and-gouache children’s picture-book cover. Match 包包 in the supplied reference: cream pleated bun, rosy cheeks, tiny limbs and green crossbody satchel.';
    const scene=chapters.flatMap(chapter=>chapter.paragraphs).find(tokens=>tokens.some(token=>token.cast));
    if(scene)passage=[scene];
  }else if(format.type==='article'){
    direction='Create a natural-light editorial photograph for the first document. Frame its subject in its everyday setting.';
  }else if(format.type==='dialogue'){
    direction='Create a candid colored-pencil illustration from the learner’s point of view. Show a place or object the participants are discussing.';
  }else{
    direction=format.stage==='Baby book'?'Create a warm ink-and-gouache illustration of one clear action in simple shapes.':
      'Create a warm ink-and-gouache book cover with a richly detailed narrative scene.';
  }
  const prompt=[direction,'Reading: '+title,'Use the passage below to choose the subject, action and setting. No lettering.',
    ...passage.map(tokens=>tokens.map(token=>token.text).join(''))].join('\n');
  return {reference,prompt};
}
