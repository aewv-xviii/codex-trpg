export function requireTravelVehicle(r,actorId,placeId,packId=''){
 const v=r.worldLibrary?.vehicles?.slice().sort((a,b)=>Number(!!b.selected)-Number(!!a.selected)).find(v=>v.characterId===actorId&&v.available&&v.placeId===placeId&&(v.packId||'')===packId);
 if(!v)throw Object.assign(Error('현재 출발지에 사용할 수 있는 본인 소유 차량이 없습니다.'),{status:409});
 return v;
}
