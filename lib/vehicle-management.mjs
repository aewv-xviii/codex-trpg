import {canControl} from '../public/play/character-control.js';
import {requireScopeIdle} from './play-scope.mjs';
import {openAt,spendTravel} from './economy.mjs';
import {chronicleCommand} from './chronicle.mjs';
const fail=m=>{throw Error(m);};
const num=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max?v:fail('차량 수치를 확인하세요.');
export function vehicleCommand(r,u,op,p){
 if(!['configureVehicle','configureVehicleService','serviceVehicle','selectTravelVehicle'].includes(op))return null;
 requireScopeIdle(r);
 const w=r.worldLibrary;if(!w)fail('세계 자료를 먼저 등록하세요.');
 if(op==='configureVehicleService'){
  if(r.owner!==u.id)fail('방장이 확정된 서비스 요금을 등록합니다.');
  const place=w.definition.places.find(x=>x.id===p.placeId);if(!place)fail('장소를 확인하세요.');
  if(!Array.isArray(p.schedule)||p.schedule.length!==7||p.schedule.some(x=>x!==null&&(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.open)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.close))))fail('요일별 영업시간을 확인하세요.');
  w.vehicleServices||={};w.vehicleServices[p.placeId]={fuelType:String(p.fuelType||'').slice(0,30),pricePerLiter:num(p.pricePerLiter,0,100000),repairPerPoint:num(p.repairPerPoint,0,10000000),refuelMinutes:num(p.refuelMinutes,1,120),repairMinutesPerPoint:num(p.repairMinutesPerPoint,1,120),schedule:p.schedule};return {};
 }
 const v=w.vehicles?.find(x=>x.id===p.vehicleId);if(!v)fail('차량을 선택하세요.');
 if(op==='configureVehicle'){
  if(r.owner!==u.id)fail('차량 제원은 방장이 확인합니다.');
  const spec={tankLiters:num(p.tankLiters,1,10000),fuelLiters:num(p.fuelLiters,0,10000),litersPer100Km:num(p.litersPer100Km,.01,1000),seats:num(p.seats,1,100),condition:num(p.condition,0,100),fuelType:String(p.fuelType||'').trim().slice(0,30)};
  if(!spec.fuelType||!Number.isInteger(spec.seats)||spec.fuelLiters>spec.tankLiters)fail('연료 종류·탑승 정원·탱크 용량을 확인하세요.');
  v.spec=spec;return {};
 }
 const c=r.characters.find(x=>x.id===p.characterId&&canControl(x,u));if(!c||v.characterId!==c.id)fail('차량 소유자의 조작 권한이 필요합니다.');
 const place=w.characterPlaces?.[c.id]||w.placeId;
 if(v.packId||v.placeId!==place)fail('차량이 있는 장소에서 이용하세요.');
 if(op==='selectTravelVehicle'){for(const x of w.vehicles)if(x.characterId===c.id)x.selected=x.id===v.id;return {};}
 const s=w.vehicleServices?.[place];if(!s||!openAt(s,r.chronicle.clock))fail('현재 장소에서 영업 중인 차량 서비스를 이용하세요.');
 if(!v.spec)fail('차량 제원을 먼저 등록하세요.');
 const quantity=num(p.quantity,.001,10000),fuel=p.service==='refuel';
 if(!fuel&&p.service!=='repair')fail('주유 또는 수리를 선택하세요.');
 if(fuel?(s.pricePerLiter<=0||s.fuelType!==v.spec.fuelType):(s.repairPerPoint<=0))fail('해당 차량에 제공되는 서비스가 아닙니다.');
 if(fuel?quantity>v.spec.tankLiters-v.spec.fuelLiters+1e-8:quantity>100-v.spec.condition+1e-8)fail('필요한 양보다 많습니다.');
 const won=Math.ceil(quantity*(fuel?s.pricePerLiter:s.repairPerPoint)),minutes=Math.ceil(fuel?s.refuelMinutes:quantity*s.repairMinutesPerPoint);
 if(p.expectedWon!==won)fail('서비스 요금이 변경되었습니다.');
 spendTravel(r,u,c.id,won,{mode:fuel?'refuel':'repair',minutes,from:place,to:place});
 const entry=r.economy.ledger.at(-1);if(entry){entry.kind=fuel?'refuel':'vehicleRepair';entry.description=`${c.name} · ${v.name} ${fuel?'주유':'수리'} ${won}원`;entry.vehicleId=v.id;entry.quantity=quantity;}
 if(fuel)v.spec.fuelLiters=Math.round((v.spec.fuelLiters+quantity)*1000)/1000;else v.spec.condition+=quantity;
 chronicleCommand(r,{id:r.owner},'advanceClock',{minutes,reason:v.name+' '+(fuel?'주유':'수리')});
 r.messages.push({id:crypto.randomUUID(),type:'system',name:c.name,author:u.id,text:`${v.name} · ${fuel?'주유 '+quantity+' L':'수리 '+quantity+'점'} · ${won}원 · ${minutes}분`,at:new Date().toISOString()});return {won,minutes};
}
