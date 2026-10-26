import {powerTurn} from './combat.mjs';
import {canControl} from '../public/play/character-control.js';
import {controlFlags} from './control-state.mjs';
import {gurpsSuccessRoll} from './gurps.mjs';
import {shockModifier} from './injury.mjs';
import {modifier,advanceGameSeconds} from './conditions.mjs';
import {characterPlace} from './world-library.mjs';

const fail=message=>{throw Error(message);};
const text=(s,max=1000)=>typeof s==='string'&&s.trim()&&s.length<=max?s.trim():fail('재정의 근거와 결과 범위를 입력하세요.');
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max?n:fail('재정 수치 범위를 확인하세요.');
export function rulingSource(room,p,proofs=[]){
 if(!['source','local_source'].includes(p.kind))fail('즉시 재정에는 확인된 원문이 필요합니다. 새 하우스룰은 초안으로 제안하세요.');
 const quote=text(p.quote,500);
 if(p.kind==='source'){
  const ids=[...(room.campaign.rulebookIds||[]),room.campaign.rulebookId];
  const doc=room.documents.find(d=>ids.includes(d.id)&&d.id===p.documentId&&d.visibility==='public'&&(!d.role||['rulebook','houseRule'].includes(d.role)));
  if(!doc?.content.includes(quote))fail('선택된 공개 룰북에서 인용을 확인하지 못했습니다.');
  return `${doc.title}: ${quote}`;
 }
 const match=/^local:([a-f0-9]{24}):(\d+)$/.exec(p.documentId||'');
 const book=room.localLibrary?.books?.find(b=>b.id===match?.[1]&&b.kind==='rule'&&b.emptyPages<b.pages);
 const ids=room.campaign.localBookIds??room.localLibrary?.books?.filter(b=>b.kind==='rule').map(b=>b.id)??[];
 if(!book||!ids.includes(book.id)||!proofs.some(v=>v.bookId===book.id&&v.page===Number(match[2])&&v.digest===book.digest&&v.quote===quote))fail('연결된 로컬 GM의 원문 확인이 필요합니다.');
 return `${book.title} · PDF/텍스트 페이지 ${match[2]}: ${quote}`;
}
export function rulingTarget(room,c,p){
 const fields=c.fields?.filter(f=>f.name===p.field)||[];
 if(fields.length!==1||!/^\d+$/.test(String(fields[0].value).trim()))fail(`${c.name}: 정확한 시트 기능 이름과 정수 수준이 필요합니다.`);
 const base=integer(Number(fields[0].value),1,999),adjustment=integer(p.modifier,-100,100);
 text(p.reason);if(!['ST','DX','IQ','HT','Will','Per'].includes(p.attribute))fail('판정 기준 능력치를 지정하세요.');
 const scopes=p.scopes||[];
 if(!Array.isArray(scopes)||new Set(scopes).size!==scopes.length||scopes.some(s=>!['observation','vision','hearing','smell','touch','sense:vision','sense:hearing','sense:smell','sense:touch','sense:taste','concentration','approachDetection'].includes(s)))fail('상태 보정 범위를 확인하세요.');
 const statusModifier=shockModifier(room,c,p.attribute)+scopes.reduce((n,s)=>n+modifier(c,s),0);
 return {base,modifier:adjustment,statusModifier,target:integer(base+adjustment+statusModifier,3,999),fieldName:p.field};
}
export function rulingRoll(c,t,die){const dice=[die(6),die(6),die(6)];dice.forEach(d=>integer(d,1,6));const total=dice.reduce((a,b)=>a+b,0);return {actorId:c.id,dice,total,...t,...gurpsSuccessRoll(total,t.target)};}
const target=rulingTarget,roll=rulingRoll;
// B348: success beats failure; otherwise compare margins. Critical labels do
// not replace the contest comparison. A tie is explicitly not a victory.
export function quickContest(a,b){
 const difference=a.margin-b.margin;
 return {winner:a.success!==b.success?(a.success?'actor':'opponent'):difference>0?'actor':difference<0?'opponent':'tie',marginOfVictory:Math.abs(difference)};
}
function transferPlan(r,actor,p){
 if(!p||!p.fromId)return null;
 const from=r.characters.find(c=>c.id===p.fromId&&c.isNPC&&!c.controllers?.length);
 if(!from||from.id===actor.id||characterPlace(r,from.id)!==characterPlace(r,actor.id))fail('같은 장소에 있는 GM 담당 NPC의 물품만 가져올 수 있습니다.');
 if(!r.economy?.enabled||!actor.assets?.confirmed||!from.assets?.confirmed||from.npcPossessions?.reviewed===false)fail('물품 장부가 필요합니다.');
 const quantity=integer(p.quantity,1,999);
 if(!p.itemId)fail('시나리오에 등록된 실제 NPC 소지품만 이전할 수 있습니다. 소지품을 즉석 생성하지 마세요.');
 if(p.propName||p.propDescription)fail('기존 물품에는 새 소품을 겹쳐 지정할 수 없습니다.');
 const item=r.economy.items.find(i=>i.id===p.itemId);
 if(!item||(from.assets.items[item.id]||0)<quantity)fail('대상의 실제 보유 물품과 수량을 확인하세요.');
 const weapons=[from.combatProfile?.weapon,...(from.combatLoadout||[]).map(x=>x.weapon)].filter(Boolean);
 if(weapons.some(w=>w.itemId===item.id||w.inventoryItemId===item.id||w.name===item.name))fail('장비에 연결된 물품은 전용 무장해제 절차가 필요합니다.');
 if((actor.assets.items[item.id]||0)+quantity>99999)fail('보유 수량 한도를 초과합니다.');
 return {from,quantity,item};
}
// Called exclusively by finishJob, never by a browser command. The proposal is
// fixed and validated before any dice, cost, clock or inventory mutation.
export function applySourceRuling(r,original,p,proofs,die){
 if(r.campaign.system!=='gurps4'||!['individual','turn'].includes(original.gmJob?.kind))fail('이번 겁스 행동 선언에 원문 재정을 사용하세요.');
 const initial=original.actions.find(a=>a.id===p.actionId&&a.status==='pending'&&(!original.gmJob.actionIds||original.gmJob.actionIds.includes(a.id)));
 const a=r.actions.find(a=>a.id===p.actionId);
 if(!initial||a?.status!=='pending'||a.mapIntent||a.worldDestination)fail('이번 요청의 일반 미처리 행동만 판정할 수 있습니다.');
 const actor=r.characters.find(c=>c.id===a.actorId),member=r.members.find(m=>m.id===a.author);
 if(!actor||!member||!canControl(actor,member)||!r.partyCharacterIds.includes(actor.id))fail('행동 선언자의 조작 권한을 확인하세요.');
 if(controlFlags(actor).noAction||['dead','dying','unconscious'].includes(actor.combatState?.status)||actor.combatState?.stunned)fail('행동할 수 있는 상태가 아닙니다.');
 if(!Array.isArray(p.sources)||!p.sources.length||p.sources.length>6)fail('원문 근거 1~6개가 필요합니다.');
 const sources=p.sources.map(s=>rulingSource(r,s,proofs));
 if(!['success','quickContest'].includes(p.mode))fail('지원되는 판정 절차를 선택하세요.');
 const scope=text(p.scope),risk=text(p.risk),successText=text(p.success),failureText=text(p.failure),tieText=text(p.tie);
 const actorTarget=target(r,actor,p.actor);
 const opponent=p.mode==='quickContest'?r.characters.find(c=>c.id===p.opponentId):null;
 if(p.mode==='quickContest'&&(!opponent||opponent.id===actor.id||characterPlace(r,opponent.id)!==characterPlace(r,actor.id)))fail('같은 장소에 있는 대결 상대가 필요합니다.');
 if(p.mode==='success'&&p.opponentId)fail('단순 성공 판정에는 대결 상대를 지정하지 마세요.');
 const opponentTarget=opponent?target(r,opponent,p.opponent):null;
 const seconds=integer(p.seconds,0,86400),costFP=integer(p.costFP,0,100);
 const inCombat=r.combat?.status==='active';
 if(inCombat){if(seconds!==1)fail('전투 원문 재정은 현재 차례의 1초 행동으로 요청하세요. 장시간 행동은 차례별 진행이 필요합니다.');powerTurn(r,actor.id,true);}
 if(actor.fp<costFP)fail('FP가 부족합니다.');
 if(seconds&&(!r.chronicle?.clock||a.timeCharged||a.storyEventId))fail('시간을 중복 부과할 수 없습니다. 사건 시간은 기존 절차를 사용하세요.');
 const transfer=transferPlan(r,actor,p.transfer);
 const actorRoll=roll(actor,actorTarget,die),opponentRoll=opponent?roll(opponent,opponentTarget,die):null;
 const contest=opponentRoll?quickContest(actorRoll,opponentRoll):null;
 const success=contest?contest.winner==='actor':actorRoll.success,tie=contest?.winner==='tie';
 actor.fp-=costFP;
 if(inCombat)powerTurn(r,actor.id,false);
 if(seconds&&!inCombat){advanceGameSeconds(r,seconds);a.timeCharged={seconds,reason:scope};}
 if(success&&transfer){
  const id=transfer.item.id;transfer.from.assets.items[id]-=transfer.quantity;if(!transfer.from.assets.items[id])delete transfer.from.assets.items[id];
  actor.assets.items[id]=(actor.assets.items[id]||0)+transfer.quantity;
  r.economy.ledger.push({id:crypto.randomUUID(),at:new Date().toISOString(),kind:'sourceRulingTransfer',actionId:a.id,characterId:actor.id,fromId:transfer.from.id,itemId:id,quantity:transfer.quantity,wonDelta:0});
 }
 const result={id:crypto.randomUUID(),actionId:a.id,author:a.author,name:actor.name,...actorRoll,success,outcome:contest?(tie?'tie':success?'success':'failure'):actorRoll.outcome,formula:'3d6',resolution:'gurps4',comparator:'lte',source:sources.join('\n'),scope,risk,costFP,hpDelta:0,opponentRoll,contest,at:new Date().toISOString()};
 r.rolls.push(result);a.status='resolved';a.resolutionId=result.id;
 a.sourceRuling={...structuredClone(p),resultId:result.id,outcome:tie?'tie':success?'success':'failure',resultText:tie?tieText:success?successText:failureText,...(transfer?{itemId:transfer.item.id,transferred:success}:{})};
 r.messages.push({id:crypto.randomUUID(),type:'roll',author:r.owner,name:'GM',text:`${actor.name} · ${scope}: ${actorRoll.total}/${actorRoll.target}${opponentRoll?` 대 ${opponentRoll.total}/${opponentRoll.target}`:''} · ${tie?'무승부':success?'성공':'실패'}`,rollId:result.id,actionId:a.id,caseId:r.chronicle?.activeCaseId||'',gameClock:structuredClone(r.chronicle?.clock||null),at:result.at});
 return result;
}
