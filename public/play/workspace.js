import {patchMap,fittedMap} from './map-patch.js';
import {renderChatHistory} from './chat-history.js';
import {combatRecordMarkup} from './combat-record.js';
import {groupCombatMessages} from './combat-groups.js';
import {messageGameTime} from './game-time.js';
import {displayMessages,messageNameMarkup} from './message-presentation.js';
import {patchChatLog} from './chat-log.js';
import {paintRuler,mapPoint} from './map-ruler.js';
import {explorationMarkup,previewRoute,openExplorationObject} from './exploration.js';
import {motionStream,matchingMotion} from './token-motion.js';
import {canControl,controllerId,partyCharacters} from './character-control.js';
import {chroniclePage,chronicleCaseScope} from './chronicle.js';
import {gmManagement} from './gm-panel.js';
import {messageAvatar} from './chat-avatar.js';
import {openCharacterSheet,refreshCharacterSheet,rosterCard} from './character-sheet.js';
import {renderStage} from './presentation.js';
import {portraitMarkup} from './portrait-crop.js';
import {clueRecordMarkup} from './clue-record.js';
export function libraryMarkup(room){
 return `<section class="local-library-panel"><h3>PC에 있는 룰북</h3><p class="fine">큰 PDF와 여러 권의 서플리먼트는 업로드 없이 로컬 GM이 검색합니다. 사용할 책과 GM 전용 시나리오는 캠페인 연결에서 선택하세요.</p>${(room?.localLibrary?.books||[]).filter(b=>b.kind==='rule').map(b=>`<div class="local-book-row"><span>${esc(b.title)}</span><small>${b.pages} ${b.format==='pdf'?'쪽':'구간'} · ${b.emptyPages===b.pages?'OCR 필요':'검색 가능'}</small></div>`).join('')||'<p class="fine">로컬 룰북 연결 대기</p>'}</section><h3>웹에 저장한 자료</h3>`;
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
let ctx,zoom=1,selected='',tool='move',filter='all',drag=null,mapEditing=false;
let measurement=null;
let cameraId='',panX=0,panY=0,baseWidth=0,mapAspect=1.5;
let lastRosterClick=null,rosterSelection=null,lastComposeKind='action';
let remoteMotions=[],motionExpiry;
export function receiveTokenMotions(motions=[]){
 remoteMotions=motions.map(m=>({...m,until:Date.now()+Math.min(2500,m.ttl)}));
 paintMotions();clearTimeout(motionExpiry);
 if(remoteMotions.length)motionExpiry=setTimeout(()=>{remoteMotions=[];paintMotions();},Math.max(...remoteMotions.map(m=>m.until-Date.now()))+20);
}
function paintMotions(){
 const map=ctx&&activeMap();if(!map)return;
 for(const token of map.tokens){
  const el=document.querySelector(`[data-token="${CSS.escape(token.id)}"]`);
  if(!el||drag?.token===el)continue;
  const motion=remoteMotions.find(m=>m.until>Date.now()&&matchingMotion(m,map,token));
  const wasMoving=el.classList.contains('remote-moving');
  el.classList.toggle('remote-moving',!!motion);
  if(motion||wasMoving){el.style.left=(motion?.x??token.x)*100+'%';el.style.top=(motion?.y??token.y)*100+'%';}
 }
}
function paintCamera(){
 const board=$('map-board');if(!board)return;
 board.style.width=baseWidth*zoom+'px';board.style.height=baseWidth*zoom/mapAspect+'px';
 board.style.left=panX+'px';board.style.top=panY+'px';
 board.style.setProperty('--map-zoom',zoom);
 paintRuler(measurement,activeMap());
}
function zoomMap(next,x,y){
 const scroll=$('map-scroll');if(!scroll||drag)return;
 const box=scroll.getBoundingClientRect(),px=x??box.width/2,py=y??box.height/2;
 next=Math.max(.35,Math.min(4,next));
 panX=px-(px-panX)*next/zoom;panY=py-(py-panY)*next/zoom;zoom=next;paintCamera();
}
function fitMap(){
 const canvas=$('table-canvas');if(!canvas)return;mapAspect=activeMap()?.exploration?activeMap().columns/activeMap().rows:1.5;
 zoom=1;({baseWidth,panX,panY}=fittedMap(canvas.clientWidth,canvas.clientHeight,mapAspect));paintCamera();
}
const activeMap=()=>ctx.room?.maps?.find(m=>m.id===ctx.room.mapId)||ctx.room?.maps?.[0];
const owner=()=>!!ctx.room&&ctx.room.owner===ctx.me?.id;
const button=(action,label)=>`<button data-work="${action}">${label}</button>`;
export function renderWorkspace(context){
 ctx=context;const {room,me,tab,page,icon}=ctx;const m=activeMap();
 refreshCharacterSheet(room);
 $('portrait-rail').hidden=true;
 const drawer=!(page==='play'&&['map','scene'].includes(tab));$('workspace-drawer').hidden=!drawer;$('workspace-drawer').classList.toggle('checks-drawer',page==='play'&&tab==='checks');$('workspace-drawer').classList.toggle('story-drawer',page==='cases');$('workspace-drawer').classList.toggle('economy-drawer',page==='economy'||page==='inventory'||page==='vehicles');$('workspace-drawer').classList.toggle('world-drawer',page==='places');
 $('drawer-title').textContent=({vehicles:'탈것',places:'장소',characters:'캐릭터',documents:'공개 자료',cases:'시나리오',economy:'상점',inventory:'소지품',gm:'AI GM',history:'기록'})[page]||'판정';
 $('gm-status').setAttribute('aria-expanded',String(page==='gm'));
 const canvas=$('table-canvas');canvas.classList.toggle('map-view',(ctx.stageTab||tab)==='map');const id=`${room?.id||''}/${m?.id||''}`;
 if(cameraId!==id||!baseWidth){if(cameraId.split('/')[0]!==id.split('/')[0])mapEditing=false;cameraId=id;selected='';measurement=null;fitMap();}
 const size=canvas.clientWidth+'/'+canvas.clientHeight;
 if(tab==='map'&&size!==fitSize){fitSize=size;fitMap();}
 const mapWidth=baseWidth*zoom;
 if(!drag){
 if((ctx.stageTab||tab)!=='map'){
  renderStage(canvas,room,'',ctx.conversationTarget,me?.id);
 }else{
  const tokens=(m?.tokens||[]).filter(t=>!t.offMap).map(t=>{const c=room.characters.find(c=>c.id===t.characterId),portrait=c?.portraits?.find(p=>p.id===c.expressionId)||c?.portraits?.[0];return `<button class="map-token ${selected===t.id?'selected':''} ${t.hidden?'hidden-token':''}" data-token="${t.id}" data-character="${esc(t.characterId||'')}" aria-label="${esc(t.name)} 토큰" style="left:${t.x*100}%;top:${t.y*100}%">${portrait?`<span class="portrait-avatar">${portraitMarkup(portrait,'','token')}</span>`:`<span>${esc(t.name.slice(0,1))}</span>`}<small>${esc(t.name)}</small></button>`;}).join('');
  patchMap(canvas,`<div class="map-scroll" id="map-scroll"><div class="map-board ${m?.exploration?'has-exploration':''} ${m?.grid!==false?'with-grid':''}" id="map-board" style="--cols:${m?.columns||24};--rows:${m?.rows||16};width:${mapWidth}px;height:${mapWidth/(m?.exploration?m.columns/m.rows:1.5)}px"><img class="map-image" draggable="false" src="${esc(m?.image||'/play/city-map.png')}" alt="${esc(m?.title||'도시 탐색 지도')}"><div class="grid-overlay"></div>${(m?.pins||[]).map(p=>`<button class="map-pin" data-pin="${p.id}" style="left:${p.x*100}%;top:${p.y*100}%" aria-label="${esc(p.name)}">◇<span>${esc(p.name)}</span></button>`).join('')}${tokens}${explorationMarkup(m)}${(m?.fog||[]).map(f=>`<button class="fog ${owner()?'owner-fog':''}" data-fog="${f.id}" aria-label="가려진 구역${owner()?' 공개':''}" style="left:${f.x*100}%;top:${f.y*100}%;width:${f.w*100}%;height:${f.h*100}%">${owner()?'구역 공개':''}</button>`).join('')}</div></div><div class="map-caption"><span>${esc(m?.title||'이름 없는 골목')}</span><small>${m?.columns||24} × ${m?.rows||16} · 1칸 ${m?.unit||1.5}${m?.distanceUnit==='yd'?'야드':'m'}</small></div>${!room?'<div class="start-overlay"><span class="case-stamp">새 사건 접수</span><h2>도시의 이면에<br>당신의 이야기를 남기세요.</h2><p>테이블을 만들고 룰과 시나리오를 연결하세요.</p><button class="primary" data-work="tables">테이블 열기</button></div>':''}`);
 if(room?.location&&!m)patchMap(canvas,'<div class="place-empty"><span>현재 장소</span><h2>'+esc(room.location.title)+'</h2><p>'+esc(room.location.description)+'</p></div>');
 }
 paintCamera();paintMotions();if($('map-scroll'))$('map-scroll').dataset.tool=tool;
 }
 $('map-toolbar').hidden=page!=='play'||tab!=='map'||!m;
 $('map-toolbar').innerHTML=`<button data-tool="move" class="${tool==='move'?'active':''}" title="토큰 이동" aria-label="토큰 이동">${icon('user')}</button><button data-tool="measure" class="${tool==='measure'?'active':''}" title="거리 측정 · 드래그 / Esc 지우기" aria-label="거리 측정">↔</button>${button('zoom-reset','맞춤')}${button('add-token','토큰')}${owner()&&mapEditing?button('map-edit','지도 설정')+`<button data-tool="fog" class="${tool==='fog'?'active':''}">가림</button><button data-tool="pin" class="${tool==='pin'?'active':''}">표식</button>`+button('map-tools-close','편집 닫기'):''}`;
 if(ctx.composeKind!==lastComposeKind){if(ctx.composeKind==='request')filter='admin';else if(filter==='admin')filter='all';lastComposeKind=ctx.composeKind;}
 const log=$('chat-log');
 $('log-tabs').innerHTML=[['all','전체'],['dialogue','대화'],['roll','판정'],['admin','관리자']].map(([id,label])=>`<button role="tab" aria-selected="${filter===id}" data-filter="${id}" class="${filter===id?'active':''}">${label}</button>`).join('');
 const adminMessage=m=>m.channel==='admin'||['request','adminReply'].includes(m.type);
 const messages=groupCombatMessages(displayMessages(room)).filter(m=>filter==='admin'?adminMessage(m)&&(m.recipient||m.author)===me?.id:!adminMessage(m)&&m.type!=='adjudication'&&((filter==='all'&&(m.type!=='system'||m.conditionResult))||(filter==='roll'?m.conditionResult||['roll','plan','action','combat'].includes(m.type):filter==='dialogue'?['dialogue','gm','gmQuestion','narration','npcDialogue'].includes(m.type):false)));
 const entry=m=>{
  const roll=room.rolls.find(r=>r.id===m.rollId),time=messageGameTime(m);
  return {id:m.id,html:`<article class="chat-entry ${m.type}"><div class="message-heading">${messageAvatar(room,m)}${messageNameMarkup(m)}${m.type==='request'?'<small>관리자 요청</small>':m.type==='npcDialogue'?'<small>NPC</small>':m.type==='plan'?'<small>판정 안내</small>':''}<time title="${esc(time.title)}">${esc(time.label)}</time></div>${m.type==='combat'?combatRecordMarkup(m):roll?`<div class="roll-card"><span class="roll-glyph">⬡</span><strong>${roll.total}</strong><div>${esc(roll.fieldName||roll.formula)}${roll.target!==undefined?` · 목표 ${roll.target}`:''}<small>${roll.dice.join(' + ')}${roll.modifier?` ${roll.modifier>0?'+':''}${roll.modifier}`:''}</small></div><span class="${roll.success?'result-success':'result-failure'}">${roll.free?'자유 굴림':roll.outcome==='criticalSuccess'?'대성공':roll.outcome==='criticalFailure'?'대실패':roll.success?'성공':'실패'}</span></div>${!roll.free?`<details><summary>판정 근거</summary>${esc(roll.source)}<br>${esc(roll.scope)}<br>FP −${roll.costFP} / HP ${roll.hpDelta}</details>`:''}`:`<p>${esc(m.text)}</p>`}</article>`};
 };
 renderChatHistory(log,messages,[me?.id,room?.id,filter].join('/'),entry,(filter==='admin'?'<div class="log-empty"><h2>플레이 중 GM 상담</h2><p>룰과 진행을 질문하세요. 캠페인·케이스·캐릭터 제작은 개인 Codex에서 준비합니다.<br>이 대화는 장면과 턴에 반영되지 않습니다.</p></div>':'<div class="log-empty"><span>✧</span><h2>아직 기록되지 않은 밤</h2><p>캐릭터를 등록하고 첫 행동을 선언하세요.<br>이야기와 판정이 이곳에 남습니다.</p></div>'));

 $('pending-actions').innerHTML=(room?.gmJob?.status==='error'?`<div class="inventory-notice" role="alert"><strong>GM 처리 오류</strong><p>${owner()?esc(room.gmJob.message||'처리에 실패했습니다.'):'요청을 처리하지 못했습니다. 방장에게 오류 확인을 요청하세요.'}</p><button data-page="gm">재시도 · 선언 정리</button></div>`:'')+(room?.actions||[]).filter(a=>a.status==='planned'&&(a.author===me?.id||owner())).map(a=>`<details class="pending-check"><summary>${esc(room.characters.find(c=>c.id===a.actorId)?.name)} · 판정 준비</summary><p>${esc(a.plan.scope)}</p><p class="fine">위험: ${esc(a.plan.risk)} · FP ${a.plan.rule.costFP}</p>${a.author===me?.id||owner()?`<button class="primary" data-resolve="${a.id}">판정 실행</button>`:''}</details>`).join('');
 const job=room?.gmJob||{};
 $('gm-status').innerHTML=`<span class="status-dot ${job.status||'idle'}"></span>${({queued:'GM 요청 대기',running:'GM 진행 중',error:'GM 오류 · 확인',done:'GM 처리 완료',cancelled:'GM 중단'})[job.status]||'GM 준비'}`;
 const roster=$('roster'),focused=document.activeElement?.dataset?.rosterCharacter;
 roster.dataset.partyCount=String(partyCharacters(room).length);roster.style.setProperty('--party-count',Math.max(1,partyCharacters(room).length));
 const rosterHtml=partyCharacters(room).map(c=>rosterCard(c,{active:ctx.activeCharacter()?.id===c.id,controllable:canControl(c,me),state:room.combat?.status==='active'?room.combat.fighters[c.id]:c.combatState,controllerName:room.members.find(m=>m.id===controllerId(c))?.name||''})).join('');
 if(roster.innerHTML!==rosterHtml){
  const scroll=roster.scrollLeft;roster.innerHTML=rosterHtml;roster.scrollLeft=scroll;
  if(focused)roster.querySelector(`[data-roster-character="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
 }
}
function fields(html){return `<div class="form-stack">${html}</div>`;}
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function asset(file){const img=await createImageBitmap(file),canvas=document.createElement('canvas');const scale=Math.min(1,1200/Math.max(img.width,img.height));canvas.width=img.width*scale;canvas.height=img.height*scale;canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);img.close();let data=canvas.toDataURL('image/webp',.7);if(data.length>350000)data=canvas.toDataURL('image/webp',.4);if(data.length>350000)throw Error('더 작은 이미지를 선택하세요.');return data;}
function showSheet(id){openCharacterSheet(ctx,id);}
function campaign(){
 const r=ctx.room,books=r.localLibrary?.books||[],selected=r.campaign?.localBookIds??books.filter(b=>b.kind==='rule'&&b.emptyPages<b.pages).map(b=>b.id);
 ctx.formDialog('캠페인 · 룰과 시나리오',`<label>판정 체계<select name="system"><option value="gurps4" ${r.campaign?.system==='gurps4'?'selected':''}>겁스 4판 · 3d6 성공 판정</option><option value="generic" ${r.campaign?.system!=='gurps4'?'selected':''}>범용 합계 판정</option></select></label><p class="inline-note">사용할 룰북을 변경하면 기존 판정 규칙은 승인 대기로 돌아갑니다.</p>
 <h3>이 PC의 룰북 · 여러 권 선택</h3><p class="fine">원본은 PC에 두고 필요한 발췌문만 Codex GM이 읽습니다. PC의 GM 연결 프로그램이 실행 중이어야 합니다.</p>
 <div class="local-book-list">${books.filter(b=>b.kind==='rule').map(b=>`<label class="check-label"><input type="checkbox" data-local-book value="${b.id}" ${selected.includes(b.id)&&b.emptyPages<b.pages?'checked':''} ${b.emptyPages===b.pages?'disabled':''}><span>${esc(b.title)}<small>${b.pages} ${b.format==='pdf'?'쪽':'구간'} · ${b.emptyPages===b.pages?'OCR 필요':'검색 가능'}</small></span></label>`).join('')||'<p class="fine">로컬 GM에서 룰북 폴더를 연결하면 여기에 표시됩니다.</p>'}</div>
 <label>로컬 시나리오 · GM 전용<select name="localScenarioId"><option value="">선택 안 함</option>${books.filter(b=>b.kind==='scenario').map(b=>`<option value="${b.id}" ${r.campaign?.localScenarioId===b.id?'selected':''}>${esc(b.title)}</option>`).join('')}</select></label>
 <details><summary>웹에 저장한 자료 연결</summary>${[['rulebookId','룰북','public'],['scenarioId','시나리오','all']].map(([key,label,visibility])=>`<label>${label}<select name="${key}"><option value="">선택 안 함</option>${r.documents.filter(d=>visibility==='all'||d.visibility===visibility).map(d=>`<option value="${d.id}" ${r.campaign?.[key]===d.id?'selected':''}>${esc(d.title)}</option>`).join('')}</select></label>`).join('')}</details><label>판본·캠페인 메모<input name="edition" value="${esc(r.campaign?.edition||'')}" maxlength="100"></label>`,p=>ctx.command('campaign',{...p,localBookIds:[...document.querySelectorAll('[data-local-book]:checked')].map(e=>e.value)}));
}
export function workspacePage(){
 const r=ctx.room;if(!r)return '';
 return chroniclePage(ctx)+`<section class="section-page dossier"><details open><summary>인물 · 단서 · 조사 기록</summary><div class="page-heading"><h2>단서 · 조사 기록</h2>${owner()?button('note','기록 추가'):''}</div><p class="inline-note">단서 이름으로 행동을 선언할 수 있습니다. 예: “전표에 적힌 연락처로 전화한다.”</p>${(r.notes||[]).filter(n=>!chronicleCaseScope()||!n.caseId||n.caseId===chronicleCaseScope()).map(n=>clueRecordMarkup(n,r)).join('')||'<p class="empty-note">아직 저장된 단서가 없습니다.</p>'}</details></section>`;
}
export function gmPanel(){return gmManagement(ctx);}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b||!ctx)return;
 if(b.dataset.rosterCharacter){
  const id=b.dataset.rosterCharacter,roomId=ctx.room?.id,now=performance.now();
  const twice=lastRosterClick?.id===id&&lastRosterClick.roomId===roomId&&now-lastRosterClick.at<450;
  lastRosterClick=twice?null:{id,roomId,at:now};
  if(twice){
   if(rosterSelection?.id===id)await rosterSelection.promise;
   if(ctx.room?.id===roomId)showSheet(id);
   return;
  }
  const c=ctx.room?.characters.find(c=>c.id===id);
  if(c&&canControl(c,ctx.me)&&(ctx.activeCharacter()?.id!==id||rosterSelection)){
   const previous=rosterSelection?.promise;
   const selection={id,promise:(async()=>{
    if(previous)await previous;
    if(ctx.room?.id!==roomId||ctx.activeCharacter()?.id===id)return;
    return ctx.command('selectCharacter',{characterId:id});
   })()};rosterSelection=selection;
   await selection.promise;if(rosterSelection===selection)rosterSelection=null;
  }
  return;
 }
 if(b.dataset.filter){filter=b.dataset.filter;if(filter==='admin')ctx.setComposeKind('request');else if(ctx.composeKind==='request')ctx.setComposeKind('dialogue');else ctx.render();return;}
 if(b.dataset.sheet){showSheet(b.dataset.sheet);return;}
 if(b.dataset.sheetRoll){await ctx.command('roll',{formula:b.dataset.sheetRoll,characterId:b.dataset.actor});return;}
 if(b.dataset.tool){measurement=null;tool=tool===b.dataset.tool?'move':b.dataset.tool;ctx.render();return;}
 if(tool==='measure'&&b.closest('#map-scroll'))return;
 if(b.dataset.exploreDoor){openExplorationObject(ctx,'door',b.dataset.exploreDoor,selected);return;}
 if(b.dataset.explorePoint){openExplorationObject(ctx,'point',b.dataset.explorePoint,selected);return;}
 if(b.dataset.fog&&owner()){await ctx.command('fog',{id:b.dataset.fog,remove:true});return;}
 if(b.dataset.pin){const p=activeMap()?.pins.find(p=>p.id===b.dataset.pin);if(p)ctx.modal(p.name,`<p>${esc(p.text)}</p>${owner()?`<button data-remove-pin="${p.id}">표식 삭제</button>`:''}`);return;}
 if(b.dataset.removePin){if(await ctx.command('pin',{id:b.dataset.removePin,remove:true}))ctx.closeModal();return;}
 if(b.hasAttribute('data-close-drawer')){ctx.closeDrawer();return;}
 const action=b.dataset.work;if(!action)return;
 if(action==='tables')return ctx.tables();
 if(action.startsWith('zoom-')){if(action==='zoom-reset')fitMap();else zoomMap(zoom*(action==='zoom-in'?1.25:.8));return;}
 if(!ctx.room)return ctx.tables();
 if(action==='character')return ctx.character('');
 if(action==='portraits')return ctx.portraits();
 if(action==='scene-edit')return ctx.scene();
 if(action==='scenes')return ctx.scenes();
 if(action==='cast')return ctx.cast();
 if(action==='map-tools'){mapEditing=true;ctx.closeDrawer();return;}
 if(action==='map-tools-close'){mapEditing=false;tool='move';ctx.render();return;}
 if(action==='campaign')return campaign();
 if(action==='gm-rules')return ctx.command('queueGM',{kind:'rules'});
 if(action==='gm-stop')return ctx.command('cancelGM');
 if(action==='gm-retry')return ctx.command('retryGM');
 if(action==='gm-cancel-action')return ctx.command('cancelAction',{actionId:b.dataset.actionId});
 if(action==='gm-retry-action')return ctx.command('retryGM',{actionId:b.dataset.actionId});
 if(action==='approve-template')return ctx.command('approveTemplate');
 if(action==='demo'){ctx.modal('체험용 룰·시나리오',`<p class="inline-note">상용 룰북이 아닌 간단한 1d20 하우스룰과 짧은 도입 시나리오입니다. 비어 있는 캠페인에 적용합니다.</p><button id="install-demo" class="primary">체험 자료 적용</button>`,()=>{$('install-demo').onclick=async()=>{if(await ctx.command('demo'))ctx.closeModal();};});return;}
 if(action==='add-token'){
  const map=activeMap(),placeId=ctx.room.location?.placeId;
  const chars=ctx.room.characters.filter(c=>(owner()||canControl(c,ctx.me))&&(!map.exploration||ctx.room.partyCharacterIds.includes(c.id))&&(!placeId||!ctx.room.worldLibrary||!ctx.room.worldLibrary.characterPlaces?.[c.id]||ctx.room.worldLibrary.characterPlaces[c.id]===placeId)&&!map.tokens.some(t=>t.characterId===c.id));
  if(!chars.length&&(!owner()||map.exploration)){ctx.toast('현재 장소에 배치할 캐릭터가 없습니다.');return;}
  ctx.formDialog('토큰 배치',`<label>캐릭터<select name="characterId">${owner()&&!map.exploration?'<option value="">NPC / 표식</option>':''}${chars.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label><label>NPC 이름<input name="name" maxlength="60" value="낯선 인물"></label>${owner()&&!map.exploration?'<label class="check-label"><input type="checkbox" name="hidden">GM에게만 표시</label>':''}`,p=>ctx.command('token',{...p,mapId:map.id,hidden:!map.exploration&&p.hidden==='on'}));return;
 }
 if(action==='map-edit'){
  const m=activeMap();let image=m.image;
  ctx.modal('지도 보관함',`<div class="map-list">${ctx.room.maps.map(m=>`<button data-select-map="${m.id}">${esc(m.title)}</button>`).join('')}</div><form id="map-form" class="form-stack"><label>지도 이름<input name="title" value="${esc(m.title)}" required></label><label>배경 이미지<input id="map-file" type="file" accept="image/png,image/jpeg,image/webp"></label><div class="grid2"><label>가로 칸<input name="columns" type="number" value="${m.columns}" min="4" max="80"></label><label>세로 칸<input name="rows" type="number" value="${m.rows}" min="4" max="80"></label><label>한 칸 거리<input name="unit" type="number" step=".1" value="${m.unit}" min=".1" max="100"></label><label>거리 단위<select name="distanceUnit"><option value="m" ${m.distanceUnit!=='yd'?'selected':''}>미터</option><option value="yd" ${m.distanceUnit==='yd'?'selected':''}>야드</option></select></label></div><label class="check-label"><input type="checkbox" name="grid" ${m.grid?'checked':''}>격자 표시</label><label class="check-label"><input type="checkbox" name="newMap">새 지도로 저장</label><button class="primary">지도 저장</button></form>`,()=>{
   $('map-file').onchange=async e=>{try{image=await asset(e.target.files[0]);ctx.toast('새 지도 이미지 준비됨');}catch(e){ctx.toast(e.message);}};
   document.querySelectorAll('[data-select-map]').forEach(b=>b.onclick=async()=>{if(await ctx.command('mapSelect',{mapId:b.dataset.selectMap}))ctx.closeModal();});
   $('map-form').onsubmit=async e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target));if(await ctx.command('map',{...p,id:p.newMap?undefined:m.id,image,columns:+p.columns,rows:+p.rows,unit:+p.unit,grid:p.grid==='on'}))ctx.closeModal();};
  });return;
 }
 if(action==='note')return ctx.formDialog('사건 기록',`<label>분류<select name="kind"><option value="clue">단서</option><option value="person">인물</option><option value="quest">퀘스트</option><option value="summary">요약</option></select></label><label>제목<input name="title" required maxlength="100"></label><label>내용<textarea name="text" rows="6" required></textarea></label><label>공개 범위<select name="visibility"><option value="public">공개</option><option value="gm">GM 전용</option></select></label>`,p=>ctx.command('note',p));
 if(action==='checkpoint')return ctx.formDialog('복구 지점 저장','<label>이름<input name="title" required maxlength="100" placeholder="골목 진입 전"></label>',p=>ctx.command('checkpoint',p));
 if(action==='scenario-reset'){
  const points=Object.values(ctx.room.scenarioStarts||{}),backup=ctx.room.scenarioResetBackup,current=ctx.room.chronicle.activeCaseId;
  return ctx.modal('시나리오 시작으로',`<p class="inline-note">대화·판정·GM 기억·전투·시간·위치·소지품을 저장된 시점으로 되돌립니다. 진행 중인 GM 요청은 취소되며, 초기화 직전 상태는 따로 보관합니다. 접속 권한과 룰북 연결은 유지됩니다.</p>${points.map(p=>`<button class="session-choice" data-scenario-reset="${esc(p.id)}">${esc(p.title)} · ${p.phase==='opening'?'시작 장면':'준비 완료'}<small>${esc(p.clock?.date||'')} ${esc(p.clock?.time||'')}</small></button>`).join('')||'<p>자동 저장된 시작 지점이 없습니다.</p>'}${current&&!ctx.room.scenarioStarts?.[current]?'<p>기존 시나리오는 현재 상태를 시작 지점으로 지정할 수 있습니다.</p><button id="save-scenario-start">현재를 시작 지점으로 저장</button>':''}${backup?`<hr><button data-scenario-reset="${esc(backup.id)}">직전 초기화 되돌리기 · ${esc(backup.clock?.date||'')} ${esc(backup.clock?.time||'')}</button>`:''}`,()=>{
   document.querySelectorAll('[data-scenario-reset]').forEach(b=>b.onclick=async()=>{b.disabled=true;if(await ctx.command('resetScenario',{checkpointId:b.dataset.scenarioReset})){ctx.closeModal();ctx.openScene();}else b.disabled=false;});
   const save=document.getElementById('save-scenario-start');if(save)save.onclick=async()=>{save.disabled=true;if(await ctx.command('saveScenarioStart',{}))ctx.closeModal();else save.disabled=false;};
  });
 }
 if(action==='restore')return ctx.modal('게임 상태 복구',`<p class="inline-note">캐릭터 수치·지도·판정·룰을 해당 시점으로 되돌립니다. 대화 로그와 요청 중복 방지 기록은 남습니다.</p>${(ctx.room.checkpoints||[]).map(c=>`<button class="session-choice" data-restore="${c.id}">${esc(c.title)}<small>${esc(c.at)}</small></button>`).join('')||'<p>저장한 복구 지점이 없습니다.</p>'}`,()=>{document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=async()=>{if(await ctx.command('restore',{id:b.dataset.restore}))ctx.closeModal();});});
 if(action==='pair')return ctx.modal('온라인 테이블 · PC GM 연결',`<p class="inline-note">이 테이블 전용 연결 파일을 만듭니다. 파일은 GM 권한을 가지므로 친구에게 공유하지 마세요. PC의 .local-data/remote-gm.json에 보관한 뒤 node local/remote-gm.mjs로 연결합니다.</p><button id="pair-download" class="primary">연결 파일 발급</button>`,()=>{$('pair-download').onclick=async()=>{try{const bytes=crypto.getRandomValues(new Uint8Array(32)),token=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');const response=await fetch('/api/gm-relay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'pair',roomId:ctx.room.id,token})});if(!response.ok)throw Error('연결 파일 발급 실패');download({url:location.origin,roomId:ctx.room.id,token},'remote-gm.json');ctx.closeModal();}catch(e){ctx.toast(e.message);}};});
});
document.addEventListener('pointerdown',e=>{
 if(!ctx||![0,1].includes(e.button)||drag||!e.target.closest('#map-scroll'))return;
 const mode=e.button===1?'pan':tool;
 if(!['pan','measure'].includes(mode)&&e.target.closest('.map-pin,.fog,.explore-object'))return;
 const board=$('map-board'),box=board.getBoundingClientRect(),token=mode==='move'?e.target.closest('[data-token]'):null;
 if(mode==='move'&&!token)return;
 const t=activeMap()?.tokens.find(t=>t.id===token?.dataset.token);
 if(token&&tool==='move'){const c=ctx.room.characters.find(c=>c.id===t?.characterId);if(c?(!canControl(c,ctx.me)||activeMap()?.exploration&&c.isNPC&&!c.controllers?.length&&!ctx.room.partyCharacterIds.includes(c.id)):!owner()){if(c?.isNPC&&activeMap()?.exploration){e.preventDefault();openExplorationObject(ctx,'npc',c.id,selected);}return;}}
 if(token){token.classList.remove('remote-moving');selected=token.dataset.token;document.querySelectorAll('.map-token.selected').forEach(t=>t.classList.remove('selected'));token.classList.add('selected');}
 e.preventDefault();drag={pointer:e.pointerId,x:e.clientX,y:e.clientY,box,token,mode,panX,panY,tx:t?.x,ty:t?.y,from:t?{mapId:activeMap().id,x:t.x,y:t.y}:null};
 drag.roomId=ctx.room?.id;
 if(mode==='measure'){const a=mapPoint(box,e.clientX,e.clientY);measurement={a,b:a};paintRuler(measurement,activeMap());}
 $('map-scroll').setPointerCapture(e.pointerId);$('map-scroll').classList.add('dragging');
});
document.addEventListener('pointermove',e=>{
 if(!drag||drag.pointer!==e.pointerId)return;
 if(drag.mode==='measure'){measurement.b=mapPoint(drag.box,e.clientX,e.clientY);paintRuler(measurement,activeMap());return;}
 if(!['move','pan'].includes(drag.mode))return;
 const d=drag,dx=e.clientX-d.x,dy=e.clientY-d.y;
 if(d.token){d.token.style.left=Math.max(0,Math.min(1,d.tx+dx/d.box.width))*100+'%';d.token.style.top=Math.max(0,Math.min(1,d.ty+dy/d.box.height))*100+'%';
  if(activeMap()?.exploration){d.token.classList.add('route-pending');previewRoute(activeMap(),{x:d.tx,y:d.ty},{x:Math.max(0,Math.min(1,d.tx+dx/d.box.width)),y:Math.max(0,Math.min(1,d.ty+dy/d.box.height))});}
  if(!activeMap()?.exploration&&Math.hypot(dx,dy)>3){
   d.stream??=motionStream((op,payload)=>ctx.preview(op,payload,d.roomId),{id:d.token.dataset.token,from:d.from},()=>ctx.toast('이동 미리보기 연결이 끊겼습니다. 놓은 위치는 별도로 저장합니다.'));
   d.stream.point(Math.max(0,Math.min(1,d.tx+dx/d.box.width)),Math.max(0,Math.min(1,d.ty+dy/d.box.height)));
  }
 }
 else{panX=d.panX+dx;panY=d.panY+dy;paintCamera();}
});
document.addEventListener('pointerup',async e=>{
 if(!drag||drag.pointer!==e.pointerId)return;const d=drag;drag=null;d.stream?.pause();
 $('map-scroll')?.classList.remove('dragging');const m=activeMap();if(!m){d.stream?.stop();ctx.render();return;}
 const at=(x,y)=>({x:Math.max(0,Math.min(1,(x-d.box.left)/d.box.width)),y:Math.max(0,Math.min(1,(y-d.box.top)/d.box.height))});const a=at(d.x,d.y),b=at(e.clientX,e.clientY);
 if(d.mode==='move'&&d.token&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>3){
  const snap=(v,n)=>m.exploration?(Math.min(n-1,Math.max(0,Math.floor(v*n)))+.5)/n:Math.max(0,Math.min(1,Math.round(v*n)/n));
  await ctx.command('moveToken',{id:d.token.dataset.token,from:d.from,x:snap(d.tx+(e.clientX-d.x)/d.box.width,m.columns),y:snap(d.ty+(e.clientY-d.y)/d.box.height,m.rows)});
 }
 d.stream?.stop();
 if(d.mode==='measure'){measurement.b=b;paintRuler(measurement,m);}
 if(d.mode==='fog'&&owner()&&Math.abs(b.x-a.x)>.01&&Math.abs(b.y-a.y)>.01)await ctx.command('fog',{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)});
 if(d.mode==='pin'&&owner())ctx.formDialog('지도 표식','<label>이름<input name="name" maxlength="80" required></label><label>설명<textarea name="text"></textarea></label>',p=>ctx.command('pin',{...p,...b}));
 if(['move','pan'].includes(d.mode))ctx.render();
});
document.addEventListener('auxclick',e=>{if(e.button===1&&e.target.closest('#map-scroll'))e.preventDefault();});
document.addEventListener('pointercancel',e=>{if(drag?.pointer===e.pointerId){if(drag.mode==='measure')measurement=null;drag.stream?.stop();drag=null;ctx.render();}});
window.addEventListener('blur',()=>{if(drag){if(drag.mode==='measure')measurement=null;drag.stream?.stop();drag=null;ctx.render();}});
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||$('modal')?.open||!measurement)return;e.preventDefault();e.stopImmediatePropagation();measurement=null;if(drag?.mode==='measure'){const scroll=$('map-scroll');if(scroll?.hasPointerCapture(drag.pointer))scroll.releasePointerCapture(drag.pointer);scroll?.classList.remove('dragging');drag=null;}paintRuler(null,activeMap());});
document.addEventListener('wheel',e=>{
 const scroll=e.target.closest('#map-scroll');if(!scroll||!ctx)return;
 e.preventDefault();const box=scroll.getBoundingClientRect(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?box.height:1);
 zoomMap(zoom*Math.exp(-Math.max(-300,Math.min(300,delta))*.002),e.clientX-box.left,e.clientY-box.top);
},{passive:false});
document.addEventListener('keydown',async e=>{const b=e.target.closest('[data-token]');if(!b||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete'].includes(e.key))return;e.preventDefault();const m=activeMap(),t=m.tokens.find(t=>t.id===b.dataset.token);if(e.key==='Delete'){await ctx.command('removeToken',{id:t.id});return;}await ctx.command('moveToken',{id:t.id,x:Math.max(0,Math.min(1,t.x+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)/m.columns)),y:Math.max(0,Math.min(1,t.y+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0)/m.rows))});document.querySelector(`[data-token="${t.id}"]`)?.focus();});
export async function readDocument(file){
 if(file.size>20*1024*1024)throw Error('PDF는 20MB 이하로 나누어 주세요.');
 if(!file.name.toLowerCase().endsWith('.pdf')){const text=await file.text();if(text.length>200000)throw Error('자료는 20만 자 이하로 나누어 주세요.');return text;}
 const pdfjs=await import('./vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/play/vendor/pdfjs/pdf.worker.mjs';
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,cMapUrl:'/play/vendor/pdfjs/cmaps/',cMapPacked:true});const doc=await task.promise;
 try{if(doc.numPages>500)throw Error('PDF는 500쪽 이하로 나누어 주세요.');let text='';for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i),content=await page.getTextContent();text+=`\n[페이지 ${i}]\n`+content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('');if(text.length>200000)throw Error('추출문이 20만 자를 넘습니다. 장별로 나누어 주세요.');}if(text.replace(/\[페이지 \d+\]/g,'').trim().length<20)throw Error('텍스트가 없는 스캔 PDF입니다. OCR한 PDF 또는 텍스트를 사용하세요.');return text;}finally{await doc.destroy();}
}

let fitSize='';
const resizeMap=new ResizeObserver(()=>{if(!ctx||drag)return;const canvas=$('table-canvas');if(!canvas?.classList.contains('map-view'))return;const size=canvas.clientWidth+'/'+canvas.clientHeight;if(size===fitSize)return;fitSize=size;fitMap();});
resizeMap.observe($('table-canvas'));
window.addEventListener('resize',()=>{if(ctx&&!drag)ctx.render();});

document.addEventListener('dblclick',e=>{const t=e.target.closest('[data-token]');if(!t||!ctx||tool==='measure'||!activeMap()?.exploration)return;const token=activeMap().tokens.find(v=>v.id===t.dataset.token),c=ctx.room.characters.find(v=>v.id===token?.characterId);if(c?.isNPC)openExplorationObject(ctx,'npc',c.id,selected);});
