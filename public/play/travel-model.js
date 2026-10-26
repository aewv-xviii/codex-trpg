// Deterministic game estimates, not navigation directions or historical timetables.
export const travelDefaults={busOpen:5,busClose:24,railOpen:5,railClose:24,walkKph:4.5,roadFactor:1.35,roadKph:24,peakFactor:1.5,busKph:18,busWait:6,railKph:32,railWait:5,accessMinutes:8,busFare:600,railFare:600,railBaseKm:10,railStepKm:5,railStepWon:100,taxiBase:1300,taxiBaseKm:2,taxiStepMeters:210,taxiStepWon:100,nightFactor:1.2,carWonPerKm:150,parkingWon:1000};
const bounds={busOpen:[0,24],busClose:[0,24],railOpen:[0,24],railClose:[0,24],walkKph:[1,10],roadFactor:[1,3],roadKph:[5,100],peakFactor:[1,3],busKph:[5,80],busWait:[0,60],railKph:[5,100],railWait:[0,60],accessMinutes:[0,60],busFare:[0,100000],railFare:[0,100000],railBaseKm:[1,100],railStepKm:[1,100],railStepWon:[0,100000],taxiBase:[0,100000],taxiBaseKm:[0,100],taxiStepMeters:[1,10000],taxiStepWon:[0,100000],nightFactor:[1,3],carWonPerKm:[0,10000],parkingWon:[0,100000]};
export function validateTravelModel(v){
 if(!v||typeof v.enabled!=='boolean'||!['coordinates','hoemun-2000-v1'].includes(v.profile))throw Error('이동 계산 프로필을 확인하세요.');
 const settings={};for(const [key,value] of Object.entries(v.settings||{})){
  const b=bounds[key];if(!b||typeof value!=='number'||!Number.isFinite(value)||value<b[0]||value>b[1])throw Error('이동 계산 설정 범위를 확인하세요.');
  settings[key]=value;
 }
 return {enabled:v.enabled,profile:v.profile,settings};
}
export function validateTravelPoint(p){
 if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||p.lat<33||p.lat>39||p.lon<124||p.lon>132)throw Error('한국 지역 좌표를 확인하세요.');
 return {lat:p.lat,lon:p.lon,bus:p.bus!==false,subway:p.subway!==false};
}
// Approximate representative locations. Fictional properties are placed near their district anchor.
// These are authored game positions, not geocoded addresses or a survey of the fictional neighbourhood.
const anchors={A:[37.516,126.894],B:[37.518,126.895],C:[37.514,126.895],D:[37.517,126.899],E:[37.512,126.890],F:[37.510,126.894],X:[37.515,126.892],
 'YDP-01':[37.516,126.907],'YDP-02':[37.525,126.897],'YDP-03':[37.509,126.902],'GUR-01':[37.509,126.891],'YDP-04':[37.517,126.917],'GUR-02':[37.493,126.895],'YDP-05':[37.526,126.921],'YCN-01':[37.525,126.876],'GJ-01':[37.557,127.079]};
const landmarks={'B-01':[37.518,126.895],'YDP-01-01':[37.516,126.907],'YDP-01-02':[37.522,126.905],'YDP-02-01':[37.527,126.896],'YDP-02-02':[37.525,126.897],'GUR-01-01':[37.509,126.891],'YDP-04-01':[37.517,126.917],'YDP-04-02':[37.513,126.926],'GUR-02-01':[37.493,126.895],'GUR-02-02':[37.485,126.902],'YDP-05-01':[37.526,126.921],'YDP-05-02':[37.532,126.914],'YCN-01-01':[37.525,126.886],'YCN-01-02':[37.524,126.875],'GJ-01-01':[37.557,127.079],'GJ-01-02':[37.548,127.075],'X-INN':[37.510,126.897]};
export function travelPoint(w,id){
 const p=w.places.find(p=>p.id===id);if(!p)return null;
 if(p.travelPoint)return validateTravelPoint(p.travelPoint);
 if(w.id!=='hoemun'||w.travelModel?.profile!=='hoemun-2000-v1')return null;
 let xy=landmarks[id];
 if(!xy){const m=id.match(/^(.+)-(\d{2})$/),a=m&&anchors[m[1]],n=m&&Number(m[2]);if(!a||n<1||n>6)return null;xy=[a[0]+(n-1)*0.0007,a[1]+(n%2?1:-1)*(n-1)*0.0005];}
 return {lat:xy[0],lon:xy[1],bus:true,subway:true};
}
export function distanceKm(a,b){
 const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function automaticTravelQuote(w,from,to,mode,clock){
 if(!w.travelModel?.enabled||!['walk','bus','subway','taxi','car'].includes(mode))return null;
 const a=travelPoint(w,from),b=travelPoint(w,to);if(!a||!b)return null;
 if(mode==='bus'&&(!a.bus||!b.bus)||mode==='subway'&&(!a.subway||!b.subway))return null;
 if(from===to)return {minutes:0,won:0,path:[from],mode,estimated:true,distanceKm:0};
 const s={...travelDefaults,...w.travelModel.settings},km=Math.max(0.1,distanceKm(a,b)*s.roadFactor);
 const hour=Number((clock?.time||'12:00').slice(0,2)),peak=(hour>=7&&hour<10)||(hour>=17&&hour<20),night=hour<4;
 const isOpen=(open,close)=>open===close||open<close?open===close||hour>=open&&hour<close:hour>=open||hour<close;
 if(mode==='bus'&&!isOpen(s.busOpen,s.busClose)||mode==='subway'&&!isOpen(s.railOpen,s.railClose))return null;
 let minutes,won=0;
 if(mode==='walk')minutes=km/s.walkKph*60;
 if(mode==='bus'){minutes=s.accessMinutes+s.busWait+km/s.busKph*60*(peak?s.peakFactor:1);won=s.busFare;}
 if(mode==='subway'){minutes=s.accessMinutes+s.railWait+km/s.railKph*60;won=s.railFare+Math.ceil(Math.max(0,km-s.railBaseKm)/s.railStepKm)*s.railStepWon;}
 if(mode==='taxi'||mode==='car'){
  minutes=(mode==='taxi'?3:5)+km/s.roadKph*60*(peak?s.peakFactor:1);
  won=mode==='taxi'?(s.taxiBase+Math.ceil(Math.max(0,km-s.taxiBaseKm)*1000/s.taxiStepMeters)*s.taxiStepWon)*(night?s.nightFactor:1):km*s.carWonPerKm+s.parkingWon;
 }
 return {minutes:Math.max(1,Math.ceil(minutes)),won:Math.ceil(won/100)*100,path:[from,to],mode,estimated:true,distanceKm:Math.round(km*100)/100,peak,breakdown:mode==='car'?'추정 연료비·주차비':mode==='bus'?'1회 승차 · 환승은 별도':mode==='subway'?'접근·대기 포함 · 구간요금은 게임용 근사':mode==='taxi'?'추정 거리요금 · 저속 시간요금 제외':'도로 우회 추정'};
}
