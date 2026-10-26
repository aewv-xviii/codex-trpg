import {fishPath,pathLength,along} from './aquarium-space.mjs';
import {successRoll} from './conditions.mjs';
import {aquariumRule} from './data/ability-rules.mjs';
const rules=aquariumRule.parameters;
// An AI-selected itinerary, with physical paths and per-area checks on server.
export function surveyMission(r,fish,areas,thorough){
 if(!Array.isArray(areas)||!areas.length||areas.length>16)throw Error('조사 구역은 1~16개로 나누세요.');
 let pos=fish.position,elapsed=0,travel=0;const paths=[{...pos}],segments=[],names=new Set();
 const seconds=thorough?rules.thoroughSurveySeconds:rules.fastSurveySeconds;
 for(const area of areas){
  if(typeof area.label!=='string'||!area.label.trim()||area.label.length>150||names.has(area.label.trim()))throw Error('중복 없는 조사 구역 이름이 필요합니다.');
  names.add(area.label.trim());
  const path=fishPath(r,{...fish,position:pos},area.path),duration=Math.ceil(pathLength(path)/fish.move);
  segments.push({kind:'move',path,start:elapsed,end:elapsed+duration});elapsed+=duration;travel+=duration;
  const navigation=area.navigation;
  if(navigation&&navigation.mode!=='guided'){
   if(navigation.mode!=='autonomous'||!Number.isInteger(navigation.modifier)||Math.abs(navigation.modifier)>20||!Number.isInteger(navigation.seconds)||navigation.seconds<0||navigation.seconds>3600||!['lost','return'].includes(navigation.criticalFailure)||!navigation.reason?.trim())throw Error('미지 구역 길 찾기의 근거·시간·실패 방침이 필요합니다.');
   segments.push({kind:'navigation',area:area.label.trim(),position:{...path.at(-1)},start:elapsed,end:elapsed+navigation.seconds,...navigation});elapsed+=navigation.seconds;
  }
  const observation=area.observation|| (thorough?'observation':'automatic'),modifier=area.modifier??0;
  if(!['automatic','perception','observation'].includes(observation)||!Number.isInteger(modifier)||Math.abs(modifier)>20)throw Error('구역별 관찰 방식과 보정을 확인하세요.');
  if(observation!=='automatic'&&area.reason!==undefined&&!area.reason.trim())throw Error('불확실한 관찰의 판정 근거가 필요합니다.');
  segments.push({kind:'survey',area:area.label.trim(),position:{...path.at(-1)},start:elapsed,end:elapsed+seconds,observation,modifier,reason:area.reason||area.label});elapsed+=seconds;
  paths.push(...path.slice(1));pos=path.at(-1);
 }
 segments.push({kind:'move',path:[...paths].reverse(),start:elapsed,end:elapsed+travel});
 return {path:paths,segments,travel,investigation:elapsed-travel,totalSeconds:elapsed+travel,area:areas.map(a=>a.label.trim()).join(' / ')};
}
export function advanceSurvey(fish,m,die){
 for(const s of m.segments){
  if(m.elapsed<s.start)break;
  if(s.kind==='move')fish.position=along(s.path,Math.min(m.elapsed,s.end)-s.start>=s.end-s.start?Infinity:(m.elapsed-s.start)*fish.move);
  else fish.position={...s.position};
  if(s.kind==='survey'&&m.elapsed>=s.end&&!s.roll)s.roll=surveyRoll(fish,s.observation||(m.thorough?'observation':'automatic'),s.modifier||0,die);
  if(s.kind==='navigation'&&m.elapsed>=s.end&&!s.roll){
   s.roll=successRoll((fish.iq??6)+s.modifier,die);
   if(!s.roll.success){
    const lost=s.roll.outcome==='criticalFailure'&&s.criticalFailure==='lost';
    fish.navigationOutcome={area:s.area,roll:s.roll,reason:s.reason,lost};
    if(lost){fish.lost=true;fish.blocked=true;delete fish.mission;return;}
    // Return along the already travelled route. Never visit or roll later rooms.
    const index=m.segments.indexOf(s),done=m.segments.slice(0,index+1),route=done.filter(x=>x.kind==='move').flatMap((x,i)=>i?x.path.slice(1):x.path);
    const returning=[...route].reverse(),duration=Math.ceil(pathLength(returning)/fish.move);
    m.segments=[...done,{kind:'move',path:returning,start:s.end,end:s.end+duration}];m.totalSeconds=s.end+duration;m.returningUncertain=true;
    fish.position=along(returning,Math.max(0,m.elapsed-s.end)*fish.move);break;
   }
  }
  if(m.elapsed<s.end)break;
 }
}
export function rollSurveyAreas(fish,m,die){
 return m.segments.filter(s=>s.kind==='survey'||s.kind==='navigation'&&s.roll&&!s.roll.success).map(s=>({area:s.area,position:s.position,roll:s.kind==='navigation'?{success:false,unconfirmed:true,meaning:'길 찾기 실패 · 이 구역 관찰 미확인'}:s.roll,reason:s.reason,...(s.kind==='navigation'?{navigation:s.roll}:{})}));
}
export function surveyRoll(fish,mode,modifier,die){return mode==='automatic'?{success:true,automatic:true,meaning:'경로에서 뚜렷하게 보이는 정보만. 숨은 인물·정체·의도는 알 수 없음.'}:successRoll((mode==='observation'?fish.observation:fish.per)+modifier,die);}
