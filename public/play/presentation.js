import {readingKey,loadReading,saveReading} from './reading-position.js';
import {uploadOriginalPortrait} from './portrait-image.js';
import {portraitMarkup,cropEditor} from './portrait-crop.js';
import {sceneSpeakerMarkup} from './message-presentation.js';
import {sceneCast} from './scene-cast.js';
import {sceneSequence} from './scene-sequence.js';
const readingPositions=new Map();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = id => document.getElementById(id);
export const sceneChevron=direction=>`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${direction<0?'M14 5 7 12l7 7':'m10 5 7 7-7 7'}"/></svg>`;
export function stageMarkup(room,focusId) {
  const scene = room?.scene || {};
  const background = scene.background && scene.background !== 'alley' ? scene.background : '/play/alley.png';
  return `<div class="novel-stage" data-scene-room="${esc(room?.id||'')}"><img class="scene-image" ${scene.placeId&&!scene.background?'hidden':''} src="${esc(background)}" alt="${esc(scene.title || '비 내리는 밤길')}"><span class="stage-marker">${esc(scene.title||'')}</span>${sceneCast(room,focusId).map(c=>`<div class="scene-person ${c.active?'is-speaking':'is-listening'}" data-stage-side="${c.side}">${castImage(c)}</div>`).join('')}<div class="novel-dialogue" ${scene.narration?'':'hidden'}><span class="speaker">${sceneSpeakerMarkup(scene)}</span><p class="scene-dialogue-text" tabindex="0" role="region" aria-label="장면 대사">${esc(scene.narration||'')}</p></div></div>`;
}
function castImage(c){return c.portrait?`<img class="standing-portrait" data-person="${esc(c.person.id)}" src="${esc(c.portrait.image)}" alt="${esc(c.person.name)} · ${esc(c.portrait.label)}" draggable="false">`:'';}
// Keep the stage mounted: chat updates must not restart portrait animations.
export function renderStage(canvas,room,controls='',focusId='',account=''){
 const key=readingKey(account,room);let storage;try{storage=localStorage;}catch{}
 if(!readingPositions.has(key))readingPositions.set(key,loadReading(key,storage));
 const original=room,sequence=sceneSequence(room,readingPositions.get(key));
 room=sequence.room;
 // Preserve historical dialogue casting while the user is reading earlier lines.
 if(original?.combat?.status==='active'&&(!sequence.beats.length||sequence.index===sequence.beats.length-1))room={...room,_combatView:original};
 const position=(index,manual=!sequence.updated&&!!(readingPositions.get(key)?.manual||readingPositions.get(key)?.restored))=>({key:sequence.key,index,startId:sequence.beats[0]?.id,messageId:sequence.beats[index]?.id,latestId:sequence.latestId,hasUnread:index<sequence.beats.length-1,manual});
 if(sequence.key){const p=position(sequence.index);readingPositions.set(key,p);saveReading(key,p,storage);}
 const bindSequence=()=>{
  const dialogue=canvas.querySelector('.novel-dialogue');
  const readingKey=sequence.beats[sequence.index]?.id||JSON.stringify([room?.scene?.speakerId,room?.scene?.speaker,room?.scene?.narration]);
  if(dialogue._readingKey!==readingKey)dialogue.querySelector('p').scrollTop=0;
  dialogue._readingKey=readingKey;
  let footer=dialogue.querySelector('.scene-reading');
  if(sequence.beats.length<2){footer?.remove();return;}
  if(!footer){footer=document.createElement('div');footer.className='scene-reading';dialogue.append(footer);}
  const markup=`<button class="scene-arrow" data-beat="-1" aria-label="이전 대사" title="이전 대사" ${sequence.index===0?'disabled':''}>${sceneChevron(-1)}</button><button class="scene-arrow" data-beat="1" aria-label="다음 대사" title="다음 대사" ${sequence.index===sequence.beats.length-1?'disabled':''}>${sceneChevron(1)}</button>`;
  if(footer.innerHTML!==markup)footer.innerHTML=markup;
  footer.onclick=e=>{
   const button=e.target.closest('[data-beat]');if(!button||button.disabled)return;
   const p=position(sequence.index+Number(button.dataset.beat),true);readingPositions.set(key,p);saveReading(key,p,storage);
   renderStage(canvas,original,controls,focusId,account);
  };
 };
 let stage=canvas.querySelector('.novel-stage');
 if(!stage||stage.dataset.sceneRoom!==(room?.id||'')){
  canvas.innerHTML=stageMarkup(room,focusId)+`<div class="scene-operation">${controls}</div>`;
  bindSequence();
  return;
 }
 const scene=room?.scene||{},background=scene.background&&scene.background!=='alley'?scene.background:'/play/alley.png';
 const bg=stage.querySelector('.scene-image');if(bg.getAttribute('src')!==background)bg.src=background;
 bg.alt=scene.title||'비 내리는 밤길';bg.hidden=!!scene.placeId&&!scene.background;
 const marker=stage.querySelector('.stage-marker');marker.textContent=scene.title||'';
 const dialogue=stage.querySelector('.novel-dialogue');
 dialogue.hidden=!scene.narration;
 const label=sceneSpeakerMarkup(scene);if(dialogue.querySelector('.speaker').innerHTML!==label)dialogue.querySelector('.speaker').innerHTML=label;
 const text=dialogue.querySelector('p'),narration=scene.narration||'';
 if(text.textContent!==narration)text.textContent=narration;
 for(const c of sceneCast(room,focusId)){
  const slot=stage.querySelector(`[data-stage-side="${c.side}"]`),html=castImage(c);
  slot.classList.toggle('is-speaking',c.active);slot.classList.toggle('is-listening',!c.active);
  if((slot._desired??slot.innerHTML)===html)continue;
  slot._desired=html;
  const revision=slot._revision=(slot._revision||0)+1;
  const old=slot.querySelector('img'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  old?.getAnimations().forEach(a=>a.cancel());
  const replace=()=>{
   if(!slot.isConnected||slot._revision!==revision)return;
   slot.innerHTML=html;
   if(!reduced)slot.querySelector('img')?.animate([{opacity:0,transform:`translateX(${c.side==='left'?'-':'+'}10px)`},{opacity:1,transform:'translateX(0)'}],{duration:220,easing:'ease-out'});
  };
  if(old&&!reduced)old.animate([{opacity:1},{opacity:0}],{duration:120,fill:'forwards'}).finished.then(replace,()=>{});
  else replace();
 }
 const operations=canvas.querySelector('.scene-operation');
 if(operations.innerHTML!==controls)operations.innerHTML=controls;
 bindSequence();
}
export function portraitRail(room,me){
 if(!room?.characters.length)return '';
 return `<div class="portrait-rail-heading"><span>함께하는 인물</span>${room.characters.some(c=>c.owner===me?.id)?'<button data-work="portraits">초상화</button>':''}</div><div class="portrait-cards">${room.characters.map(c=>{
  const active=room.scene.speakerId===c.id;
  const p=c.portraits?.find(p=>p.id===(active?room.scene.expressionId:c.expressionId))||c.portraits?.[0];
  return `<button class="portrait-card ${active?'speaking':''}" data-sheet="${c.id}" aria-label="${esc(c.name)} 캐릭터 시트">${p?portraitMarkup(p,c.name+' · '+p.label):`<span class="portrait-placeholder">${esc(c.name.slice(0,1))}<small>초상화 미등록</small></span>`}<span class="portrait-name"><b>${esc(c.name)}</b><small>${active?'대화 중':p?esc(p.label):'캐릭터 시트'}</small></span></button>`;
 }).join('')}</div>`;
}
async function loadImage(file) {
  if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type)) throw Error('PNG, JPEG, WebP 파일을 선택하세요.');
  if (file.size > 10 * 1024 * 1024) throw Error('10MB 이하의 이미지를 선택하세요.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    // Complex transparent art needs a smaller raster, not an opaque background.
    for (const edge of [1000,850,700,550,400,250]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [.85,.6,.4]) {
        const data = canvas.toDataURL('image/webp', quality);
        if (data.length <= 350000 && /^data:image\/(webp|png);base64,/.test(data)) return data;
      }
    }
    throw Error('이미지를 더 작게 준비해주세요. 저장 한도는 250KB입니다.');
  } finally { bitmap.close(); }
}
export function portraitsDialog(ctx, npc = false, characterId) {
  const active=ctx.room.members.find(m=>m.id===ctx.me.id)?.activeCharacterId;
  const person = npc ? null : characterId?ctx.room.characters.find(c=>c.id===characterId):ctx.room.characters.find(c=>c.id===active&&c.owner===ctx.me.id)||ctx.room.characters.find(c=>c.owner===ctx.me.id);
  if (!npc && !person) return ctx.toast('캐릭터를 먼저 등록하세요.');
  let portraits = structuredClone(person?.portraits || []),loading=false;
  ctx.modal(npc ? 'NPC 초상화 등록' : person.name+' · 초상화', `<form id="portrait-form" class="form-stack">${npc ? '<label>NPC 이름<input name="name" maxlength="60" required></label>' : `<p>${esc(person.name)}</p>`}<div id="portrait-list" class="portrait-list"></div><div id="portrait-editor" hidden></div><label>새 초상화 이름<input id="portrait-label" maxlength="40" placeholder="기본, 미소, 당황…"></label><label>이미지 추가<input id="portrait-file" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="fine">시트용 3:4 → 토큰용 1:1 순서로 구도를 맞춘 뒤 저장하세요. 장면에서는 원본 전체를 표시합니다. PNG·JPEG·WebP 원본 그대로, 장당 10MB · 최대 6개.</p><button class="primary">초상화 저장</button></form>`, () => {
    const form=$('portrait-form'),editor=$('portrait-editor'),list=$('portrait-list'),file=$('portrait-file'),label=$('portrait-label');
    const editing=()=>loading||!editor.hidden;
    const paint=()=>{
      list.innerHTML=portraits.map((p,i)=>`<div>${portraitMarkup(p,p.label)}<span>${esc(p.label)}</span><button type="button" data-edit-portrait="${i}" aria-label="${esc(p.label)} 시트 구도">시트 구도</button><button type="button" data-token-portrait="${i}" aria-label="${esc(p.label)} 토큰 구도">토큰 구도</button><button type="button" data-remove-portrait="${i}" aria-label="${esc(p.label)} 삭제">삭제</button></div>`).join('');
      list.querySelectorAll('[data-remove-portrait]').forEach(b=>b.onclick=()=>{if(editing())return ctx.toast('구도 편집을 먼저 적용하거나 취소하세요.');portraits.splice(Number(b.dataset.removePortrait),1);paint();});
      list.querySelectorAll('[data-edit-portrait]').forEach(b=>b.onclick=()=>{if(editing())return ctx.toast('구도 편집을 먼저 적용하거나 취소하세요.');const p=portraits[Number(b.dataset.editPortrait)];openEditor(p,crop=>{p.crop=crop;paint();});});
    };
    list.addEventListener('click',e=>{
      const b=e.target.closest('[data-token-portrait]');if(!b)return;
      if(editing())return ctx.toast('구도 편집을 먼저 적용하거나 취소하세요.');
      const p=portraits[Number(b.dataset.tokenPortrait)];openEditor(p,crop=>{p.tokenCrop=crop;paint();},{kind:'token'});
    });
    const openEditor=async(p,apply,options={})=>{
      try{await cropEditor(editor,p,apply,()=>{},options);if(form.isConnected)editor.scrollIntoView({block:'nearest'});}
      catch(e){editor.hidden=true;ctx.toast(e.message||'이미지를 불러올 수 없습니다.');}
    };
    paint();
    file.onchange=async()=>{
      if(editing()){file.value='';return ctx.toast('구도 편집을 먼저 적용하거나 취소하세요.');}
      if(!file.files[0])return;
      if(portraits.length>=6){file.value='';return ctx.toast('초상화는 6개까지 등록할 수 있습니다.');}
      loading=true;
      try{
        const image=await uploadOriginalPortrait(file.files[0]);if(!form.isConnected)return;
        const p={id:crypto.randomUUID(),label:label.value.trim()||(portraits.length?'초상화 '+(portraits.length+1):'기본'),image,...(npc||person?.isNPC?{tokenFocus:'face'}:{})};
        await openEditor(p,crop=>{p.crop=crop;openEditor(p,tokenCrop=>{portraits.push({...p,tokenCrop});label.value='';paint();},{kind:'token',applyLabel:'구도 완료'});},{applyLabel:'다음: 토큰 구도'});
      }catch(e){ctx.toast(e.message);}finally{loading=false;file.value='';}
    };
    form.onsubmit=async e=>{
      e.preventDefault();if(editing())return ctx.toast('구도 편집을 먼저 적용하거나 취소하세요.');
      const payload={portraits,...(npc?{name:new FormData(form).get('name')}:{characterId:person.id,expressionId:portraits.some(p=>p.id===person.expressionId)?person.expressionId:portraits[0]?.id||''})};
      if(await ctx.command(npc?'cast':'portraits',payload))ctx.closeModal();
    };
  });
}
export function sceneDialog(ctx) {
  const scene = ctx.room.scene, cast = [...ctx.room.characters, ...(ctx.room.cast || [])];
  let background = scene.background === 'alley' ? '/play/alley.png' : scene.background || '/play/alley.png';
  ctx.modal('장면 열기', `<form id="scene-form" class="form-stack"><label>장면 제목<input name="title" value="${esc(scene.title)}" maxlength="100" required></label><label>화자<select name="speakerId" id="scene-speaker"><option value="">GM · 내레이션</option>${cast.map(c=>`<option value="${c.id}" ${c.id===scene.speakerId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>초상화<select name="expressionId" id="scene-expression"></select></label><label>배경 이미지<input id="scene-file" type="file" accept="image/png,image/jpeg,image/webp"></label><p id="scene-image-status" class="fine">현재 배경 유지</p><button type="button" id="default-background">기본 배경 사용</button><label>상황과 대사<textarea name="narration" maxlength="5000" rows="6" required>${esc(scene.narration)}</textarea></label><label><input type="checkbox" name="appearanceOnly"> 배경·제목만 변경 (대사 추가 안 함)</label><button class="primary">장면 적용</button></form>`, () => {
    const expressions = () => {const c = cast.find(c=>c.id===$('scene-speaker').value);$('scene-expression').innerHTML = '<option value="">기본 초상화</option>'+(c?.portraits||[]).map(p=>`<option value="${p.id}" ${p.id===scene.expressionId?'selected':''}>${esc(p.label)}</option>`).join('');};
    expressions(); $('scene-speaker').onchange=expressions;
    $('scene-file').onchange=async e=>{try{background=await loadImage(e.target.files[0]);$('scene-image-status').textContent='새 배경 준비됨';}catch(e){ctx.toast(e.message);}};
    $('default-background').onclick=()=>{background='/play/alley.png';$('scene-image-status').textContent='기본 배경 선택됨';};
    $('scene-form').onsubmit=async e=>{e.preventDefault();if(await ctx.command('scene',{...Object.fromEntries(new FormData(e.target)),appearanceOnly:new FormData(e.target).has('appearanceOnly'),speaker:'GM',background}))ctx.closeModal();};
  });
}
export function scenesDialog(ctx) {
  ctx.modal('저장한 장면', `<p class="inline-note">배경·화자·초상화·도입문을 함께 불러옵니다. 캐릭터 수치와 주사위 기록은 유지됩니다.</p>${(ctx.room.scenePresets||[]).map(s=>`<button class="session-choice" data-load-scene="${s.id}">${esc(s.title)}<small>${esc(s.speaker||'GM')}</small></button>`).join('')||'<p class="empty-note">저장한 장면이 없습니다.</p>'}<button id="save-current-scene" class="primary">현재 장면 저장</button>`,()=>{
    $('modal-body').querySelectorAll('[data-load-scene]').forEach(b=>b.onclick=async()=>{if(await ctx.command('loadScene',{sceneId:b.dataset.loadScene}))ctx.closeModal();});
    $('save-current-scene').onclick=async()=>{if(await ctx.command('saveScene',{}))ctx.closeModal();};
  });
}
