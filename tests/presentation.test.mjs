import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, mutateRoom } from '../lib/table-engine.mjs';
import { imageSource,portraitSet } from '../lib/presentation.mjs';
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const host = { id:'host', name:'Host' }, guest = { id:'guest', name:'Guest' };
function setup() {
  let room = createRoom(host);
  const run = (op,payload={},user=host) => { const out=mutateRoom(room,user,{op,payload,expectedVersion:room.version,requestId:crypto.randomUUID()});room=out.room;return out.result; };
  run('character',{name:'Host character'});run('join',{code:room.joinCode},guest);run('character',{name:'Guest character'},guest);
  return {run,get room(){return room;}};
}
test('scene reload preserves resources and rolls; dialogue carries validated expression',()=>{
  const s=setup();
  s.run('portraits',{portraits:[{id:'neutral',label:'기본',image:pixel}]});
  const c=s.room.characters[0];
  s.run('scene',{title:'Hall',narration:'Welcome',speakerId:c.id,expressionId:'neutral'});
  const {sceneId}=s.run('saveScene');
  s.run('resource',{characterId:c.id,hp:4,fp:3,reason:'Test persistent resources'});
  s.run('roll',{formula:'1d6'});
  const rolls=structuredClone(s.room.rolls);
  s.run('scene',{title:'Street',narration:'Outside',speaker:'GM'});
  s.run('loadScene',{sceneId});
  assert.equal(s.room.scene.title,'Hall');assert.equal(s.room.characters[0].hp,4);assert.equal(s.room.characters[0].fp,3);assert.deepEqual(s.room.rolls,rolls);
  s.run('message',{kind:'dialogue',text:'I am here.',expressionId:'neutral'});
  assert.equal(s.room.scene.speakerId,c.id);assert.equal(s.room.messages.at(-1).expressionId,'neutral');
  assert.equal(s.room.characters[0].expressionId,'neutral');
  const before=structuredClone(s.room);
  assert.throws(()=>s.run('message',{kind:'dialogue',text:'Invalid',expressionId:'forged'}));assert.deepEqual(s.room,before);
});
test('editable crop preserves the source and rejects out-of-bounds or non-finite rectangles',()=>{
 const crop={x:.2,y:.1,w:.3,h:.4},p={id:'neutral',label:'기본',image:pixel,crop,tokenFocus:'face'};
 assert.deepEqual(portraitSet([p])[0],p);
 for(const invalid of [{...crop,x:-.1},{...crop,w:0},{...crop,y:.8},{...crop,x:NaN},{...crop,h:Infinity},{...crop,w:1e-20}]){
  assert.throws(()=>portraitSet([{...p,crop:invalid}]),e=>e.status===400);
 }
 const s=setup();s.run('portraits',{portraits:[p]});const original=s.room.characters[0].portraits[0].image;
 s.run('portraits',{portraits:[{...p,crop:{x:0,y:0,w:.5,h:.5}}]});
 assert.equal(s.room.characters[0].portraits[0].image,original);
 assert.equal(s.room.characters[0].hp,10);
});
test('portrait and scene input cannot change resources, impersonate ownership, or load remote code',()=>{
  const s=setup();
  assert.throws(()=>s.run('cast',{name:'NPC'},guest),e=>e.status===403);
  assert.throws(()=>s.run('saveScene',{},guest),e=>e.status===403);
  for(const value of ['https://tracker.example/image.png','javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=']) assert.throws(()=>imageSource(value),e=>e.status===400);
  assert.throws(()=>s.run('portraits',{characterId:s.room.characters[0].id,hp:999,portraits:[{id:'neutral',label:'기본',image:pixel}]},guest),e=>e.status===403);
  assert.equal(s.room.characters[0].portraits,undefined);assert.equal(s.room.characters[1].hp,10);
  assert.throws(()=>s.run('scene',{title:'Hall',narration:'Text',speakerId:'missing'}));
  assert.throws(()=>s.run('portraits',{portraits:[{id:'x',label:'a',image:pixel},{id:'x',label:'b',image:pixel}]}));
});
