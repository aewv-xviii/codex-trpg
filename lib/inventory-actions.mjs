import {requireLocalAccess} from '../public/play/off-map-state.js';
import {ammoFits} from '../public/play/ammo-compatibility.js';
import {peaceAction,preparationBlocked} from './peace-actions.mjs';
import {itemLabel} from '../public/play/equipment-labels.js';
import {canControl} from '../public/play/character-control.js';
import {locationOf,baseHere,looseHere} from '../public/play/item-view.js';
import {economyCommand,record} from './economy.mjs';
import {combatCommand} from './combat.mjs';
import {trySimpleRest,advanceGameSeconds} from './conditions.mjs';
import {reloadPlan,completeReload,fillMagazine,emptyMagazine,setMagazineRounds} from './firearms.mjs';
import {dropMagazine,groundMagazine,recoverMagazine} from './magazine-ground.mjs';
import {handDisabled} from '../public/play/injury-state.js';
import {requireControlAction} from './control-state.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const qty=v=>Number.isSafeInteger(v)&&v>0&&v<=99999?v:fail('수량을 확인하세요.');
const item=(r,id)=>r.economy.items.find(x=>x.id===id)||fail('물품을 찾을 수 없습니다.');
const active=r=>r.combat?.status==='active';
function checkActor(r,u,id){const c=r.characters.find(c=>c.id===id);if(!c||!canControl(c,u)||!r.partyCharacterIds.includes(id))fail('이 캐릭터의 조작 권한이 없습니다.',403);if(!r.economy?.enabled||!c.assets?.confirmed)fail('시작 자산을 먼저 확정하세요.');return c;}
function moveCount(from,to,id,n){if((from[id]||0)<n)fail('보유 수량이 부족합니다.');if((to[id]||0)+n>99999)fail('보관 수량 한도를 초과합니다.');from[id]-=n;if(!from[id])delete from[id];to[id]=(to[id]||0)+n;}
function mutableItem(r,c,id,n,verb){const i=item(r,id),weapons=[c.combatProfile?.weapon,...(c.combatLoadout||[]).map(x=>x.weapon)].filter(Boolean);const reserved=weapons.filter(w=>w.itemId===id||w.inventoryItemId===id||w.name===i.name||w.name?.startsWith(i.name+' ·')).length;if(verb!=='take'&&reserved&&(c.assets.items[id]||0)-n<reserved)fail('장비에 연결된 수량은 남겨 두어야 합니다. 예비 물품만 옮길 수 있습니다.');return i;}
// Both player clicks and interpreted declarations call this exact mutation path.
// A GM action supplies the declaration author, never GM/host privileges.
export function inventoryCommand(r,u,op,p,die,declaration=null){
 if(op!=='inventoryAction'&&op!=='setInventoryBase')return null;
 const c=op==='setInventoryBase'&&u.id===r.owner?r.characters.find(c=>c.id===p.characterId&&r.partyCharacterIds.includes(c.id)&&c.assets?.confirmed):checkActor(r,u,p.characterId);
 if(!c)fail('자산이 확정된 파티원을 선택하세요.');
 const preparation=op==='inventoryAction'&&p.verb==='ready'&&!active(r)?declaration:null;
 if(preparationBlocked(r,c.id,preparation))fail('진행 중인 행동이 끝난 뒤 조작하세요.',409);
 if(op==='setInventoryBase'){requireLocalAccess(r,c.id);
  if(u.id!==r.owner)fail('거점 연결은 방장 권한이 필요합니다.',403);
  if(active(r))fail('전투 중에는 거점을 변경할 수 없습니다.');
  const placeId=locationOf(r,c.id);const name=String(p.name||'').trim();if(!name||name.length>80)fail('거점 이름을 확인하세요.');
  (r.economy.bases||={})[c.id]={name,placeId,mapId:r.mapId};record(r,u,'base',`${c.name} · ${name} 보관함 연결`,{characterId:c.id});return {};
 }
 const verb=p.verb;
 if(['buy','sell','store','take','give','pickup','recover','drop','rest'].includes(verb))requireLocalAccess(r,c.id,p.targetId);
 if(['stowMagazine','recoverMagazine'].includes(verb)){
  requireControlAction(c,'ready');
  if(active(r))return combatCommand(r,u,'combatAct',{characterId:c.id,action:verb,magazineId:p.lootId},die,!!declaration);
  const f=c.combatState||{};if(f.stunned||f.status&&f.status!=='active'||c.fp<=0||handDisabled(c,'left')||handDisabled(c,'right'))fail('양손과 의식 상태를 확인하세요.');
  let result;
  if(verb==='stowMagazine'){if(!c.heldMagazine)fail('보관할 손의 탄창이 없습니다.');result={magazineId:c.heldMagazine.id,rounds:c.heldMagazine.rounds};(c.assets.magazines??=[]).push(c.heldMagazine);delete c.heldMagazine;advanceGameSeconds(r,1);}
  else{const g=groundMagazine(r,c,p.lootId,u.id===r.owner||!!declaration);result=recoverMagazine(r,c,g);advanceGameSeconds(r,2);}
  record(r,u,verb,c.name+' · 탄창 '+(verb==='stowMagazine'?'보관':'회수')+' · '+result.rounds+'발',{characterId:c.id,...result});return result;
 }
 if(['sell','use'].includes(verb))mutableItem(r,c,p.itemId,qty(p.quantity),verb);
 if(['buy','sell','use','unload'].includes(verb))return economyCommand(r,u,{buy:'buyItem',sell:'sellItem',use:'useItem',unload:'unloadWeapon'}[verb],{...p,reason:'물품 사용'});
 if(['fillMagazine','emptyMagazine','setMagazineRounds'].includes(verb)){
  requireControlAction(c,'ready');
  if(verb==='setMagazineRounds'&&active(r))fail('전투 중 탄창 정리는 행동으로 선언하세요.');
  if(active(r))return combatCommand(r,u,'combatAct',{characterId:c.id,action:verb,magazineId:p.lootId,itemId:p.itemId,quantity:p.quantity,ammoItemId:p.ammoItemId},die);
  const f=c.combatState||{};if(f.stunned||f.status&&f.status!=='active'||c.fp<=0||handDisabled(c,'left')||handDisabled(c,'right'))fail('양손과 의식 상태를 확인하세요.');
  const result=verb==='setMagazineRounds'?setMagazineRounds(r,c,p):verb==='fillMagazine'?fillMagazine(r,c,p):emptyMagazine(c,p.lootId);
  advanceGameSeconds(r,result.seconds);record(r,u,'magazine',c.name+' · '+(verb==='fillMagazine'||verb==='setMagazineRounds'&&result.rounds>0?'탄창 삽탄':'탄창 비우기')+' '+Math.abs(result.rounds)+'발',{characterId:c.id,...result});return result;
 }
 if(verb==='reload'){
  if(!declaration&&(active(r)||p.reloadMode&&p.reloadMode!=='retain'))fail('인벤토리 재장전은 전투 밖에서 탄창을 보관하는 방식만 가능합니다. 전투 중에는 행동으로 선언하세요.');
  if(active(r)&&p.continueUntilDone===true)return combatCommand(r,u,'combatPlan',{...p,kind:'reload',magazineId:p.lootId},die);
  if(active(r))return combatCommand(r,u,'combatAct',{characterId:c.id,action:'reload',magazineId:p.lootId,quantity:p.quantity,reloadMode:p.reloadMode},die);
  const w=c.combatProfile?.weapon,f=c.combatState||{};
  requireControlAction(c,'ready');
  if(!w||w.kind!=='firearm'||f.dropped||f.lostWeapon||f.stunned||f.status&&f.status!=='active'||c.fp<=0||handDisabled(c,'left')||handDisabled(c,'right'))fail('양손과 사용 가능한 총기, 의식·피로 상태를 확인하세요.');
  if(c.heldMagazine)fail('손의 헌 탄창 보관을 먼저 마치세요.');
  if(p.ammoItemId){const ammo=r.economy.items.find(i=>i.id===p.ammoItemId);if(!ammoFits(w,ammo,r.economy.items)||w.ammo&&w.ammoItemId!==ammo.id)fail('장전된 탄과 호환 탄종을 확인하세요. 먼저 총기를 비우세요.');w.ammoItemId=ammo.id;}
  const plan=reloadPlan(c,{magazineId:p.lootId,quantity:p.quantity,reloadMode:p.reloadMode}),swapped=completeReload(c,plan);delete f.reload;
  if(plan.reloadMode==='drop')dropMagazine(r,c,swapped.removedMagazine);
  advanceGameSeconds(r,plan.seconds);record(r,u,'reload',`${c.name} · 재장전 · 장전 ${swapped.loaded}발`,{characterId:c.id,magazineId:plan.magazineId,quantity:plan.rounds,loaded:w.ammo});return {};
 }
 if(verb==='ready'){
  if(!c.combatProfile?.weapon)fail('연결된 무기가 없습니다.');
  const ready={characterId:c.id,action:'ready',itemId:p.itemId};
  return active(r)?combatCommand(r,u,'combatAct',ready,die):peaceAction(r,u,ready,preparation);
 }
 if(verb==='recover'){
  const loose=r.looseWeapons?.find(x=>x.id===p.lootId);
  if(!loose||loose.recovered||loose.placeId!==locationOf(r,c.id)||loose.mapId&&loose.mapId!==r.mapId)fail('현재 장소의 미회수 무기를 선택하세요.');
  if(!loose.located||!active(r)&&loose.retrievableBy!==c.id){
   if(p.fromDeclaration)fail('먼저 실제 위치와 접근 가능 여부를 확인하세요.');
   if(loose.ownerId!==c.id)fail('자신의 미회수 무기만 찾을 수 있습니다.');
   if(active(r)&&(r.combat.pending||r.combat.order[r.combat.index]!==c.id))fail('현재 행동 차례가 아닙니다.',409);
   const id=crypto.randomUUID(),text=`던진 ${item(r,loose.itemId).name}의 위치를 확인하고 회수한다`,at=new Date().toISOString();
   r.actions.push({id,actorId:c.id,author:u.id,text,scope:'individual',status:'pending',at,inventoryIntent:{verb:'recover',lootId:loose.id}});
   const messageId=crypto.randomUUID();r.messages.push({id:messageId,type:'action',name:c.name,author:u.id,speakerId:c.id,text,actionId:id,at});
   r.gmJob={id:crypto.randomUUID(),status:'queued',kind:'individual',at,requesterId:u.id,actorId:c.id,actionIds:[id],messageId,requestText:text};return {actionId:id};
  }
  return combatCommand(r,u,active(r)?'combatAct':'recoverWeapon',{characterId:c.id,action:'recover',lootId:p.lootId},die);
 }
 if(active(r))fail('이 조작은 전투 중 바로 실행할 수 없습니다. 현재 전투에서는 무기 준비·탄창 교체·투척 무기 회수를 사용할 수 있습니다.');
 if(verb==='eat'){
  requireLocalAccess(r,c.id);const i=item(r,p.itemId);if(!i.food)fail('음식과 섭취 시간을 먼저 확인하세요.');
  if(p.quantity!==1||(c.assets.items[i.id]||0)<1)fail('보유 음식 한 개를 선택하세요.');
  c.assets.items[i.id]-=1;if(!c.assets.items[i.id])delete c.assets.items[i.id];
  advanceGameSeconds(r,i.food.minutes*60);record(r,u,'meal',`${c.name} · ${i.name} 식사 · ${i.food.minutes}분`,{characterId:c.id,itemId:i.id,quantity:1});return {};
 }
 if(verb==='rest'){
  if(!baseHere(r,c))fail('휴식할 거점에 도착해야 합니다.');
  const a={id:crypto.randomUUID(),actorId:c.id,text:`${qty(p.quantity)}분 휴식`,status:'pending'};
  if(!trySimpleRest(r,a,die))fail('지금은 휴식할 수 없습니다.');return {};
 }
 if(verb==='pickup'){
  const g=r.groundItems?.find(x=>x.id===p.lootId&&x.quantity>0);
  if(!g||g.placeId!==locationOf(r,c.id)||g.mapId!==r.mapId)fail('같은 장소의 물건만 주울 수 있습니다.');
  if(g.ownerId!==c.id)fail('다른 인물의 물건은 전달받아야 합니다.');
  const n=qty(p.quantity);if(g.quantity<n)fail('남아 있는 수량이 부족합니다.');const i=item(r,g.itemId);
  if((c.assets.items[i.id]||0)+n>99999)fail('보관 수량 한도를 초과합니다.');g.quantity-=n;c.assets.items[i.id]=(c.assets.items[i.id]||0)+n;
  advanceGameSeconds(r,2);record(r,u,'pickup',`${c.name} · ${i.name} ×${n} 회수`,{characterId:c.id,itemId:i.id,quantity:n});return {};
 }
 const n=qty(p.quantity),i=mutableItem(r,c,p.itemId,n,verb);
 if(['store','take'].includes(verb)){
  if(!baseHere(r,c))fail('보관함이 있는 거점에 도착해야 합니다.');
  const stored=c.assets.storedItems||={};moveCount(verb==='store'?c.assets.items:stored,verb==='store'?stored:c.assets.items,i.id,n);
 }else if(verb==='give'){
  const target=r.characters.find(x=>x.id===p.targetId&&r.partyCharacterIds.includes(x.id)&&x.assets?.confirmed);
  if(!target||target.id===c.id||locationOf(r,target.id)!==locationOf(r,c.id))fail('같은 장소의 일행을 선택하세요.');
  moveCount(c.assets.items,target.assets.items,i.id,n);
 }else if(verb==='drop'){
  if((c.assets.items[i.id]||0)<n)fail('보유 수량이 부족합니다.');
  r.groundItems=(r.groundItems||[]).filter(x=>x.quantity>0);if(r.groundItems.length>=200)fail('주변 물품 한도입니다.');
  c.assets.items[i.id]-=n;if(!c.assets.items[i.id])delete c.assets.items[i.id];
  r.groundItems.push({id:crypto.randomUUID(),itemId:i.id,quantity:n,ownerId:c.id,placeId:locationOf(r,c.id),mapId:r.mapId});
 }else fail('지원하지 않는 물품 행동입니다.');
 record(r,u,verb,`${c.name} · ${i.name} ×${n} ${{store:'거점 보관',take:'가져옴',give:'전달 → '+r.characters.find(x=>x.id===p.targetId)?.name,drop:'내려놓음'}[verb]}`,{characterId:c.id,itemId:i.id,quantity:n,targetId:p.targetId||''});return {};
}
export function applyInventoryDeclaration(r,original,p,die){
 const a=r.actions.find(x=>x.id===p.actionId&&x.status==='pending');
 if(!a||!original.gmJob?.actionIds?.includes(a.id)||original.gmJob.requesterId!==a.author)fail('이번 요청의 미처리 행동만 실행하세요.',403);
 // Mutation callers operate on a transaction copy: any validation error rolls this back as well.
 a.status='resolved';a.inventoryHandled=true;
 const result=inventoryCommand(r,{id:a.author},'inventoryAction',{...p,characterId:a.actorId,fromDeclaration:true},die,a);
 a.timeCharged=true;return result;
}
const number=s=>({'한':1,'하나':1,'두':2,'둘':2,'세':3,'셋':3}[s]||Number(s));
export function directInventoryIntent(r,c,text){
 const t=text.trim().replace(/[.!]$/,'');
 // Whole affirmative sentences only: questions, negations and compound declarations go to GM.
 let m=/^(?:아까\s*)?(?:던진|투척한)\s*(?:칼|단검|나이프)(?:을|를)?\s*(?:회수해|회수한다|회수|줍는다)$/.exec(t);
 if(m){const loose=(r.looseWeapons||[]).filter(x=>x.ownerId===c.id&&looseHere(r,c,x)&&(active(r)||x.retrievableBy===c.id));return loose.length===1?{verb:'recover',lootId:loose[0].id,quantity:1}:null;}
 m=/^(.+?)(?:을|를)?\s+(?:(\d+|한|두|세|하나|둘|셋)\s*(?:개|발|자루|병)\s*)?(구매해|구매한다|사줘|사|산다|판매해|판매한다|판다|사용해|사용한다|내려놓는다|내려놔|보관해|보관한다|가져와|가져온다)$/.exec(t);
 if(!m)return null;
 const matches=(r.economy?.items||[]).filter(i=>[i.name,itemLabel(c,i)].some(name=>name===m[1]||name===m[1].replace(/(?:을|를)$/,'')));if(matches.length!==1)return null;
 const i=matches[0],v=m[3],verb=/^(구매|사|산)/.test(v)?'buy':/^(판매|판)/.test(v)?'sell':/^사용/.test(v)?'use':/^내려/.test(v)?'drop':/^보관/.test(v)?'store':'take';
 const intent={verb,itemId:i.id,quantity:m[2]?number(m[2]):1};
 if(['buy','sell'].includes(verb)){const visit=r.economy.visits?.[c.id]||r.economy.visit,s=r.economy.shops.find(s=>s.id===visit?.shopId),o=s?.offers.find(o=>o.itemId===i.id);if(!o)return null;Object.assign(intent,{shopId:s.id,expectedUnitPrice:verb==='buy'?o.price:o.sellPrice});}
 return intent;
}
export function tryDirectInventory(r,u,a,die){
 const c=r.characters.find(c=>c.id===a.actorId);if(!c||a.storyEventId)return false;
 const p=directInventoryIntent(r,c,a.text);if(!p)return false;
 applyInventoryDeclaration(r,{gmJob:{actionIds:[a.id],requesterId:u.id}},{...p,actionId:a.id},die);return true;
}
