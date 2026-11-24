import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {catalog} from '../src/catalog.ts';
import {seeItem} from '../src/encounters.ts';
import {practicePreview,confirmedPlan} from '../src/practice-preview.ts';
import {adjustStrength,hskReadingProgress,setStrength} from '../src/strength.ts';
import {chapterFocus,setPreferences} from '../src/story-plan.ts';

test('Hard + Long near 0.90 boosts only unseen HSK 1 characters and stops when they run out',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const {db}=store;
  const chars=catalog.libraryItems('character',1);
  const words=catalog.libraryItems('word',1);
  for(const {text} of chars)if(text!=='姐'){setStrength(db,'character',text,'green');seeItem(db,text,Date.now());}
  for(const {text} of words){
    if(hskReadingProgress(db)>=0.90)break;
    setStrength(db,'word',text,'green');
  }
  for(const {text} of catalog.libraryItems('word',3).slice(0,12))setStrength(db,'word',text,'red');
  for(const remaining of [1,0]){
    if(!remaining){seeItem(db,'姐',Date.now());setStrength(db,'character','姐','green');}
    const preview=practicePreview(store,{difficulty:'hard',minutes:30});
    const plan=confirmedPlan(store,preview.id,'hard',30);
    assert.equal(preview.cards.length,12);
    assert.deepEqual(plan.newCharacters,remaining?['姐']:[]);
    assert.equal(plan.reviewWords.length,12-remaining);
  }
});

test('after passing HSK 1 the late-level boost uses the HSK 2 Library pool',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const {db}=store;
  for(const level of [1,2])for(const kind of ['word','character'] as const){
    for(const {text} of catalog.libraryItems(kind,level)){
      if(hskReadingProgress(db)>=1.90)break;
      setStrength(db,kind,text,'green');seeItem(db,text,Date.now());
    }
  }
  db.prepare("INSERT INTO milestone_tests(id,level,status,sections) VALUES('first',1,'passed','[]')").run();
  const preview=practicePreview(store,{difficulty:'hard',minutes:30});
  const plan=confirmedPlan(store,preview.id,'hard',30);
  assert(plan.newCharacters.length>=9);
  assert(plan.newCharacters.every(c=>catalog.get('character',c)?.level===2));
});

test('Medium + Long fills eleven distinct cards when only one HSK 1 character is new',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  for(const item of catalog.libraryItems('character',1)){
    if(item.text==='姐')continue;
    setStrength(store.db,'character',item.text,'green');
    seeItem(store.db,item.text,Date.now());
  }
  for(const word of ['站','外面','女人'])setStrength(store.db,'word',word,'yellow');
  const short=practicePreview(store,{difficulty:'medium',minutes:10});
  const long=practicePreview(store,{difficulty:'medium',minutes:30,previewId:short.id});
  const words=long.cards.map(card=>card.text);
  assert.equal(new Set(words).size,11);
  assert(words.some(word=>word.includes('姐')));
  const plan=confirmedPlan(store,long.id,'medium',30);
  assert.deepEqual(new Set([...plan.reviewWords,...plan.newWords]),new Set(words));
});

test('Hard + Long includes Library Unseen HSK 1 characters even after a recorded encounter',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const {db}=store;
  const unrated=[...'起语关系国'];
  for(const {text} of catalog.libraryItems('character',1)){
    seeItem(db,text,Date.now());
    if(!unrated.includes(text))setStrength(db,'character',text,'green');
  }
  for(const {text} of catalog.libraryItems('word',1)){
    if(hskReadingProgress(db)>=.90)break;
    setStrength(db,'word',text,'green');
  }
  const preview=practicePreview(store,{difficulty:'hard',minutes:30});
  const plan=confirmedPlan(store,preview.id,'hard',30);
  assert.equal(preview.cards.length,12);
  assert.deepEqual(new Set(plan.newCharacters),new Set(unrated));
  for(const char of unrated){
    assert(plan.newCharacters.includes(char),char);
    assert(plan.newWords.some(word=>word.includes(char)),char);
  }
  assert.deepEqual(db.prepare('SELECT count(*) AS n FROM milestone_characters').get()?.n,catalog.libraryItems('character',1).length);
});

test('Hard fills six focus cards with struggling reviews and eligible new characters',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const struggling=['昨天','先生','椅子','学生','老师','朋友'];
  for(const word of struggling.slice(0,3))setStrength(store.db,'word',word,'red');
  setStrength(store.db,'word','东西','yellow');
  const preview=()=>practicePreview(store,{difficulty:'hard',minutes:10});
  const mixed=preview();
  const plan=confirmedPlan(store,mixed.id,'hard',10);
  assert.deepEqual(new Set(plan.reviewWords),new Set(struggling.slice(0,3)));
  assert.deepEqual(mixed.cards.map(c=>c.color),['red','red','red','gray','gray','gray']);
  assert.equal(plan.newCharacters.length,3);
  assert.equal(practicePreview(store,{difficulty:'medium',minutes:10}).cards.length,3);
  assert.equal(practicePreview(store,{difficulty:'easy',minutes:10}).cards.length,2);
  setPreferences(store,{difficulty:'hard',ceilings:{easy:2,medium:3,hard:1}});
  const limited=preview();
  assert.equal(confirmedPlan(store,limited.id,'hard',10).newCharacters.length,1);
  assert.ok(limited.cards.some(c=>c.text==='东西'));
  for(const word of struggling.slice(3))setStrength(store.db,'word',word,'red');
  assert.deepEqual(new Set(preview().cards.map(c=>c.text)),new Set(struggling));
});

test('a reroll replaces one focus, survives resizing, and binds generation to its preview', t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const options={difficulty:'medium',minutes:10} as const;
  const first=practicePreview(store,options);
  assert.ok(first.cards.length>=2 && first.cards.length<=6);
  const second=practicePreview(store,{...options,previewId:first.id,reroll:first.cards[0].text});
  assert.notEqual(second.cards[0].text,first.cards[0].text);
  assert.deepEqual(second.cards.slice(1),first.cards.slice(1));
  const longer=practicePreview(store,{...options,minutes:20,previewId:second.id});
  const words=longer.cards.map(c=>c.text);
  assert.deepEqual(words.slice(0,second.cards.length),second.cards.map(c=>c.text));
  assert.equal(words.length,second.cards.length+2);
  assert(!words.includes(first.cards[0].text));
  const plan=confirmedPlan(store,longer.id,'medium',20);
  assert.deepEqual(new Set([...plan.reviewWords,...plan.newWords,...(plan.compound?[plan.compound]:[])]),new Set(words));
  assert.throws(()=>confirmedPlan(store,longer.id,'hard',20));
  assert.ok(longer.projected>second.projected);
  assert.equal(hskReadingProgress(store.db),0);
});

test('long Hard stories advance a four-word window by two and shrink back to the short budget',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const options={difficulty:'hard',minutes:30} as const;
  const preview=practicePreview(store,options);
  assert.equal(preview.cards.length,12);
  const groups=chapterFocus(confirmedPlan(store,preview.id,'hard',30));
  for(let i=0;i<5;i++){
    assert.deepEqual(groups[i],preview.cards.slice(2*i,2*i+4).map(card=>card.text));
  }
  const shorter=practicePreview(store,{...options,minutes:10,previewId:preview.id});
  assert.equal(confirmedPlan(store,shorter.id,'hard',10).newCharacters.length,5);
  setPreferences(store,{difficulty:'hard',ceilings:{easy:0,medium:0,hard:0}});
  const reviewOnly=practicePreview(store,options);
  assert.equal(confirmedPlan(store,reviewOnly.id,'hard',30).newCharacters.length,0);
});

test('practice estimates respect strength and HSK caps', t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const options={difficulty:'hard',minutes:30} as const;
  const draft=practicePreview(store,options);
  for(const c of draft.cards)adjustStrength(store.db,c.kind,c.text,36);
  const full=practicePreview(store,{...options,previewId:draft.id});
  assert.ok(full.cards.every(c=>c.gain===0));
  assert.equal(full.projected,full.level);
});
test('each practice visit rotates five subjects and the confirmed plan uses the chosen one',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const options={difficulty:'easy',minutes:10} as const;
  const first=practicePreview(store,options);
  const next=practicePreview(store,options);
  assert.equal(new Set(next.subjects.map(s=>s.zh)).size,5);
  assert.ok(next.subjects.every(s=>!first.subjects.some(other=>s.zh===other.zh)));
  const resized=practicePreview(store,{...options,minutes:20,previewId:next.id});
  assert.deepEqual(resized.subjects,next.subjects);
  const chosen=next.subjects[3];
  assert.deepEqual(confirmedPlan(store,resized.id,'easy',20,chosen.zh).subject,chosen);
  assert.throws(()=>confirmedPlan(store,next.id,'easy',10,'unknown'));
});
