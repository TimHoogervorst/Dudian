import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export type ItemKind = 'word' | 'character';
export function entryKind(kind:ItemKind,text:string):ItemKind {
  return Array.from(text).length===1?'character':kind;
}
export interface CatalogItem { text: string; level: number }
const data = (name: string) => readFileSync(new URL('../data/' + name, import.meta.url));
const curriculum: string[][] = JSON.parse(data('hsk.json').toString('utf8'));
const studySenseIds:Record<string,string> = JSON.parse(data('hsk1-study-senses.json').toString('utf8'));

const words = curriculum.flatMap((forms, index) => forms.map(text => ({text, level: index + 1})));
const levels = new Map<string, number>();
const examples = new Map<string, CatalogItem[]>();
for (const word of words) {
  for (const char of new Set(word.text)) {
    if (!levels.has(char)) levels.set(char, word.level);
    if (!examples.has(char)) examples.set(char, []);
    if(char!==word.text)examples.get(char)!.push(word);
  }
}
const characters = Array.from(levels, ([text, level]) => ({text, level}));
const wordLevels = new Map(words.map(word => [word.text, word.level]));
const compoundWords=words.filter(item=>entryKind('word',item.text)==='word');

export interface Sense { id: string; pinyin: string; meaning: string; syllables: string[] }
const linesByWord = new Map<string, string[]>();
const entries = gunzipSync(data('cedict.gz')).toString('utf8').split(/\r?\n/);
for (const line of entries) {
  if (!line || line.startsWith('#')) continue;
  const start = line.indexOf(' ') + 1;
  const headword = line.slice(start, line.indexOf(' ', start));
  if (!linesByWord.has(headword)) linesByWord.set(headword, []);
  linesByWord.get(headword)!.push(line);
}
const fallback: Record<string, [string, string[]][]> = JSON.parse(data('fallback.json').toString('utf8'));
const senseCache = new Map<string, Sense[]>();

function accent(numeric: string): string {
  const syllable = numeric.replace(/u:/gi, u => u[0] === 'U' ? 'Ü' : 'ü');
  const tone = Number(syllable.at(-1));
  if (![1,2,3,4,5].includes(tone)) return syllable;
  const base = syllable.slice(0,-1);
  if (tone === 5) return base;
  const preferred = base.match(/[ae]|o(?=u)/i);
  const vowels = [...base.matchAll(/[aeiouümn]/gi)];
  const target = preferred?.index ?? vowels.filter(v => /[iouü]/i.test(v[0])).at(-1)?.index ?? vowels[0]?.index;
  if (target === undefined) return base;
  const mark = ['','\u0304','\u0301','\u030c','\u0300'][tone];
  return (base.slice(0,target+1) + mark + base.slice(target+1)).normalize('NFC');
}

function dictionarySenses(text: string): Sense[] {
  const cached = senseCache.get(text);
  if (cached) return cached;
  const readings: [string, string[]][] = (linesByWord.get(text) ?? []).map(line => {
    const open = line.indexOf(' [') + 2;
    const close = line.indexOf('] /', open);
    return [line.slice(open, close), line.slice(close+3,-1).split('/')];
  });
  if (!readings.length && Object.hasOwn(fallback, text)) readings.push(...fallback[text]);
  const senses = new Map<string, Sense>();
  for (const [reading, definitions] of readings) {
    const syllables = reading.split(' ').map(accent);
    for (const meaning of definitions.filter(d => d && !d.startsWith('CL:'))) {
      const id = createHash('sha256').update(JSON.stringify([text,reading,meaning])).digest('hex').slice(0,16);
      senses.set(id, {id, pinyin: syllables.join(' '), syllables, meaning});
    }
  }
  const rank = (sense: Sense) => /^(surname |variant of |old variant of |used in )/i.test(sense.meaning) ? 1 : 0;
  const ordered = [...senses.values()].sort((a,b) => rank(a) - rank(b));
  if (ordered.length) senseCache.set(text, ordered);
  return ordered;
}

export const catalog = {
  studySense(text:string){
    const senses=dictionarySenses(text);
    const id=studySenseIds[text];
    if(id)return senses.find(s=>s.id===id);
    return senses.find(s=>s.pinyin===s.pinyin.toLowerCase()&&!/\p{Script=Han}/u.test(s.meaning)&&
      !/^(?:surname |(?:old )?variant of |classifier for |see |used in )|ethnic group|\barchaic\b/i.test(s.meaning))??senses[0];
  },
  usesCharactersThrough(text:string,level:number){
    return Array.from(text).every(char=>!/\p{Script=Han}/u.test(char)||(levels.get(char)??Infinity)<=level);
  },
  wordLevel(text:string){return wordLevels.get(text);},
  characterLevel(text:string){return levels.get(text);},
  isCurriculumWord(text:string){return wordLevels.has(text);},
  libraryItems(kind:ItemKind,level:number){
    return (kind==='word'?compoundWords:characters).filter(item=>item.level===level);
  },
  get(kind: ItemKind, text: string, senseId?: string) {
    if (kind === 'character' && Array.from(text).length !== 1) return;
    const senses = dictionarySenses(text);
    const selected = senseId === undefined ? senses[0] : senses.find(sense => sense.id === senseId);
    if (!selected) return;
    return {
      text, level: (kind === 'word' ? wordLevels : levels).get(text) ?? null, senses,
      components: kind === 'word' ? Array.from(text, (char,i) => ({text: char, pinyin: selected.syllables[i] ?? ''})) : [],
      examples: kind === 'character' ? examples.get(text) ?? [] : [],
    };
  },
  list(kind: ItemKind, level?: number) {
    const items = kind === 'word' ? words : characters;
    return level === undefined ? items : items.filter(item => item.level === level);
  },
};
