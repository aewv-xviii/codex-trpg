// Shared deterministic quote; fuel is purchased at services, never charged twice.
export function vehicleQuote(vehicle,quote,definition,travelers=1){
 if(!quote)return null;
 if(!vehicle?.spec)return {...quote,legacyFuelEstimate:true};
 const s=vehicle.spec;
 if(!vehicle.available||s.condition<=0)throw Error('사용할 수 없는 차량입니다.');
 if(travelers>s.seats)throw Error('차량의 탑승 정원을 초과합니다.');
 let km=quote.distanceKm;
 if(!Number.isFinite(km)){
  km=0;
  for(let i=1;i<quote.path.length;i++){
   const edge=definition.routes.find(e=>e.from===quote.path[i-1]&&e.to===quote.path[i]||e.to===quote.path[i-1]&&e.from===quote.path[i]);
   if(!Number.isFinite(edge?.modes?.car?.distanceKm))throw Error('차량 경로의 거리를 먼저 등록하세요.');
   km+=edge.modes.car.distanceKm;
  }
 }
 const fuelLiters=Math.ceil(km*s.litersPer100Km/100*1000)/1000;
 if(s.fuelLiters+1e-8<fuelLiters)throw Error('목적지까지 이동할 연료가 부족합니다.');
 return {...quote,distanceKm:km,fuelLiters,won:quote.estimated?Math.ceil((definition.travelModel?.settings?.parkingWon??1000)/100)*100:quote.won,breakdown:'연료 차감 · 등록된 주차·통행 비용'};
}
