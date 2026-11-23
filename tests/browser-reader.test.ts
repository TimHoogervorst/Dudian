import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ui,pageNavigation} from '../public/ui.js';
import {activeSlice} from '../public/features/reading-week.js';
import {trackParagraph} from '../public/paragraph-scroll.js';

test('pending reader hooks stop on navigation and the new page waits for previous writes',async()=>{
  const navigation=pageNavigation();
  const first=navigation.next();
  let finishRead,finishWrite;
  const read=new Promise(done=>{finishRead=done;});
  const write=new Promise(done=>{finishWrite=done;});
  let staleHookRan=false;
  ui.on('slow-test',async()=>{await read;});
  ui.on('slow-test',()=>{staleHookRan=true;});
  first.onLeave(()=>write);
  const boot=ui.emit('slow-test',first);
  const middle=navigation.next();
  const last=navigation.next();
  let ready=false;
  last.ready.then(()=>{ready=true;});
  finishRead();await boot;
  assert(first.signal.aborted && middle.signal.aborted);
  assert.equal(staleHookRan,false);assert.equal(ready,false);
  finishWrite();await last.ready;
  assert.equal(ready,true);
});
test('a focused reader can qualify for a minute without input, then becomes idle',()=>{
  assert.equal(activeSlice(0,60000,0,true),60000);
  assert.equal(activeSlice(60000,100000,0,true),15000);
  assert.equal(activeSlice(100000,110000,0,true),0);
  assert.equal(activeSlice(0,60000,0,false),0);
});
test('paragraph tracking ignores restore and programmatic scroll, then flushes a pending user scroll on exit',()=>{
  let saved=-1;
  let rects=[{top:20,bottom:60},{top:80,bottom:240},{top:260,bottom:340}];
  const scan=trackParagraph(()=>rects,()=>300,p=>{saved=p;});
  scan.scrolled();scan.flush();assert.equal(saved,-1);
  scan.intent();scan.scrolled();scan.flush();assert.equal(saved,1);
  rects=[{top:-300,bottom:-240},{top:-230,bottom:-90},{top:0,bottom:250}];
  scan.programmatic();scan.scrolled();scan.flush();assert.equal(saved,1);
  scan.intent();scan.scrolled();scan.flush();assert.equal(saved,2);
});

