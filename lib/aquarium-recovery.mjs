import {hasAquarium} from './aquarium.mjs';
import {canControl} from '../public/play/character-control.js';
import {sceneKey} from './aquarium-space.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:409});};
export function resumeAquariumScout(r,user,p){
 if(user.id!==r.owner)throw Object.assign(Error('방장 권한이 필요합니다.'),{status:403});
 if(['queued','running','applying'].includes(r.gmJob?.status)||r.combat?.status==='active')fail('진행 중인 처리가 끝난 뒤 정찰을 복구하세요.');
 const a=r.actions.find(a=>a.id===p.actionId),c=r.characters.find(c=>c.id===a?.actorId);
 if(!a||a.status!=='resolved'||a.powerResult?.power!=='scout'||a.aquariumResumed||a.powerReports?.length||!hasAquarium(c||{})||!canControl(c,{id:a.author}))fail('복구 가능한 미완료 정찰이 아닙니다.');
 if(a.worldFrom&&a.worldFrom!==r.worldLibrary?.placeId)fail('원래 정찰 장소에서만 복구할 수 있습니다.');
 const fish=c.aquarium.fish.find(f=>f.id===a.powerResult.fishId&&f.hp>0&&f.mission?.kind==='scout');
 if(!fish||fish.reportReady||fish.mission.actionId&&fish.mission.actionId!==a.id)fail('이어갈 정찰 임무가 없습니다.');
 if(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>1000)fail('복구 사유가 필요합니다.');
 const repair={id:crypto.randomUUID(),at:new Date().toISOString(),author:user.id,reason:p.reason,beforeVersion:r.version,action:structuredClone(a),mission:structuredClone(fish.mission)};
 (r.actionRepairs??=[]).push(repair);
 a.status='pending';a.aquariumResumed={repairId:repair.id,completed:structuredClone(a.powerResult)};
 fish.mission.actionId=a.id;fish.mission.scene??=sceneKey(r);
 r.gmJob={id:crypto.randomUUID(),kind:'individual',status:'queued',actionIds:[a.id],actorId:c.id,requesterId:a.author,advanceTurn:false,at:repair.at,requestText:a.text+'\n[중단된 정찰 복구] 소환과 첫 물고기 정찰 명령은 이미 실행되었습니다. 재소환·재명령하지 마세요. 첫 물고기 mission은 보존되어 진행 중입니다. 원래 선언의 두 번째 물고기만 기존 공개 공간 근거에 따라 scout로 보내는 aquariumSequence를 사용하고 waitForReports=true로 귀환까지 처리하세요. 소환자의 이동이나 추가 행동은 하지 마세요. 반환된 두 보고의 결과는 후속 narration에서 실제 서버 결과와 기존 시나리오 관찰 가능 사실에 한정해 전달합니다.'};
 return {repairId:repair.id,actionId:a.id,jobId:r.gmJob.id};
}
