import {economy,record} from './economy.mjs';
const fail=m=>{throw Object.assign(Error(m),{status:409});};
export function validateReward(value){
 if(!value||!Number.isSafeInteger(value.won)||value.won<0||value.won>1e9||!Number.isSafeInteger(value.cp)||value.cp<0||value.cp>100)fail('보상은 1인당 0~10억 원, 0~100 CP 정수로 설정하세요.');
 return {won:value.won,cp:value.cp};
}
export function configureReward(r,entry,p){
 if(entry.rewardReceipt)fail('이미 지급한 보상은 변경할 수 없습니다.');
 if(!Array.isArray(p.recipientIds)||!p.recipientIds.length||p.recipientIds.length>4||new Set(p.recipientIds).size!==p.recipientIds.length||p.recipientIds.some(id=>!r.partyCharacterIds.includes(id)))fail('보상을 받을 현재 파티원을 선택하세요.');
 const requiredEventIds=p.requiredEventIds||[];
 if(!Array.isArray(requiredEventIds)||new Set(requiredEventIds).size!==requiredEventIds.length||requiredEventIds.length>30||requiredEventIds.some(id=>!r.chronicle.events.some(e=>e.id===id&&e.caseId===entry.id)))fail('보상 조건으로 지정할 케이스 전개를 확인하세요.');
 entry.reward={...validateReward(p),recipientIds:[...p.recipientIds],requiredEventIds:[...requiredEventIds]};
}
export function settleCaseReward(r,u,entry){
 if(!entry.reward||entry.rewardReceipt)return;
 const reward=validateReward(entry.reward),ids=entry.reward.recipientIds;
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)fail('보상 수령자를 먼저 설정하세요.');
 if((entry.reward.requiredEventIds||[]).some(id=>!r.chronicle.events.some(e=>e.id===id&&e.caseId===entry.id&&e.status==='done')))fail('보상에 필요한 전개가 아직 완료되지 않았습니다.');
 const chars=ids.map(id=>r.characters.find(c=>c.id===id));
 if(chars.some(c=>!c))fail('보상 수령 캐릭터를 찾을 수 없습니다.');
 const e=economy(r);
 if(reward.won&&(!e.enabled||chars.some(c=>!c.assets.confirmed)))fail('원화 보상을 받으려면 수령자의 시작 자산을 먼저 확정하세요.');
 for(const c of chars){
  const earned=c.advancement?.earnedCP||0,spent=c.advancement?.spentCP||0;
  if(!Number.isSafeInteger(earned)||!Number.isSafeInteger(spent)||earned<spent||spent<0||!Number.isSafeInteger(earned+reward.cp)||!Number.isSafeInteger(c.assets.won+reward.won)||c.assets.won+reward.won>1e12)fail('수령자의 소지금·CP 기록을 확인하세요.');
 }
 const receipt={id:crypto.randomUUID(),gameClock:structuredClone(r.chronicle.clock),awards:[]};
 for(const c of chars){
  c.assets.won+=reward.won;c.advancement={...(c.advancement||{}),earnedCP:(c.advancement?.earnedCP||0)+reward.cp,spentCP:c.advancement?.spentCP||0};
  receipt.awards.push({characterId:c.id,...reward});
  record(r,u,'caseReward',`${entry.title} 보상 · ${c.name} · ${reward.won.toLocaleString('ko-KR')}원 · ${reward.cp} CP`,{caseId:entry.id,characterId:c.id,wonDelta:reward.won,cpDelta:reward.cp,balance:c.assets.won,earnedCP:c.advancement.earnedCP,receiptId:receipt.id});
 }
 entry.rewardReceipt=receipt;
}
