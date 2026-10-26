import {position,yards,visibleLine} from './aquarium-space.mjs';
import {locationOf} from '../public/play/item-view.js';
const fail=m=>{throw Error(m);};
export function dropMagazine(r,c,magazine){
 if(!magazine)return;
 const ground=r.groundMagazines??=[];
 if(ground.length>=200)fail('현장의 탄창 보관 한도입니다. 회수 기록을 정리하세요.');
 if(ground.some(g=>g.id===magazine.id))fail('이미 현장에 있는 탄창입니다.');
 ground.push({id:magazine.id,ownerId:c.id,magazine:structuredClone(magazine),position:position(r,c.id),placeId:locationOf(r,c.id),mapId:r.mapId||'',at:new Date().toISOString()});
}
export function groundMagazine(r,c,id,allowOthers=false){
 const g=r.groundMagazines?.find(g=>g.id===id);
 if(!g||!allowOthers&&g.ownerId!==c.id)fail('위치를 확인한 탄창만 회수할 수 있습니다.');
 if(g.placeId!==locationOf(r,c.id)||g.mapId!==(r.mapId||''))fail('탄창이 있는 장소로 먼저 이동하세요.');
 const here=position(r,c.id);
 if(g.position&&(!here||yards(here,g.position)>1.01||!visibleLine(r,here,g.position)))fail('떨어진 탄창에 닿는 위치로 먼저 이동하세요.');
 return g;
}
export function recoverMagazine(r,c,g){
 (c.assets.magazines??=[]).push(g.magazine);r.groundMagazines=r.groundMagazines.filter(x=>x.id!==g.id);
 return {magazineId:g.id,rounds:g.magazine.rounds};
}
