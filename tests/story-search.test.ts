import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesStory} from '../public/story-search.js';
import {storyFocusEntries} from '../src/story-focus.ts';

test('Library searches the full focus list while only strong characters qualify for the preview',()=>{
  const focus=storyFocusEntries({
    characters:[{text:'茶',pinyin:'chá',meaning:'tea'}],review:[],reviewCharacters:['茶','水'],
    wordReview:[{text:'茶',pinyin:'chá'},{text:'馆',pinyin:'guǎn',meaning:'hall'}]
  });
  assert.deepEqual(focus.filter(item=>item.strong).map(item=>item.text),['茶','水']);
  const story={title:'Rainy afternoon',focus,hskLevel:2,difficulty:'easy',opened:true,finished:false};
  const filters={q:'',status:'reading',level:'2',difficulty:'easy'};
  for(const q of ['RAINY','茶','cha','chá','cha2','tea','馆','hall'])
    assert.ok(matchesStory(story,{...filters,q}),q);
  for(const change of [{q:'茶馆'},{level:'1'},{level:'3'},{difficulty:'hard'},{status:'finished'}])
    assert.ok(!matchesStory(story,{...filters,...change}));
  assert.deepEqual(storyFocusEntries(undefined),[]);
});
