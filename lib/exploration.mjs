import {requireLocalAccess} from '../public/play/off-map-state.js';
import {identifyVisibleNPC} from './npc-identity.mjs';
import {isCompanion} from '../public/play/character-control.js';
import {actorMapId,withActorMap} from './location-presentation.mjs';
import {cell,index,center,yards,clearLine,sightCells,findPath} from '../public/play/exploration-geometry.js';
import {canControl} from '../public/play/character-control.js';
import {stamp} from './chronicle.mjs';
import {gurpsSuccessRoll} from './gurps.mjs';
const fail=(m,status=400)=>{throw Object.assign(Error(m),{status});};
const now=()=>new Date().toISOString();
export function explorationState(m){return m.explorationState||=( {explored:[],discovered:[],completed:[],attempts:{},encounters:[]} );}
function partyTokens(r,m){return m.tokens.filter(t=>r.partyCharacterIds.includes(t.characterId)&&!t.hidden&&!t.offMap&&(!r.worldLibrary||actorMapId(r,t.characterId)===m.id));}
export function visibleCells(r,m){return m.id===r.mapId?sightCells(m,partyTokens(r,m)):new Set();}
export function spatiallyVisible(r,m,p){return !m.exploration||m.id===r.mapId&&partyTokens(r,m).some(t=>yards(m,t,p)<=m.exploration.sight&&clearLine(m,t,p));}
export function refreshExploration(r,m){
 if(!m?.exploration)return;
 const s=explorationState(m),seen=visibleCells(r,m);s.explored=[...new Set([...s.explored,...seen])];
 s.knownWalls||=[];
 for(const w of m.exploration.walls){const p={x:(w.a.x+w.b.x)/2,y:(w.a.y+w.b.y)/2};if(m.id===r.mapId&&partyTokens(r,m).some(t=>yards(m,t,p)<=m.exploration.sight&&clearLine(m,t,p,w.id))&&!s.knownWalls.includes(w.id))s.knownWalls.push(w.id);}
 for(const t of m.tokens)if(!t.hidden&&spatiallyVisible(r,m,t)){const c=r.characters.find(c=>c.id===t.characterId);identifyVisibleNPC(c);}
 for(const p of m.exploration.points)if(!p.hidden&&spatiallyVisible(r,m,p)&&!s.discovered.includes(p.id))s.discovered.push(p.id);
}
function log(r,u,text,type='exploration',extra={}){
 r.messages.push({id:crypto.randomUUID(),type,name:'탐색',author:u.id,text,at:now(),caseId:r.chronicle.activeCaseId||'',gameClock:structuredClone(r.chronicle.clock),...extra});
}
function spendSeconds(r,seconds){
 if(!r.chronicle.clock)fail('탐색 전에 게임 날짜와 시간을 설정하세요.');
 const total=(r.explorationSeconds||0)+seconds,minutes=Math.floor(total/60);r.explorationSeconds=total%60;
 if(minutes){const iso=new Date(stamp(r.chronicle.clock.date,r.chronicle.clock.time)+minutes*60000).toISOString();r.chronicle.clock={date:iso.slice(0,10),time:iso.slice(11,16)};}
}
function actor(r,u,id,m){
 const c=r.characters.find(c=>c.id===id),t=m.tokens.find(t=>t.characterId===id&&!t.hidden);
 if(!c||!canControl(c,u)||!t)fail('현재 지도에서 조작할 수 있는 캐릭터를 선택하세요.',403);
 if(c.hp<=0||c.combatState?.status==='dead'||c.combatState?.status==='unconscious')fail('현재 행동할 수 없는 캐릭터입니다.');
 return {c,t};
}
function idle(r){if(r.combat?.status==='active'||['queued','running'].includes(r.gmJob?.status))fail('전투 또는 GM 처리를 먼저 마치세요.',409);}
function enqueue(r,u,c,text,mapIntent){
 const id=crypto.randomUUID();r.actions.push({id,actorId:c.id,author:u.id,text,scope:'individual',status:'pending',at:now(),mapIntent,timeCharged:true});
 log(r,u,text,'action',{actionId:id,speakerId:c.id,name:c.name});
 r.gmJob={id:crypto.randomUUID(),kind:'individual',status:'queued',at:now(),actorId:c.id,requesterId:u.id,requestText:text,actionIds:[id]};return id;
}
function encounter(r,u,c,m,allowQueue){
 const s=explorationState(m),seen=visibleCells(r,m),enemies=m.tokens.filter(t=>!t.hidden&&spatiallyVisible(r,m,t)&&r.characters.find(a=>a.id===t.characterId)?.contentRole==='enemy'&&!s.encounters.includes(t.characterId));
 if(!enemies.length)return false;
 enemies.forEach(t=>s.encounters.push(t.characterId));
 const text=`${c.name}: ${enemies.map(t=>t.name).join(', ')} 발견. 이동을 멈추고 상황을 살핀다.`;
 if(allowQueue)enqueue(r,u,c,text,{mapId:m.id,kind:'encounter',targetIds:enemies.map(t=>t.characterId)});else log(r,u,text);
 return true;
}
export function moveExploration(r,u,m,t,x,y,{gm=false}={}){
 if(r.worldLibrary&&m.id!==actorMapId(r,t.characterId))fail('캐릭터가 있는 장소에서만 이동할 수 있습니다.');
 if(r.worldLibrary&&m.id!==r.mapId)return withActorMap(r,t.characterId,()=>moveExploration(r,u,m,t,x,y,{gm}));
 if(m.id!==r.mapId)fail('현재 지도에서만 이동할 수 있습니다.');
 if(!gm)idle(r);
 if(![x,y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))fail('이동 좌표를 확인하세요.');
 const {c}=actor(r,u,t.characterId,m);if(!gm&&c.isNPC&&!c.controllers?.length&&!r.partyCharacterIds.includes(c.id))fail('이 인물은 GM이 조작합니다.',403);
 requireLocalAccess(r,t.characterId);const path=findPath(m,t,{x,y});if(!path)fail('문이나 벽에 막혀 갈 수 없습니다.');
 if(!path.length)return {};
 let steps=0;for(const p of path){Object.assign(t,p,{positionReviewed:true});steps++;refreshExploration(r,m);if(encounter(r,u,c,m,!gm))break;}
 const seconds=steps*m.exploration.secondsPerCell;spendSeconds(r,seconds);log(r,u,`${c.name} · ${steps}칸 이동 · ${seconds}초`);
 return {steps,seconds,x:t.x,y:t.y};
}
function range(m,t,p,ignore=''){if(yards(m,t,p)>Math.max(m.unit*1.6,1.5)||!clearLine(m,t,p,ignore))fail('대상 가까이로 이동하세요.');}
function discover(r,u,m,p){
 const s=explorationState(m);if(s.completed.includes(p.id))return;
 s.completed.push(p.id);s.discovered=[...new Set([...s.discovered,p.id,...p.reveal])];
 r.notes.push({id:crypto.randomUUID(),title:p.name,text:p.result||p.description,kind:'clue',visibility:'public',caseId:r.chronicle.activeCaseId||'',at:now()});
 log(r,u,p.result||`${p.name} 조사 완료`);refreshExploration(r,m);
}
export function explorationCommand(r,u,op,p,die,options={}){
 if(!['exploreInteract','exploreMove'].includes(op))return null;
 if(r.worldLibrary&&!options.worldScoped)return withActorMap(r,p.characterId,()=>explorationCommand(r,u,op,p,die,{...options,worldScoped:true}));
 const m=r.maps.find(m=>m.id===r.mapId);if(!m?.exploration)fail('탐색 정보가 없는 지도입니다.');
 if(!options.gm)idle(r);else if(r.combat?.status==='active')fail('전투 중에는 전투 행동을 사용하세요.');
 const {c,t}=actor(r,u,p.characterId,m);requireLocalAccess(r,c.id);refreshExploration(r,m);
 if(!options.gm&&c.isNPC&&!c.controllers?.length&&!r.partyCharacterIds.includes(c.id))fail('이 인물은 GM이 조작합니다.',403);
 if(op==='exploreMove')return moveExploration(r,u,m,t,p.x,p.y,options);
 const s=explorationState(m),w=m.exploration.walls.find(w=>w.id===p.targetId&&w.door);
 if(['open','close'].includes(p.verb)){
  if(!w)fail('문을 찾을 수 없습니다.');const middle={x:(w.a.x+w.b.x)/2,y:(w.a.y+w.b.y)/2};range(m,t,middle,w.id);
  if(w.locked)fail('잠긴 문입니다. 다른 방법을 GM에게 선언하세요.');
  if(w.open===(p.verb==='open'))return {};
  if(p.verb==='close'&&m.tokens.some(v=>yards(m,v,middle)<m.unit*.45))fail('문 앞에 인물이 있어 닫을 수 없습니다.');
  w.open=p.verb==='open';spendSeconds(r,5);refreshExploration(r,m);log(r,u,`${c.name} · ${w.name} ${w.open?'열기':'닫기'} · 5초`);encounter(r,u,c,m,!options.gm);return {};
 }
 const point=m.exploration.points.find(x=>x.id===p.targetId);
 if(!point||!s.discovered.includes(point.id)||!spatiallyVisible(r,m,point))fail('현재 조사할 수 있는 대상이 아닙니다.');range(m,t,point);
 if(point.requires.some(k=>!s.completed.includes(k)))fail('아직 조사 조건이 갖춰지지 않았습니다.');
 if(p.verb!=='inspect')fail('조사 행동을 확인하세요.');
 if(s.completed.includes(point.id))return {completed:true};
 const key=c.id+'/'+point.id;if(s.attempts[key])fail('이미 조사했습니다. 접근 방법을 바꾸려면 GM에게 선언하세요.');
 let target;
 if(point.mode==='skill'){
  const f=c.fields?.find(f=>f.name===point.check.field);if(!f||!/^\d+$/.test(String(f.value).trim()))fail(`${point.check.field} 수치를 시트에 먼저 입력하세요.`);
  target=Number(f.value)+point.check.modifier;if(!Number.isSafeInteger(target)||target<3||target>999)fail('판정 수치를 확인하세요.');
 }
 spendSeconds(r,point.minutes*60);s.attempts[key]={at:now(),pending:point.mode==='gm'};
 log(r,u,`${c.name} · ${point.name} 조사 · ${point.minutes}분`);
 if(point.mode==='gm'){
  // A model cannot manufacture a skill roll; only explicitly authored GM decisions use this path.
  if(options.gm)fail('이 조사는 지도에서 요청해 GM 검토를 시작하세요.');
  return {actionId:enqueue(r,u,c,`${point.name} 조사: ${p.text||point.description}`,{mapId:m.id,kind:'investigate',pointId:point.id})};
 }
 let success=true;
 if(point.mode==='skill'){
  const dice=[die(6),die(6),die(6)],total=dice.reduce((a,b)=>a+b,0),outcome=gurpsSuccessRoll(total,target);success=outcome.success;
  const roll={id:crypto.randomUUID(),actorId:c.id,author:u.id,name:c.name,formula:'3d6',dice,total,target,...outcome,source:`${point.check.field} · 사전 설정 보정 ${point.check.modifier}`,scope:point.name,costFP:0,hpDelta:0,at:now()};r.rolls.push(roll);log(r,u,`${point.name} · ${success?'성공':'실패'}`,'roll',{rollId:roll.id});
 }
 if(success)discover(r,u,m,point);return {success};
}
export function applyExplorationGM(r,original,p,die){
 const m=r.maps.find(m=>m.id===r.mapId);if(!m?.exploration)fail('탐색 지도가 없습니다.');
 const source=original.actions.find(a=>a.id===p.actionId&&(original.gmJob.actionIds||original.actions.filter(v=>v.status==='pending').map(v=>v.id)).includes(a.id));
 const c=r.characters.find(c=>c.id===p.characterId),npc=c?.isNPC&&!c.controllers?.length&&!r.partyCharacterIds.includes(c.id);
 if(npc&&(p.actionId||!['move','open','close','reveal'].includes(p.verb)))fail('NPC는 자기 이동과 문 조작만 수행할 수 있습니다.');
 if(p.verb==='reveal'){
  if(!npc)fail('준비된 NPC만 등장시킬 수 있습니다.');const t=m.tokens.find(t=>t.characterId===c.id);if(!t||!spatiallyVisible(r,m,t))fail('현재 시야 안의 인물만 등장시킬 수 있습니다.');
  t.hidden=false;identifyVisibleNPC(c);refreshExploration(r,m);log(r,{id:c.owner},`${c.name} 등장`);return;
 }
 if(!npc&&(!source||source.actorId!==c?.id||source.status!=='pending'))fail('플레이어의 해당 행동 선언이 필요합니다.',403);
 const a=source&&r.actions.find(a=>a.id===source.id),user={id:npc?c.owner:source.author};
 if(a?.mapHandled)fail('이미 지도에 반영된 행동입니다.');
 if(p.verb==='resolve'){requireLocalAccess(r,c.id);
  if(typeof p.success!=='boolean')fail('조사 결과를 확인하세요.');
  const intent=source?.mapIntent,point=m.exploration.points.find(x=>x.id===intent?.pointId),s=explorationState(m);
  if(!point||point.mode!=='gm'||intent.mapId!==m.id||intent.kind!=='investigate'||!s.attempts[c.id+'/'+point.id]?.pending)fail('대기 중인 GM 조사가 필요합니다.');
  range(m,m.tokens.find(t=>t.characterId===c.id),point);s.attempts[c.id+'/'+point.id].pending=false;
  if(p.success)discover(r,user,m,point);else log(r,user,`${point.name} · 이번 접근으로는 발견하지 못했습니다.`);
 }else{
  if(source?.mapIntent?.kind==='investigate')fail('대기 중인 조사를 먼저 처리하세요.');
  explorationCommand(r,user,p.verb==='move'?'exploreMove':'exploreInteract',{...p},die,{gm:true});
 }
 if(a){a.mapHandled=true;a.timeCharged=true;a.status='resolved';a.resolution={kind:'map',reason:p.verb};}
}
// Browser views (including the host's play view) never receive unrevealed investigation text.
export function projectExploration(r){
 const hiddenCharacters=new Set();
 for(const m of r.maps||[]){if(!m.exploration)continue;refreshExploration(r,m);
  const s=explorationState(m),seen=visibleCells(r,m),explored=new Set(s.explored);
  m.tokens=m.tokens.filter(t=>{const show=!t.hidden&&(r.partyCharacterIds.includes(t.characterId)||spatiallyVisible(r,m,t));if(!show)hiddenCharacters.add(t.characterId);return show;});
  m.pins=m.pins.filter(p=>!p.hidden&&spatiallyVisible(r,m,p));
  m.exploration={sight:m.exploration.sight,secondsPerCell:m.exploration.secondsPerCell,walls:m.exploration.walls.filter(w=>s.knownWalls.includes(w.id)).map(w=>({...w,locked:undefined})),points:m.exploration.points.filter(p=>s.discovered.includes(p.id)&&spatiallyVisible(r,m,p)).map(p=>({id:p.id,x:p.x,y:p.y,name:p.name,description:p.description,minutes:p.minutes,mode:p.mode,completed:s.completed.includes(p.id),attempted:Object.keys(s.attempts).filter(k=>k.endsWith('/'+p.id)).map(k=>k.split('/')[0])}))};
  m.explorationView={visible:[...seen],explored:[...explored]};delete m.explorationState;
 }
 r.characters=r.characters.filter(c=>isCompanion(c)||!hiddenCharacters.has(c.id)||['heard','detected'].includes(c.npcIdentity?.state)||c.contentRevealed||r.partyCharacterIds.includes(c.id)||r.combat?.status==='active'&&r.combat.fighters[c.id]||r.maps.some(m=>m.tokens.some(t=>t.characterId===c.id)));
}
