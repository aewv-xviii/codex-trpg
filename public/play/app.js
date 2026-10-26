import {vehiclesPage} from './vehicles.js';
import {composerRoute,parseComposerRoute,composerMessageRoute} from './composer-route.js';
import {messageAvatar} from './chat-avatar.js';
import {dialogueTargets,normalizeDialogueTarget} from './dialogue-flow.js';
import {bindContentPacks} from './content-packs.js';
import {worldPage,bindWorld} from './world-library.js';
import {openCharacterSheet} from './character-sheet.js';
import {combatProfileDialog} from './combat.js';
import {economyPage,bindEconomy,won} from './economy.js';
import {updateGMConnection} from './gm-progress-view.js';
import {campaignSetup} from './campaign-setup.js';
import {renderCombat} from './combat.js';
import {canControl,partyCharacters,controllerId,rosterEligible} from './character-control.js';
import {accountManager} from './accounts.js';
import { receiveTokenMotions, renderWorkspace, workspacePage, gmPanel, readDocument } from './workspace.js';
import { portraitsDialog, sceneDialog, scenesDialog } from './presentation.js';
import { sessionManager } from './sessions.js';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paths = {
  bag:'M8 7V5a4 4 0 0 1 8 0v2 M6 7h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z M8 12h8v6H8z',
  book:'M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H3z M21 4h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h5z',
  user:'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2z M16 5a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  file:'M14 2H5v20h14V7z M14 2v5h5 M8 12h8 M8 16h8',
  clock:'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  image:'M3 3h18v18H3z M3 16l6-6 6 6 3-3 3 3 M16 7h.01',
  dice:'M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10 M8 6l.01.01 M16 15l.01.01 M7 14l.01.01',
  pen:'M16 3l5 5L8 21H3v-5z M13 6l5 5',
  chat:'M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-.8L3 21l1.8-5A9 9 0 1 1 21 11',
  people:'M15 21v-2a5 5 0 0 0-5-5H7a5 5 0 0 0-5 5v2 M12 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 3a4 4 0 0 1 0 8 M22 21v-2a5 5 0 0 0-4-4.9',
  send:'M22 2L9 15 M22 2l-7 20-6-7-7-6z',
  link:'M10 13a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l2-2',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 2h6l1 4 4 1 2 5-3 3 1 4-5 3-3-3-4 1-3-5 3-3-1-4 4-2z'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
let room = null, me = null, rooms = [], local = false, page = 'play', tab = 'scene', stageTab = 'scene', kind = 'action', busy = false, timer;
let dialogueTarget='@gm',draftEventId='';
let inventoryCharacterId='',inventoryShopId='';
const composerDrafts=new Map();
const draftKey=()=>kind==='dialogue'?'dialogue/'+dialogueTarget:kind;
function changeComposer(next,target=dialogueTarget){const before=draftKey();composerDrafts.set(before,$('message').value);kind=next;dialogueTarget=target;const after=draftKey();if(before!==after)$('message').value=composerDrafts.get(after)||'';if(room)sessionStorage.setItem('night-composer/'+room.id,composerRoute(kind,dialogueTarget));}
let refreshing=false,syncFailures=0,syncTimer,syncGeneration=0;
const owner = () => !!room && !!me && room.owner === me.id;
const controlled=c=>canControl(c,me);
const myCharacter = () => partyCharacters(room).find(c=>c.id===room.members.find(m=>m.id===me?.id)?.activeCharacterId&&controlled(c))||partyCharacters(room).find(controlled);
const presentationContext = () => ({ room, me, modal, closeModal, command, toast });
const date = value => new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(timer); timer = setTimeout(() => $('toast').hidden = true, 6000); }
function modal(title, body, setup) {
  if(busy)return;
  if($('modal').open && $('modal-title').textContent===title){closeModal();return;}
  $('modal-title').textContent=title;$('modal-body').innerHTML=body;
  if(!$('modal').open)$('modal').show();setup?.();
}
function closeModal() { $('modal').classList.remove('replay-modal'); $('modal').close(); }
$('modal-close').onclick = closeModal;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&$('modal').open)closeModal();});
async function request(input) {
  const response = await fetch('/api/table', input ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {});
  const data = await response.json(); if (!response.ok) throw Object.assign(Error(data.error || '연결에 실패했습니다.'), { status: response.status }); return data;
}
function accept(data) { if(data.deletedRoomId&&data.deletedRoomId===room?.id){room=null;localStorage.removeItem('night-table-room');$('message').value='';page='play';tab='scene';stageTab='scene';} if (data.me) me = data.me; if (data.local !== undefined) local = data.local; if (data.room) { if(room?.id!==data.room.id){$('message').value='';const saved=parseComposerRoute(sessionStorage.getItem('night-composer/'+data.room.id));kind=saved.kind;dialogueTarget=saved.target;draftEventId='';composerDrafts.clear();page='play';tab='scene';stageTab='scene';} const oldConnection=room?.id===data.room.id?room?.gmConnection:null; room = data.room; room.gmConnection=data.gmConnection??oldConnection; updateGMConnection(room.gmConnection); localStorage.setItem('night-table-room', room.id); } if (data.rooms) rooms = data.rooms; }
function setBusy(value) { busy = value; $('send-button').disabled = value || !room || !!room.archivedAt || (kind==='dialogue'&&!!dialogueTarget&&dialogueTarget!=='@gm'&&!dialogueTargets(room,myCharacter()?.id).some(c=>c.id===dialogueTarget)); }
async function command(op, payload = {}, target = null) {
  if (busy) return null;
  if(sessionStorage.getItem('night-table-pending')){toast('이전 요청 확인이 필요합니다. 새로고침 후 다시 시도하세요.');return null;}
  setBusy(true);
  if(op==='moveToken'&&!payload.from){
    const source=target||room,map=source?.maps?.find(m=>m.id===source.mapId),token=map?.tokens.find(t=>t.id===payload.id);
    if(token)payload={...payload,from:{mapId:map.id,x:token.x,y:token.y}};
  }
  const input = { op, payload, roomId: (target||room)?.id, expectedVersion: (target||room)?.version, requestId: crypto.randomUUID() };
  try {
    // The exact request is retained across network errors. A retry cannot create a second roll.
    sessionStorage.setItem('night-table-pending', JSON.stringify(input));
    const data=await request(input); sessionStorage.removeItem('night-table-pending'); if(!target||room?.id===target.id)accept(data); render(); return data;
  } catch (e) {
    if (e.status) sessionStorage.removeItem('night-table-pending');
    toast(e.message); if (e.status === 409) await refresh(true);
    if (!e.status) toast('연결이 끊겼습니다. 새로고침하면 같은 요청을 다시 확인합니다.');
    return null;
  } finally { setBusy(false); }
}
async function refresh(force = false) {
  if (!room || refreshing || (busy && !force)) return;
  refreshing=true;
  const requestedId=room.id;
  try {
    const response = await fetch('/api/table?room=' + encodeURIComponent(room.id)+(force?'':'&since='+room.version),{cache:'no-store',signal:AbortSignal.timeout(10000)}); const data = await response.json();
    if(response.status===404&&room?.id===requestedId){room=null;localStorage.removeItem('night-table-room');page='play';tab='scene';render();toast('열려 있던 세션이 삭제되었습니다.');await showTables();return;}
    if (!response.ok) throw Error(data.error);
    if(room?.id!==requestedId)return;
    syncFailures=0;
    $('connection').textContent=local?'로컬 실행 · 자동 저장':'세션 연결 · 자동 저장';
    if(data.unchanged){if(data.version===room.version){receiveTokenMotions(data.motions);room.gmConnection=data.gmConnection;updateGMConnection(data.gmConnection);}return;}
    // A command response may have arrived while this older read was in flight.
    if(data.room.version<room.version)return;
    const changed = data.room.version !== room.version; accept(data);
    if (changed) render(); receiveTokenMotions(data.motions); $('connection').textContent = local ? '로컬 실행 · 자동 저장' : '세션 연결 · 자동 저장';
  } catch { syncFailures++;$('connection').textContent = '연결 끊김 · 재연결 중'; }
  finally {refreshing=false;}
}
const outcomeLabel=roll=>({criticalSuccess:'대성공',criticalFailure:'대실패'})[roll.outcome]||(roll.success?'성공':'실패');
const meter = (value, max) => `<div class="meter"><span style="width:${Math.max(0, Math.min(100, value / max * 100))}%"></span></div>`;
function render() {
  $('table-title').textContent = room?.title || '새로운 이야기';
  $('table-subtitle').textContent = room ? `${room.archivedAt?'보관됨 · ':''}${room.campaign?.system==='gurps4'?'GURPS 4판':'범용 판정'} · ${room.chronicle?.clock?room.chronicle.clock.date+' '+room.chronicle.clock.time:'날짜 미설정'} · 캠페인` : '세션 준비';
  if(room){const currentCase=room.chronicle?.cases.find(c=>c.id===room.chronicle.activeCaseId),actor=myCharacter();$('table-subtitle').textContent=[room.chronicle?.clock?room.chronicle.clock.date+' '+room.chronicle.clock.time:'날짜 미설정',currentCase?.title,room.economy?.enabled&&actor?.assets?.confirmed?actor.name+' · '+won(actor.assets.won):''].filter(Boolean).join(' · ');}
  $('navigation').innerHTML = [['play','image','플레이'],['characters','user','캐릭터'],['inventory','bag','소지품'],['places','image','장소'],['vehicles','bag','탈것'],['cases','clock','시나리오'],['economy','book','상점'],['gm','people','AI GM'],['history','clock','기록']].map(([id,i,label]) => `<button class="nav-button ${page===id?'active':''}" data-page="${id}" aria-expanded="${page===id&&id!=='play'}" title="${label}" ${page===id?'aria-current="page"':''}>${icon(i)}<span>${label}</span></button>`).join('');
  $('stage-tabs').hidden = page !== 'play';
  $('stage-tabs').innerHTML = [['scene','chat','장면'],['map','image','지도'],['checks','dice','판정']].map(([id,i,label]) => `<button role="tab" aria-selected="${tab===id}" class="${tab===id?'active':''}" data-tab="${id}">${icon(i)}${label}</button>`).join('');
  bindEconomy(workspaceContext());
  bindWorld(workspaceContext());
  bindContentPacks(workspaceContext());
  renderMain(); renderCharacter(); renderComposer();
  $('invite-button').innerHTML = icon('people')+'초대'; $('invite-button').disabled = !room || !owner();
  $('settings-button').innerHTML = icon('settings')+'캠페인 설정'; $('settings-button').disabled = !room;
  $('gm-status').innerHTML = icon('link') + (room?.gmUpdatedAt ? `GM 기록 ${esc(date(room.gmUpdatedAt))}` : 'GM 연결 대기');
  $('connection').textContent = room ? (local ? '로컬 실행 · 자동 저장' : '세션 연결 · 자동 저장') : '테이블을 선택하세요';
  setBusy(busy);
  renderWorkspace(workspaceContext());
  renderCombat(workspaceContext());
}
function renderComposer() {
  if(kind==='dialogue'&&normalizeDialogueTarget(room,dialogueTarget)!==dialogueTarget){
   const draft=$('message').value;changeComposer('dialogue',normalizeDialogueTarget(room,dialogueTarget));if(draft)$('message').value=draft;
  }
  const target=dialogueTarget,actor=myCharacter(),people=dialogueTargets(room,actor?.id);
  const route=composerRoute(kind,target),partner=people.find(c=>c.id===target);
  const missing=kind==='dialogue'&&target&&target!=='@gm'&&!partner;
  const choices=[['action','행동 선언'],['dialogue:@gm','상황 속 인물에게'],['dialogue:','일행에게'],['request','GM에게 질문']];
  const targetOptions=choices.map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('')+(missing?'<option value="'+esc(route)+'" disabled>상대 없음 · 다시 선택</option>':'')+(people.length?'<optgroup label="인물">'+people.map(c=>'<option value="'+esc(composerRoute('dialogue',c.id))+'">'+esc(c.name)+'에게</option>').join('')+'</optgroup>':'');
  if($('compose-destination').innerHTML!==targetOptions)$('compose-destination').innerHTML=targetOptions;
  $('compose-destination').value=route;
  $('message').placeholder=kind==='request'?'룰이나 진행에 관해 GM에게 물어보세요.':kind==='action'?'“대사”와 행동을 함께 적어도 돼요.':partner?partner.name+'에게 할 말…':target===''?'일행에게 할 말…':'누구에게 무슨 말을 하나요?';
  $('compose-help').textContent=kind==='request'?'플레이 밖 질문 · 캐릭터의 대사나 행동으로 처리하지 않습니다.':kind==='action'?'Enter 전송 · Shift+Enter 줄바꿈':target===''?'일행과의 대화 · GM 호출 없음':'공개 대화 · Enter 전송 · Shift+Enter 줄바꿈';
  $('compose-speaker').hidden=!actor&&kind!=='request';
  $('compose-speaker').innerHTML=kind==='request'?messageAvatar(room,{name:me?.name||'나',type:'request'})+'<strong>'+esc(me?.name||'나')+'</strong>':actor?messageAvatar(room,{speakerId:actor.id,name:actor.name,type:'dialogue'})+'<strong>'+esc(actor.name)+'</strong>':'';
  const event=kind==='action'&&room?.chronicle?.events.find(e=>e.id===draftEventId);
  $('compose-context').hidden=!event;
  $('compose-context').innerHTML=event?'<span>'+esc(event.title)+'</span><button type="button" id="clear-draft-event" aria-label="전개 선택 해제">×</button>':'';
  if(event)$('clear-draft-event').onclick=()=>{draftEventId='';render();};
  $('send-button').innerHTML = icon('send')+'보내기';
  const expressions = myCharacter()?.portraits || [];
  $('expression-wrap').hidden = ['chat','request'].includes(kind) || expressions.length<2;
  const selected=$('expression-select').value;
  $('expression-select').innerHTML = expressions.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.label)}</option>`).join('');
}
function renderCharacter() {
  const c = myCharacter();
  $('character-panel').innerHTML = `<div class="section-heading"><h2>캐릭터</h2><button class="quiet" data-do="edit-character" aria-label="캐릭터 편집">${icon('pen')}</button></div><button class="character-edit" data-do="edit-character">${icon('user')}${esc(c?.name || '이름을 입력하세요')}</button>${['hp','fp'].map(key => `<div class="resource"><div class="resource-label"><span>${key.toUpperCase()}</span><span>${c?`${c[key]} / ${c[key==='hp'?'maxHp':'maxFp']}`:'— / —'}</span></div>${meter(c?.[key]||0,c?.[key==='hp'?'maxHp':'maxFp']||10)}</div>`).join('')}`;
}
function messageHtml(m) { return `<article class="entry"><div class="entry-meta">${esc(m.name)} · ${esc(({narration:'상황 설명',npcDialogue:'NPC 대사',request:'관리자 요청',adminReply:'AI 관리자',adjudication:'판정 안내',action:'행동',dialogue:'대사',chat:'잡담',gm:'GM',roll:'주사위',plan:'판정 계획',system:'기록',correction:'정정',whisper:'비밀 대화'})[m.type]||m.type)} · ${esc(date(m.at))}</div><div class="entry-text">${esc(m.text)}</div></article>`; }
function actionsHtml(manage=false) {
  const actions = room?.actions.filter(a => a.status !== 'resolved') || [];
  return actions.length ? actions.map(a => `<article class="entry"><div class="entry-meta">${esc(room.characters.find(c=>c.id===a.actorId)?.name)} · ${a.status==='planned'?'판정 준비 완료':'GM 확인 대기'}</div><p class="entry-text">${esc(a.text)}</p>${a.plan?`<div class="rule-details">${esc(a.plan.rule.name)} · ${esc(a.plan.rule.formula)} ${a.plan.rule.comparator==='lte'?'≤':'≥'} ${a.plan.rule.target}<br>성공: ${esc(a.plan.scope)}<br>위험: ${esc(a.plan.risk)}<br>FP ${a.plan.rule.costFP} 소모 · 대상 ${esc(room.characters.find(c=>c.id===a.plan.targetId)?.name)}<br>성공 시 HP ${a.plan.rule.successHpDelta} / 실패 시 HP ${a.plan.rule.failureHpDelta}</div>`:''}<div class="entry-actions">${a.status==='planned'&&(a.author===me.id||owner())?`<button class="primary" data-resolve="${a.id}">판정 실행</button>`:''}${a.status==='pending'&&owner()&&manage?`<button data-plan="${a.id}">판정 계획</button><button data-auto="${a.id}">자동 처리</button>`:''}</div></article>`).join('') : '<p class="empty-note">대기 중인 행동이 없습니다.</p>';
}
async function beginDialogue(targetId,characterId){
 const currentRoom=room?.id,actor=room?.characters.find(c=>c.id===characterId&&canControl(c,me))||myCharacter();
 if(!actor)return toast('하단에서 조작할 캐릭터를 선택하세요.');
 if(!dialogueTargets(room,actor.id).some(c=>c.id===targetId))return toast('현재 보이는 인물을 선택하세요.');
 if(actor.id!==myCharacter()?.id){if(!await command('selectCharacter',{characterId:actor.id})||room?.id!==currentRoom)return;}
 changeComposer('dialogue',targetId);draftEventId='';page='play';tab='scene';closeModal();render();
 $('message').focus({preventScroll:window.innerWidth>760});
}
function beginStoryAction(event){
 changeComposer('action');draftEventId=event.id;page='play';tab='scene';closeModal();render();
 if(!$('message').value.trim())$('message').value=event.title+'을 진행한다.';
 $('message').focus({preventScroll:window.innerWidth>760});
}
function workspaceContext(){return {room,me,beginDialogue,beginStoryAction,conversationTarget:kind==='dialogue'?dialogueTarget:'',inventoryCharacterId,inventoryShopId,openInventory:async(id='')=>{const c=room?.characters.find(c=>c.id===id);if(c&&canControl(c,me)&&partyCharacters(room).some(x=>x.id===id)&&myCharacter()?.id!==id){if(!await command('selectCharacter',{characterId:id}))return;}closeModal();inventoryCharacterId=id;page='inventory';render();},openEconomy:(shopId='')=>{inventoryCharacterId='';inventoryShopId=shopId;page='economy';render();},openSheet:id=>openCharacterSheet(workspaceContext(),id),openCombatProfile:id=>combatProfileDialog(workspaceContext(),id),readDocument,openScene:()=>{page='play';tab='scene';stageTab='scene';render();},preview:async(op,payload,roomId)=>{const response=await fetch('/api/table',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,payload,roomId}),signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error('이동 연결 오류');return response.json();},page,tab,stageTab,local,composeKind:kind,setComposeKind:value=>{changeComposer(value);render();},icon,command,render,modal,closeModal,toast,formDialog,activeCharacter:myCharacter,manualActions:()=>actionsHtml(true),tables:showTables,character:editCharacter,scene:showScene,scenes:()=>scenesDialog(presentationContext()),cast:()=>portraitsDialog(presentationContext(),true),portraits:()=>portraitsDialog(presentationContext(),false,myCharacter()?.id),closeDrawer:()=>{page='play';render();}};}
function renderMain() {
  renderWorkspace(workspaceContext());
  renderCombat(workspaceContext());
  if(page==='vehicles'){$('main-content').innerHTML=vehiclesPage(workspaceContext());return;}
  if(page==='places'){$('main-content').innerHTML=worldPage(workspaceContext());return;}
  if(page==='economy'||page==='inventory'){$('main-content').innerHTML=economyPage(workspaceContext());return;}
  if(page==='cases'){$('main-content').innerHTML=workspacePage();return;}
  if(page==='gm'||(page==='play'&&tab==='gm')){$('main-content').innerHTML=room?gmPanel():'<p class="empty-note">테이블을 먼저 선택하세요.</p>';return;}
  if(page==='play'&&['map','scene'].includes(tab))return;
  if (page === 'play' && tab === 'checks') {
    $('main-content').innerHTML = `<section class="section-page"><div class="page-heading"><h2>행동과 판정</h2></div><p class="inline-note">성공 범위와 위험을 확인하고 주사위를 굴립니다. 확정된 결과는 기록에 남습니다.</p>${actionsHtml()}<h3 class="pending-title">최근 판정</h3>${(room?.rolls||[]).slice(-10).reverse().map(r=>`<article class="entry"><div class="record-roll"><strong class="roll-total">${r.total}</strong><div><b>${esc(r.name)}</b><p class="fine">${esc(r.formula)} · [${r.dice.join(', ')}] ${r.free?'· 자유 굴림':`· ${outcomeLabel(r)}`}</p></div></div>${r.free?'':`<p class="rule-details">${esc(r.scope)}<br>FP -${r.costFP} · HP ${r.hpDelta}<br>${esc(r.source)}</p>`}</article>`).join('')}</section>`;
  } else if (page === 'characters') {
    $('main-content').innerHTML = characterManager();
  } else if (page === 'documents') {
    $('main-content').innerHTML = `<section class="section-page"><div class="page-heading"><h2>공개 자료</h2></div><p class="inline-note">세션에서 공유한 자료를 읽습니다. 자료 등록과 룰북 연결은 AI GM의 관리 메뉴에서 진행합니다.</p>${(room?.documents||[]).filter(d=>d.visibility==='public').map(d=>`<article class="entry"><div class="entry-top"><b>${esc(d.title)}</b><span class="pill">${d.visibility==='gm'?'GM 전용':'공개'}</span></div><p class="fine">${d.content.length.toLocaleString()}자</p><div class="entry-actions"><button data-document="${d.id}">읽기</button></div></article>`).join('')||'<p class="empty-note">등록한 자료가 없습니다.</p>'}</section>`;
  } else if (page === 'history') {
    $('main-content').innerHTML = `<section class="section-page"><div class="page-heading"><h2>세션 기록</h2><button data-do="export">내보내기</button></div><p class="inline-note">${room?.messages.length||0}개 기록 · 시간순으로 남긴 이야기와 판정</p>${(room?.messages||[]).slice().reverse().map(messageHtml).join('')||'<p class="empty-note">아직 기록이 없습니다.</p>'}</section>`;
  }
}
async function chooseRoom(id) { if(busy)return;try { const response=await fetch('/api/table?room='+encodeURIComponent(id));const data=await response.json();if(!response.ok)throw Error(data.error);if(room?.id!==id)$('message').value='';accept(data);closeModal();page='play';tab='scene';render(); }catch(e){toast(e.message);} }
async function showTables() {
  if(busy)return;
  if($('modal').open&&$('modal-title').textContent==='세션 관리'){closeModal();return;}
  await sessionManager({me,modal,closeModal,request,command,chooseRoom,toast,readDocument,accounts:showAccounts,setup:showCampaignSetup,current:()=>room,
    leave:()=>{if(busy||sessionStorage.getItem('night-table-pending')){toast('진행 중인 요청을 확인한 뒤 나가세요.');return false;}room=null;localStorage.removeItem('night-table-room');$('message').value='';page='play';tab='scene';render();return true;}});
}
function formDialog(title, html, onSubmit) { modal(title, `<form id="detail-form" class="form-stack">${html}<button class="primary">저장</button></form>`,()=>{$('detail-form').onsubmit=async e=>{e.preventDefault();const data=await onSubmit(Object.fromEntries(new FormData(e.target)));if(data)closeModal();};}); }

function showCampaignSetup(){if(!room)return showTables();return campaignSetup({me,modal,closeModal,request,command,toast,readDocument,current:()=>room,openScenario:()=>{page='cases';render();}});}
function showAccounts(){return accountManager({me,modal,closeModal,request,command,toast,current:()=>room});}
async function captureOriginal(id){
 const c=room.characters.find(c=>c.id===id);if(!c)return;
 try{const data=await request({op:'accountList'}),record=data.characters.find(a=>a.id===(c.accountId||c.id));if(!record)return toast('원본이 삭제되었습니다.');
 const source=room;
 formDialog('계정 원본에 반영',`<p>${esc(c.name)}의 시트·초상화·장비를 보관함 원본에 덮어씁니다. 현재 HP·FP와 상태는 가져가지 않습니다.</p>`,()=>command('accountCapture',{id:record.id,version:record.version,roomId:source.id,roomVersion:source.version,characterId:id}));
 }catch(e){toast(e.message);}
}
function assignControl(id){
 const c=room.characters.find(c=>c.id===id);if(!c)return;
 formDialog(c.name+' · 조작 맡기기',`<p class="inline-note">한 사람에게만 토큰 이동·대사·행동·판정을 맡깁니다. 다른 계정은 동시에 조작할 수 없습니다.</p><label>담당자<select name="controllerId">${room.members.map(m=>`<option value="${esc(m.id)}" ${controllerId(c)===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>`,p=>command('controlCharacter',{characterId:id,controllerIds:p.controllerId===c.owner?[]:[p.controllerId]}));
}
function createNPC(){formDialog('NPC · 동료 등록','<label>이름<input name="name" maxlength="60" required></label><label>소개<textarea name="description" maxlength="2000"></textarea></label><p class="fine">세션에서 관리하는 인물입니다. 등록 후 시트를 편집하고 참가자에게 조작을 맡기세요.</p>',p=>command('createNPC',p));}
function characterManager(){
 return `<section class="section-page"><div class="page-heading"><h2>캐릭터</h2><button data-accounts>내 보관함</button><button data-create-character>＋ 새 캐릭터</button></div><p class="inline-note">파티 ${partyCharacters(room).length}/4명 · 하단 카드는 본인 캐릭터와 맡은 동료만 선택할 수 있습니다. 두 번 누르면 시트가 열립니다. 일반 NPC는 GM이 영입 합의를 확정한 뒤 동료로 등록됩니다.</p>${(room?.characters||[]).filter(rosterEligible).map(c=>{
  const own=c.owner===me.id,editable=own||owner(),active=myCharacter()?.id===c.id;
  return `<article class="entry character-entry" data-character-entry="${c.id}"><div class="entry-top"><h2>${esc(c.name)}</h2><span class="pill">${active?'플레이 중':c.isNPC?'영입한 동료':own?'내 캐릭터':controlled(c)?'임시 조작':'동료'}</span></div><p class="entry-text">${esc(c.description||'아직 소개가 없습니다.')}</p><p class="fine">${c.statsPending?'전투 수치 미등록':`HP ${c.hp}/${c.maxHp} · FP ${c.fp}/${c.maxFp}`}</p><div class="entry-actions"><button data-sheet="${c.id}">시트 열기</button>${controlled(c)||(owner()&&c.isNPC)?`<button data-party-character="${c.id}" data-in-party="${!room.partyCharacterIds?.includes(c.id)}">${room.partyCharacterIds?.includes(c.id)?'파티 제외':'파티 참가'}</button>`:''}${c.isNPC&&(controlled(c)||owner())?`<button class="danger" data-dismiss-companion="${c.id}">동료 방출</button>`:''}</div>${editable?`<details class="character-manage"><summary>캐릭터 관리</summary><div class="entry-actions"><button data-edit-character="${c.id}">정보 수정</button><button data-portrait-character="${c.id}">초상화</button>${owner()&&c.isNPC?`<button data-control-character="${c.id}">조작 맡기기</button>`:''}${own&&!c.isNPC?`<button data-capture-original="${c.id}">원본에 반영</button>`:''}${!c.isNPC?`<button class="danger" data-delete-character="${c.id}">세션에서 삭제</button>`:''}</div></details>`:''}</article>`;
 }).join('')||'<p class="empty-note">보관함에서 캐릭터를 투입하거나 새로 만드세요.</p>'}</section>`;
}
function dismissCompanionDialog(id){
 const c=room.characters.find(c=>c.id===id);if(!c)return;
 modal(c.name+' · 동료 방출',`<p>${esc(c.name)}을 동료와 현재 파티에서 제외합니다. 인물 정보와 이전 기록은 남으며, 다시 영입하려면 GM과 새로운 합의가 필요합니다.</p><button id="confirm-companion-dismiss" class="danger">동료 방출</button>`,()=>{$('confirm-companion-dismiss').onclick=async()=>{if(await command('dismissCompanion',{characterId:id}))closeModal();};});
}
function editCharacter(id) {
 if(!room)return showTables();
 const c=id===undefined?myCharacter():room.characters.find(c=>c.id===id);
 formDialog(c?c.name+' · 정보 수정':'새 캐릭터',`<label>이름<input name="name" value="${esc(c?.name||'')}" maxlength="60" required></label><label>소개<textarea name="description" maxlength="2000">${esc(c?.description||'')}</textarea></label><p class="fine">${c?'능력치·기능·장비는 캐릭터 시트에서 수정하세요.':'새 캐릭터는 HP·FP 10으로 시작합니다. 생성 후 시트에서 기록하고 GM이 상태를 조정할 수 있습니다.'}</p>`,p=>command(c?'character':'createCharacter',{...p,...(c?{characterId:c.id}:{})}));
}
function deleteCharacter(id){
 const c=room.characters.find(c=>c.id===id);if(!c)return;
 const tokens=(room.maps||[]).reduce((n,m)=>n+m.tokens.filter(t=>t.characterId===id).length,0);
 modal(c.name+' · 캐릭터 삭제',`<p><strong>${esc(c.name)}</strong>의 시트·초상화와 연결 토큰 ${tokens}개를 삭제합니다.</p><p class="inline-note">계정 보관함 원본과 이전 대화·주사위 기록은 남습니다. 관련된 대기 행동이나 판정이 있으면 먼저 완료해야 합니다.</p><div class="owner-tools"><button id="cancel-character-delete">취소</button><button id="confirm-character-delete" class="danger">캐릭터 삭제</button></div>`,()=>{
  $('cancel-character-delete').onclick=closeModal;
  $('confirm-character-delete').onclick=async()=>{if(await command('deleteCharacter',{characterId:id,confirmName:c.name}))closeModal();};
 });
}
function legacyScene() { formDialog('장면 열기',`<label>장면 제목<input name="title" value="${esc(room.scene.title)}" maxlength="100" required></label><label>화자<input name="speaker" value="${esc(room.scene.speaker)}" maxlength="60" required></label><label>관찰 가능한 상황과 대사<textarea name="narration" maxlength="5000" rows="7" required>${esc(room.scene.narration)}</textarea></label>`,p=>command('scene',p)); }
function showScene() { sceneDialog(presentationContext()); }
function newRule() {
  formDialog('판정 규칙 추가',`<p class="inline-note">${room.campaign?.system==='gurps4'?'겁스 4판 성공 판정: 3d6 ≤ 수정 후 기능. 대성공·대실패를 적용합니다. 상황 보정은 목표값에 넣으세요. 방어·피해 연계와 대결은 별도로 처리합니다.':'범용 합계 판정입니다. 룰 고유의 대성공·대실패는 적용하지 않습니다.'}</p><label>규칙 이름<input name="name" maxlength="100" required placeholder="예: 잠긴 문 열기"></label><div class="grid2"><label>주사위<input name="formula" value="3d6" required></label><label>목표값<input name="target" type="number" value="10" min="-1000" max="31000" required></label></div><label>성공 기준<select name="comparator"><option value="lte">목표값 이하</option><option value="gte">목표값 이상</option></select></label><label>근거 유형<select name="kind" id="rule-kind"><option value="house_rule">이번 세션의 하우스룰</option><option value="source">등록한 자료의 원문</option></select></label><label>하우스룰 근거 / 목적<input name="source" maxlength="500" placeholder="채택한 이유를 기록하세요"></label><label>원문 자료<select name="documentId"><option value="">원문 사용 시 선택</option>${room.documents.filter(d=>d.visibility==='public').map(d=>`<option value="${d.id}">${esc(d.title)}</option>`).join('')}</select></label><label>원문 인용<input name="quote" maxlength="500" placeholder="자료에 실제로 있는 문장"></label><div class="grid2"><label>판정 시 FP 비용<input name="costFP" type="number" value="0" min="0" max="100" required></label><label>성공 시 대상 HP 변화<input name="successHpDelta" type="number" value="0" min="-100" max="100" required></label><label>실패 시 대상 HP 변화<input name="failureHpDelta" type="number" value="0" min="-100" max="100" required></label></div><label class="check-label"><input name="activate" type="checkbox">이 규칙을 확인했고 활성화합니다.</label>`,p=>command('rule',{...p,target:Number(p.target),costFP:Number(p.costFP),successHpDelta:Number(p.successHpDelta),failureHpDelta:Number(p.failureHpDelta),activate:p.activate==='on'}));
}
function showPlan(id) {
  const a=room.actions.find(a=>a.id===id), rules=room.rules.filter(r=>r.status==='active');
  if(!rules.length)return toast('GM 화면에서 판정 규칙을 먼저 추가하고 승인하세요.');
  formDialog('판정 계획 확정',`<p class="inline-note">${esc(a.text)}</p><label>적용 규칙<select name="ruleId">${rules.map(r=>`<option value="${r.id}">${esc(r.name)} (${esc(r.formula)})</option>`).join('')}</select></label><label>효과 대상<select name="targetId">${room.characters.map(c=>`<option value="${c.id}" ${c.id===a.actorId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>성공하면 얻는 결과<textarea name="scope" maxlength="1000" required></textarea></label><label>알려진 위험 / 실패 결과<textarea name="risk" maxlength="1000" required></textarea></label><p class="fine">저장 후 계획은 고정됩니다. 굴림은 판정 화면에서 실행합니다.</p>`,p=>command('plan',{...p,actionId:id}));
}
function showDocument() { modal('자료 추가',`<form id="doc-form" class="form-stack"><label>제목<input name="title" maxlength="100" required></label><label>공개 범위<select name="visibility"><option value="public">모든 참가자</option><option value="gm">GM 전용</option></select></label><label>텍스트 파일 불러오기<input id="doc-file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"></label><label>내용<textarea id="doc-content" name="content" maxlength="200000" rows="8" required></textarea></label><p class="fine">PDF·TXT·MD 지원 · PDF는 페이지 번호와 함께 추출됩니다. 스캔본은 OCR이 필요합니다.</p><button class="primary">자료 저장</button></form>`,()=>{
    $('doc-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{toast('자료를 읽는 중입니다.');$('doc-content').value=await readDocument(f);$('doc-form').elements.title.value||=f.name;toast('자료를 불러왔습니다. 내용을 확인하고 저장하세요.');}catch(e){toast(e.message);}};
    $('doc-form').onsubmit=async e=>{e.preventDefault();if(await command('document',Object.fromEntries(new FormData(e.target))))closeModal();};
  }); }
function showInvite() { if(!owner())return;modal('함께할 사람 초대',`<p class="inline-note">${local?'현재 로컬 실행 중입니다. 다른 컴퓨터에서는 이 주소로 접속할 수 없습니다. 온라인 배포와 사이트 접근 권한 설정을 마친 뒤 초대할 수 있습니다. 같은 컴퓨터의 다른 브라우저에서는 참가를 시험할 수 있습니다.':'친구에게 사이트 접근 권한을 허용한 뒤 아래 코드를 전달하세요. 테이블은 두 명까지 참가할 수 있습니다.'}</p><label class="form-stack">초대 코드<input id="invite-code" value="${esc(room.joinCode)}" readonly></label><div class="owner-tools"><button id="copy-invite">코드 복사</button><button id="rotate-invite">코드 재발급</button></div>`,()=>{$('copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(room.joinCode);toast('초대 코드를 복사했습니다.');}catch{ $('invite-code').select();toast('선택한 코드를 복사하세요.');}};$('rotate-invite').onclick=async()=>{if(await command('rotateInvite')){closeModal();showInvite();}};}); }
function gmGuide() { modal('Codex로 진행하기',`<p class="inline-note">Codex에게 아래 내용을 전달하면 저장된 세션을 이어갈 수 있습니다. 이 화면은 실제 GM 응답이 기록되면 자동으로 갱신됩니다.</p><div class="doc-text">밤의 테이블 세션을 진행해줘. 먼저 GM_POLICY.md를 읽고, ${local?'local/gm.mjs read 명령':'read_table 도구'}로 최신 상태를 확인해줘. 미처리 행동의 의도와 규칙 근거를 검토한 뒤 장면이나 판정 계획을 기록해줘. 주사위 결과는 실행기가 계산하게 해줘.</div><p class="inline-note">세션 ID: <span class="code">${esc(room.id)}</span></p>${local?'<p class="fine">실행 예시: node local/gm.mjs read 세션ID<br>GM 명령은 JSON을 표준입력으로 전달합니다. 사용법은 README-NIGHT-TABLE.md에 있습니다.</p>':'<p class="fine">게시된 사이트의 밤의 테이블 플러그인을 연결해야 합니다.</p>'}`); }
function exportRoom() { if(!room)return;modal('세션 내보내기',`<p class="inline-note">${owner()?'방장용 내보내기에는 GM 비밀과 GM 전용 자료가 포함됩니다. 공유할 파일인지 확인하세요.':'현재 참가자에게 공개된 기록만 내보냅니다.'}</p><button id="download-record" class="primary">${owner()?'전체 기록 다운로드 (비밀 포함)':'공개 기록 다운로드'}</button>`,()=>{$('download-record').onclick=()=>{const blob=new Blob([JSON.stringify(room,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`night-table-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);closeModal();};}); }
document.addEventListener('click', async e => {
  const b=e.target.closest('button'); if(!b)return;
  if(b.dataset.page){inventoryCharacterId='';inventoryShopId='';closeModal();page=page===b.dataset.page?'play':b.dataset.page;render();}
  if(b.dataset.tab){closeModal();tab=page==='play'&&tab===b.dataset.tab?'scene':b.dataset.tab;page='play';if(['scene','map'].includes(tab))stageTab=tab;render();}
  if(b.hasAttribute('data-gm-question')){changeComposer('request');page='play';tab='scene';render();$('message').focus();return;}
  if(b.dataset.resolve){await command('resolve',{actionId:b.dataset.resolve});}
  if(b.dataset.plan)showPlan(b.dataset.plan);
  if(b.dataset.auto)formDialog('판정 없이 처리',`<label>처리 결과와 근거<textarea name="reason" maxlength="2000" required></textarea></label><p class="fine">수치 변화가 없는 자동 처리입니다. 주사위가 필요한 행동에는 판정 계획을 사용하세요.</p>`,p=>command('automatic',{...p,actionId:b.dataset.auto}));
  if(b.dataset.approve)await command('approveRule',{ruleId:b.dataset.approve});
  if(b.dataset.activityId){await command('activityControl',{characterId:b.dataset.activityId,mode:b.dataset.activityMode,reason:'사용자가 중단 사유 확인 후 재개'});return;}
  if(b.dataset.document){const d=room.documents.find(d=>d.id===b.dataset.document);modal(d.title,`<div class="doc-text">${esc(d.content)}</div>`);}
  if(b.hasAttribute('data-campaign-setup'))return showCampaignSetup();
  if(b.hasAttribute('data-accounts'))return showAccounts();
  if(b.hasAttribute('data-create-npc'))return createNPC();
  if(b.dataset.partyCharacter)return command('partyCharacter',{characterId:b.dataset.partyCharacter,inParty:b.dataset.inParty==='true'});
  if(b.dataset.dismissCompanion)return dismissCompanionDialog(b.dataset.dismissCompanion);
  if(b.dataset.controlCharacter)return assignControl(b.dataset.controlCharacter);
  if(b.dataset.captureOriginal)return captureOriginal(b.dataset.captureOriginal);
  if(b.hasAttribute('data-create-character'))return editCharacter('');
  if(b.dataset.editCharacter)return editCharacter(b.dataset.editCharacter);
  if(b.dataset.deleteCharacter)return deleteCharacter(b.dataset.deleteCharacter);
  if(b.dataset.portraitCharacter)return portraitsDialog(presentationContext(),false,b.dataset.portraitCharacter);
  if(b.dataset.resource){const c=room.characters.find(c=>c.id===b.dataset.resource);formDialog('캐릭터 상태 조정',`<p>${esc(c.name)}</p><div class="grid2">${[['hp','HP',c.hp,-c.maxHp*5,c.maxHp],['maxHp','최대 HP',c.maxHp,1,999],['fp','FP',c.fp,0,c.maxFp],['maxFp','최대 FP',c.maxFp,1,999]].map(([key,label,value,min,max])=>`<label>${label}<input name="${key}" type="number" value="${value}" min="${min}" max="${key==='hp'||key==='fp'?999:max}" required></label>`).join('')}</div><label>변경 사유<input name="reason" maxlength="500" required></label><p class="fine">기존 수치와 변경 사유를 정정 기록으로 남깁니다.</p>`,p=>command('resource',{...p,characterId:c.id,hp:Number(p.hp),fp:Number(p.fp),maxHp:Number(p.maxHp),maxFp:Number(p.maxFp)}));}
  const handlers={portraits:()=>portraitsDialog(presentationContext(),false,myCharacter()?.id),cast:()=>portraitsDialog(presentationContext(),true),scenes:()=>scenesDialog(presentationContext()),'edit-character':editCharacter,scene:showScene,'new-rule':newRule,document:showDocument,'gm-guide':gmGuide,export:exportRoom,secret:()=>formDialog('GM 비밀 기록',`<label>미발견 사실 · NPC 목표<textarea name="text" maxlength="20000" rows="10">${esc(room.secrets)}</textarea></label><p class="fine">다른 참가자에게는 전송하지 않습니다.</p>`,p=>command('secrets',p))};
  if(handlers[b.dataset.do])handlers[b.dataset.do]();
});
$('tables-button').onclick=showTables;
$('invite-button').onclick=showInvite;
$('settings-button').onclick=showCampaignSetup;
$('gm-status').onclick=()=>{closeModal();page=page==='gm'?'play':'gm';render();};
$('compose-destination').onchange=e=>{const next=parseComposerRoute(e.target.value);changeComposer(next.kind,next.target);render();$('message').focus({preventScroll:true});};
$('message').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();if(!$('send-button').disabled)$('composer').requestSubmit();}});
$('composer').onsubmit=async e=>{e.preventDefault();if(busy||$('send-button').disabled)return;if(!room)return showTables();const value=$('message').value.trim();if(!value)return;const sentRoom=room.id,sentDraft=draftKey();const result=await command('message',{...composerMessageRoute(composerRoute(kind,dialogueTarget)),text:value,...(kind==='action'&&draftEventId?{storyEventId:draftEventId}:{}),characterId:myCharacter()?.id,expressionId:['chat','request'].includes(kind)?'':$('expression-select')?.value||'',scope:'individual'});if(result&&room?.id===sentRoom){if(draftKey()===sentDraft&&$('message').value.trim()===value){$('message').value='';composerDrafts.delete(sentDraft);}else if(composerDrafts.get(sentDraft)?.trim()===value)composerDrafts.delete(sentDraft);if(sentDraft==='action')draftEventId='';$('message').focus({preventScroll:window.innerWidth>760});}};

render();
try {
  accept(await request());
  const pending=sessionStorage.getItem('night-table-pending');
  if(pending){try{accept(await request(JSON.parse(pending)));sessionStorage.removeItem('night-table-pending');toast('이전 요청의 처리 결과를 확인했습니다.');}catch(e){if(e.status)sessionStorage.removeItem('night-table-pending');toast(e.message);}}
  const saved=room?.id||localStorage.getItem('night-table-room');
  if(saved&&(room?.id===saved||rooms.some(r=>r.id===saved)))await chooseRoom(saved);else await showTables();
}catch(e){toast(e.message);$('connection').textContent='서버 연결 실패';}
async function syncLoop(){
  const generation=++syncGeneration;
  clearTimeout(syncTimer);
  await refresh();
  if(generation!==syncGeneration)return;
  syncTimer=setTimeout(syncLoop,document.hidden?5000:Math.min(10000,500*2**Math.min(syncFailures,5)));
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncLoop();});
window.addEventListener('online',()=>{syncFailures=0;syncLoop();});
syncLoop();
