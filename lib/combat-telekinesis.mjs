import {position,visibleLine,yards} from './aquarium-space.mjs';
const fail=s=>{throw Error(s);};
export function registerCombatObject(r,u,p){
 const b=r.combat;if(r.owner!==u.id)fail('방장 권한이 필요합니다.');
 if(b?.status!=='active'||b.pending)fail('진행 중인 전투의 행동 전에 물체를 확인하세요.');
 if(typeof p.objectId!=='string'||!p.objectId||p.objectId.length>80||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500||!Number.isFinite(p.weightLb)||p.weightLb<=0||p.weightLb>1000||![p.x,p.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=10000)||b.theater&&p.y!==0)fail('실제 물체의 이름·무게·위치·근거를 확인하세요.');
 b.objects||=[];if(b.objects.some(o=>o.id===p.objectId)||b.objects.length>=30)fail('이미 등록된 물체이거나 저장 한도입니다.');
 const origin=position(r,b.order[b.index]);b.objects.push({id:p.objectId,name:p.name,weightLb:p.weightLb,position:{...origin,x:p.x,y:p.y},source:p.reason});return {objectId:p.objectId};
}
export function releaseTKObjects(r,id){for(const o of r.combat?.objects||[])if(o.holder===id){delete o.holder;delete o.liftProgress;delete o.lifted;}}
export function tkObjectAction(r,c,p){
 if(c.combatProfile.telekinesis!==5)fail('검토된 TK5 능력이 필요합니다.');
 const b=r.combat,o=b.objects?.find(o=>o.id===p.objectId),origin=position(r,c.id);
 if(!o||yards(origin,o.position)>10||!visibleLine(r,origin,o.position))fail('10야드 안의 실제 등록 물체를 선택하세요.');
 if(p.action==='tkDrop'){if(o.holder!==c.id)fail('자신이 들고 있는 물체를 선택하세요.');releaseTKObjects(r,c.id);return '염동 물체 내려놓기';}
 if(o.weightLb>40||o.holder&&o.holder!==c.id)fail('TK5로 들 수 없는 무게이거나 다른 인물이 장악한 물체입니다.');
 if((b.objects||[]).some(x=>x.id!==o.id&&x.holder===c.id)||(b.grapples||[]).some(g=>g.actorId===c.id&&g.telekinesis))fail('기존 염동 잡기·물체를 먼저 해제하세요.');
 if(p.action==='tkLift'){
  if(o.lifted)fail('이미 들고 있습니다. 이동 또는 유지를 선택하세요.');const required=o.weightLb<=5?1:o.weightLb<=10?2:4;
  o.holder=c.id;o.liftProgress=(o.liftProgress||0)+1;o.lifted=o.liftProgress>=required;
  return `염동 들기 ${o.name} · ${o.liftProgress}/${required} 준비 행동`;
 }
 if(!o.lifted||o.holder!==c.id)fail('먼저 물체를 완전히 들어 올리세요.');
 const move=o.weightLb<=5?5:o.weightLb<=10?4:o.weightLb<=15?3:o.weightLb<=30?2:1,end={...origin,x:p.zoneX,y:p.zoneY};
 if(![end.x,end.y].every(Number.isFinite)||b.theater&&end.y!==0||yards(origin,end)>10||yards(o.position,end)>move+.01||!visibleLine(r,o.position,end)||!visibleLine(r,origin,end))fail('염동 이동력·사거리·벽을 확인하세요.');
 o.position=end;return `염동 이동 ${o.name} · Move ${move}`;
}
