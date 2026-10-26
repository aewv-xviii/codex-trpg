import {sceneKey,visibleLine} from './aquarium-space.mjs';
import {rulingSource} from './source-ruling.mjs';
import {successRoll,lifecycleLog} from './conditions.mjs';
const fail=m=>{throw Error(m);};
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000;
export function pauseFish(fish,kind,reason){
 if(!fish.mission)return;
 fish.mission.pause??={kind,reason};fish.blocked=true;
}
// Clock advances never delete a mission. A pause preserves elapsed work, rolls and cargo.
export function fishCanAdvance(r,fish,delta){
 const m=fish.mission;let active=delta;
 if(fish.suppression){const lost=Math.min(delta,fish.suppression.remainingSeconds);active-=lost;fish.suppression.remainingSeconds-=lost;if(!fish.suppression.remainingSeconds){delete fish.suppression;if(m?.pause?.kind==='suppression'){delete m.pause;delete fish.blocked;}}}
 if(!m||fish.suppression||m.pause)return 0;
 if(m.scene&&m.scene!==sceneKey(r)){pauseFish(fish,'space','장면 좌표 재연결 필요');return 0;}
 if(m.path.some((p,i)=>i&&!visibleLine(r,m.path[i-1],p))){pauseFish(fish,'path','경로의 문·벽 상태 변경');return 0;}
 return active;
}
export function applyAquariumSituation(r,original,p,proofs,die){
 if(!['individual','turn','narration','combat','awareness','storyDay'].includes(original.gmJob?.kind))fail('현재 장면을 진행하는 GM 작업이 필요합니다.');
 const c=r.characters.find(c=>c.id===p.characterId),f=c?.aquarium?.fish?.find(f=>f.id===p.fishId&&f.hp>0);if(!f)fail('살아 있는 실제 유영어가 필요합니다.');
 if(!p.eventId?.trim()||p.eventId.length>100||!p.reason?.trim()||p.reason.length>1000)fail('상황 사건 ID와 근거가 필요합니다.');
 const receipts=f.situationReceipts??=[];if(receipts.some(x=>x.id===p.eventId))fail('이미 처리한 물고기 상황입니다.');if(receipts.length>=100)fail('물고기 상황 기록 한도입니다.');
 let result={mode:p.mode,reason:p.reason};
 if(['suppress','maneuver'].includes(p.mode)){
  if(!p.sources?.length)fail('억제·환경 판정의 실제 원문 근거가 필요합니다.');p.sources.forEach(s=>{const d=r.documents.find(d=>d.id===s.documentId&&['ability','characterSheet'].includes(d.role)&&(r.campaign.characterReferenceIds||[]).includes(d.id));if(d&&s.kind==='source'&&s.quote?.trim()&&d.content.includes(s.quote))return;rulingSource(r,s,proofs);});
 }
 if(p.mode==='suppress'){
  if(!Number.isInteger(p.seconds)||p.seconds<1||p.seconds>86400)fail('억제 지속 시간을 확인하세요.');
  f.suppression={eventId:p.eventId,remainingSeconds:p.seconds,reason:p.reason};pauseFish(f,'suppression',p.reason);
 }else if(p.mode==='release'){
  if(!f.suppression||f.suppression.eventId!==p.relatedEventId)fail('해제할 억제 사건을 지정하세요.');
  delete f.suppression;if(f.mission?.pause?.kind==='suppression')delete f.mission.pause;if(!f.mission?.pause)delete f.blocked;
 }else if(p.mode==='maneuver'){
  if(!Number.isInteger(p.modifier)||Math.abs(p.modifier)>20||!Number.isInteger(f.dx))fail('물고기의 실제 DX와 환경 보정을 확인하세요.');
  if(f.suppression)fail('억제가 해제된 뒤 기동 판정을 하세요.');
  const roll=successRoll(f.dx+p.modifier,die);result.roll=roll;
  if(!roll.success)pauseFish(f,'maneuver',p.reason);
  else if(f.mission?.pause?.kind==='maneuver'){delete f.mission.pause;delete f.blocked;}
 }else if(p.mode==='resume'){
  if(!f.mission?.pause||f.suppression)fail('재개할 중단 임무와 억제 해제를 확인하세요.');
  if(f.mission.pause.kind==='maneuver')fail('환경 기동의 실제 성공 판정으로 재개하세요.');
  if(f.mission.scene!==sceneKey(r)||f.mission.path.some((x,i)=>i&&!visibleLine(r,f.mission.path[i-1],x)))fail('현재 공간과 통과 가능한 경로를 먼저 연결하세요.');
  delete f.mission.pause;delete f.blocked;
 }else if(p.mode==='rebind'){
  const link=p.connection,m=f.mission||f.reportReady||f.suspendedSurvey;
  if(!m||!f.position||!link||link.fromSpace!==f.position.space||!point(link.fromAnchor)||!point(link.toAnchor)||![0,90,180,270].includes(link.rotation))fail('기존 공간과 동일한 물리 지점의 기준점·회전 연결이 필요합니다.');
  const map=r.maps.find(m=>m.id===r.mapId&&'map:'+m.id===link.toSpace),combat=r.combat;
  if(!map&&!(combat?.status==='active'&&combat.theater&&link.toSpace==='combat:'+combat.id))fail('실제로 존재하는 도착 좌표계가 필요합니다.');
  if(m.caseId!==undefined&&m.caseId!==(r.chronicle.activeCaseId||''))fail('다른 시나리오로 임무를 옮길 수 없습니다.');
  const radians=link.rotation*Math.PI/180,cos=Math.round(Math.cos(radians)),sin=Math.round(Math.sin(radians));
  const transform=p=>{if(p.space&&p.space!==link.fromSpace)fail('여러 좌표계를 하나로 덮어쓸 수 없습니다.');const dx=p.x-link.fromAnchor.x,dy=p.y-link.fromAnchor.y;const q={...p,space:link.toSpace,x:link.toAnchor.x+dx*cos-dy*sin,y:link.toAnchor.y+dx*sin+dy*cos};if(!point(q)||map&&(q.x<0||q.y<0||q.x>map.columns*map.unit||q.y>map.rows*map.unit)||!map&&q.y!==0)fail('연결된 경로가 도착 공간 범위를 벗어납니다.');return q;};
  const records={};for(const key of ['mission','reportReady','suspendedSurvey'])if(f[key]){
   const copy=structuredClone(f[key]);copy.path=copy.path.map(transform);for(const s of copy.segments||[]){if(s.path)s.path=s.path.map(transform);if(s.position)s.position=transform(s.position);}
   if(copy.path.some((x,i)=>i&&!visibleLine(r,copy.path[i-1],x)))fail('연결된 실제 경로가 막혔습니다.');
   copy.scene=sceneKey(r);if(copy.pause?.kind==='space')delete copy.pause;records[key]=copy;
  }
  const position=transform(f.position);Object.assign(f,records,{position});
  if(!f.mission?.pause&&!f.suppression)delete f.blocked;result.connection=structuredClone(link);
 }else fail('물고기 상황 처리 방식을 확인하세요.');
 receipts.push({id:p.eventId,...result});lifecycleLog(r,c,f.name+' · '+p.reason,{power:'fishSituation',fishId:f.id,...result});return result;
}
