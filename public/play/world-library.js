import {vehicleQuote} from './vehicle-state.js';
import {travelActorIds} from './travel-party.js';
import {travelDefaults,travelPoint} from './travel-model.js';
import {travelModes} from './pack-format.js';
import {placeLabel,validateWorld,worldRoute,worldId,worldTravelQuote} from './world-format.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ctx,region='';
export const bindWorld=c=>{ctx=c;};
export function worldPage(c){
 ctx=c;const r=c.room;if(!r)return '<p>테이블을 선택하세요.</p>';
 const w=r.worldLibrary,host=r.owner===c.me.id;
 const upload=host?'<label class="world-upload">세계 자료 불러오기<input id="world-file" type="file" accept=".json,.nightworld.json" hidden></label>':'';
 if(!w)return `<section class="section-page world-page"><h2>어디로 갈까</h2><p>준비된 장소와 인물을 불러와 대화를 시작하세요.</p>${upload}<p class="fine">개인 Codex에서 만든 .nightworld.json 파일을 선택하세요.</p></section>`;
 const d=w.definition,current=d.places.find(p=>p.id===w.placeId),regions=[...new Set(d.places.map(p=>p.region))];
 if(!regions.includes(region))region=current.region;
 const shops=r.economy.shops.filter(s=>s.worldLibraryId===d.id&&s.placeId===current.id);
 return `<section class="section-page world-page"><header><small>${esc(r.chronicle.clock?.date)} · ${esc(r.chronicle.clock?.time)}</small><h2>${esc(placeLabel(current.name))}</h2><p>${esc(current.description)}</p><small>${esc(current.hours)}</small></header><div class="world-people">${w.vehicleServices?.[current.id]?'<button data-page="vehicles">차량 서비스</button>':''}${current.npcIds.map(id=>{const n=d.people.find(n=>n.id===id);return `<button data-world-talk="${esc(worldId(d.id,id))}">${esc(n?.name)} · 대화</button>`;}).join('')}${shops.map(s=>`<button data-world-shop="${esc(s.id)}">상품 보기</button>`).join('')}</div><label class="world-region">지역<select id="world-region">${regions.map(x=>`<option ${x===region?'selected':''}>${esc(x)}</option>`).join('')}</select></label><div class="world-places">${d.places.filter(p=>p.region===region).map(p=>{const minutes=worldRoute(d,w.placeId,p.id),here=p.id===w.placeId,gather=here&&r.partyCharacterIds.some(id=>(w.characterPlaces?.[id]||w.placeId)!==p.id);return `<article class="world-place ${here?'current':''}"><h3>${esc(placeLabel(p.name))}</h3><p>${esc(p.description)}</p><button data-world-place="${esc(p.id)}" ${here&&!gather?'disabled':''}>${gather?'파티 합류':here?'현재 위치':'이동 수단'}</button></article>`;}).join('')}</div>${host?`<details><summary>자료 관리</summary>${upload}<button data-world-model>자동 이동 계산</button><button data-world-point>장소 기준점</button><button data-world-vehicle="">차량 등록</button>${(w.vehicles||[]).map(v=>`<button data-world-vehicle="${esc(v.id)}">${esc(v.name)} · ${esc(r.characters.find(c=>c.id===v.characterId)?.name)} · ${esc(placeLabel(d.places.find(p=>p.id===v.placeId)?.name||v.placeId))}</button>`).join('')}<button data-world-route>기존 경로 설정</button><p class="fine">다시 불러와도 현재 위치·소지금·재고는 유지됩니다.</p></details>`:''}</section>`;
}
document.addEventListener('change',async e=>{
 if(e.target.id==='world-region'){region=e.target.value;ctx.render();}
 if(e.target.id!=='world-file'||!e.target.files[0])return;
 try{
  const file=e.target.files[0];if(file.size>900000)throw Error('자료는 900KB 이하로 준비하세요.');
  const bundle=validateWorld(JSON.parse(await file.text())),old=ctx.room.worldLibrary;
  ctx.modal(old?'세계 자료 갱신':'세계 자료로 시작',`<form id="world-install"><p>${esc(bundle.title)} · 장소 ${bundle.places.length}곳</p>${!old?`${bundle.openingCase&&!ctx.room.chronicle.activeCaseId?`<label><input type="checkbox" name="startCase" checked> ${esc(bundle.openingCase.title)} 케이스 시작</label>`:''}<label>시작 장소<select name="place">${bundle.places.map(p=>`<option value="${p.id}">${esc(placeLabel(p.name))}</option>`).join('')}</select></label>${!ctx.room.chronicle.clock?'<label>날짜<input name="date" type="date" value="2002-11-04" required></label><label>시각<input name="time" type="time" value="17:00" required></label>':''}<label><input type="checkbox" name="adopt" required> 자료의 제안 가격·초기 재고 사용</label>`:'<p>기존 자산과 상점 재고·가격은 유지합니다.</p>'}<button class="primary">${old?'갱신':'등록하고 시작'}</button></form>`,()=>{document.getElementById('world-install').onsubmit=async event=>{event.preventDefault();const f=new FormData(event.currentTarget);if(await ctx.command('installWorldLibrary',{bundle,startPlaceId:f.get('place'),startDate:f.get('date'),startTime:f.get('time'),adoptEconomy:f.get('adopt')==='on',startCase:f.get('startCase')==='on'})){ctx.closeModal();ctx.openScene();}};});
 }catch(err){ctx.toast(err.message);}
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-world-place],[data-world-talk],[data-world-shop],[data-world-route],[data-world-model],[data-world-point],[data-world-vehicle]');if(!b||!ctx?.room?.worldLibrary)return;

 const w0=ctx.room.worldLibrary,d0=w0.definition;
 if(b.hasAttribute('data-world-model')){
  const model=d0.travelModel||{enabled:false,profile:d0.id==='hoemun'?'hoemun-2000-v1':'coordinates',settings:{}};
  return ctx.formDialog('자동 이동 계산',`<p>현재 출발지와 도착지의 좌표로 매번 계산합니다. 실제 길찾기·시간표가 아닌 게임용 추정입니다. 버스·지하철은 기본 05~24시 운행으로 가정합니다. 좌표가 있으면 자동 계산, 없으면 등록된 경로를 사용합니다.</p><label><input type="checkbox" name="enabled" ${model.enabled?'checked':''}> 자동 계산 사용</label><label>프로필<select name="profile"><option value="hoemun-2000-v1" ${model.profile==='hoemun-2000-v1'?'selected':''}>회문동 · 2000년 게임 설정</option><option value="coordinates" ${model.profile==='coordinates'?'selected':''}>직접 등록한 좌표</option></select></label><details><summary>속도·대기·요금 설정</summary><p>버스 1회 600원, 지하철 기본 600원, 택시 2km 1,300원. 철도 거리 가산·야간 계수·연료비·주차비는 게임용 가정입니다. 자동으로 시대별 요금이 바뀌지는 않습니다.</p><label>계산 설정 JSON<textarea name="settings" rows="12">${esc(JSON.stringify({...travelDefaults,...model.settings},null,2))}</textarea></label></details>`,p=>{let settings;try{settings=JSON.parse(p.settings);}catch{ctx.toast('계산 설정 JSON 형식을 확인하세요.');return null;}return ctx.command('configureWorldTravel',{enabled:p.enabled==='on',profile:p.profile,settings});});
 }
 if(b.hasAttribute('data-world-point')){
  const point=travelPoint(d0,w0.placeId);
  return ctx.formDialog('현재 장소 기준점',`<p>${esc(placeLabel(d0.places.find(p=>p.id===w0.placeId)?.name))} · 회문동 내부는 가상 배치, 실제 지명도 대표 위치의 근사값입니다.</p><label>위도<input type="number" name="lat" step="any" min="33" max="39" value="${point?.lat??''}" required></label><label>경도<input type="number" name="lon" step="any" min="124" max="132" value="${point?.lon??''}" required></label><label><input type="checkbox" name="bus" ${point?.bus!==false?'checked':''}> 버스 접근 가능</label><label><input type="checkbox" name="subway" ${point?.subway!==false?'checked':''}> 지하철 접근 가능</label>`,p=>ctx.command('setWorldTravelPoint',{placeId:w0.placeId,lat:Number(p.lat),lon:Number(p.lon),bus:p.bus==='on',subway:p.subway==='on'}));
 }
 if(b.hasAttribute('data-world-vehicle')){
  const v=(w0.vehicles||[]).find(v=>v.id===b.dataset.worldVehicle);
  return ctx.formDialog('보유 차량',`<p>구매 버튼이 아닌 GM의 확정된 보유 기록입니다. 등록된 소유자만 현재 주차 위치에서 자차로 이동할 수 있습니다.</p><label>차량 이름<input name="name" value="${esc(v?.name||'')}" required maxlength="80"></label><label>소유 캐릭터<select name="characterId">${ctx.room.characters.map(c=>`<option value="${esc(c.id)}" ${c.id===v?.characterId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>주차 위치<select name="placeId">${d0.places.map(p=>`<option value="${esc(p.id)}" ${p.id===(v?.placeId||w0.placeId)?'selected':''}>${esc(placeLabel(p.name))}</option>`).join('')}</select></label><label><input type="checkbox" name="available" ${v?.available?'checked':''}> 사용 가능한 차량</label>`,p=>ctx.command('setWorldVehicle',{...p,id:v?.id,available:p.available==='on'}));
 }
 if(b.hasAttribute('data-world-route')){
  const w=ctx.room.worldLibrary,d=w.definition;
  return ctx.formDialog('이동 시간·요금',`<p>게임 설정값 · 등록 경로의 총요금 · 이동을 시작한 캐릭터가 납부</p><label>출발<select name="from">${d.places.map(p=>`<option value="${esc(p.id)}" ${p.id===w.placeId?'selected':''}>${esc(placeLabel(p.name))}</option>`).join('')}</select></label><label>도착<select name="to">${d.places.map(p=>`<option value="${esc(p.id)}">${esc(placeLabel(p.name))}</option>`).join('')}</select></label><label>이동수단<select name="mode"><option value="walk">도보</option><option value="bus">버스</option><option value="subway">지하철</option><option value="taxi">택시</option><option value="car">자차</option></select></label><label>소요 시간(분)<input type="number" name="minutes" min="1" max="1440" value="10" required></label><label>차량 경로 거리 km<input type="number" name="distanceKm" min="0.001" step="any"></label><label>비용(원 · 차량은 주차·통행료)<input type="number" name="won" min="0" max="10000000" value="0" required></label>`,p=>ctx.command('setWorldRoute',{...p,minutes:Number(p.minutes),won:Number(p.won),...(p.distanceKm?{distanceKm:Number(p.distanceKm)}:{})}));
 }
 if(b.dataset.worldTalk)return ctx.beginDialogue(b.dataset.worldTalk);
 if(b.dataset.worldShop){if(await ctx.command('browseWorldShop',{shopId:b.dataset.worldShop}))ctx.openEconomy(b.dataset.worldShop);return;}
 const w=ctx.room.worldLibrary,id=b.dataset.worldPlace;
 const character=ctx.activeCharacter();if(!character)return ctx.toast('하단에서 캐릭터를 선택하세요.');
 const from=w.characterPlaces?.[character.id]||w.placeId,target=w.definition.places.find(p=>p.id===id);
 const count=travelActorIds(ctx.room,{actorId:character.id}).length;
 const vehicle=(w.vehicles||[]).filter(v=>v.characterId===character.id&&v.available&&v.placeId===from&&!v.packId).sort((a,b)=>Number(!!b.selected)-Number(!!a.selected))[0];
 const quoteFor=(mode,n)=>{const q=worldTravelQuote(w.definition,from,id,mode,ctx.room.chronicle.clock,n);try{return mode==='car'?vehicleQuote(vehicle,q,w.definition,n):q;}catch{return null;}};
 const modes=Object.entries(travelModes).map(([mode,label])=>({mode,label,quote:quoteFor(mode,count),solo:quoteFor(mode,1),car:mode!=='car'||(w.vehicles||[]).some(v=>v.characterId===character.id&&v.available&&v.placeId===from&&!v.packId)}));
 let first=true;
 ctx.modal(placeLabel(target.name)+' 이동',`<form id="world-travel-options" class="form-stack"><p>${esc(placeLabel(w.definition.places.find(p=>p.id===from)?.name))} → ${esc(placeLabel(target.name))}</p><label>이동 대상<select name="travelScope"><option value="party">파티원 전원 (${count}명)</option><option value="solo">선택한 캐릭터 혼자</option></select></label><p class="fine">파티 이동은 떨어져 있는 파티원도 목적지에 합류합니다. 표시된 총요금은 ${esc(character.name)}의 소지금에서 한 번 차감합니다.</p>${modes.map(({mode,label,quote,car})=>{const ready=quote&&car,checked=ready&&first;if(checked)first=false;return `<label class="check-label"><input type="radio" name="mode" value="${mode}" ${ready?'':'disabled'} ${checked?'checked':''} required> ${label} · <span data-travel-price="${mode}">${!car?'출발지에 보유 차량 없음':quote?`${quote.minutes}분 · ${quote.won.toLocaleString('ko-KR')}원${quote.fuelLiters!==undefined?' · 연료 '+quote.fuelLiters.toFixed(3)+' L':''}`:'운행·연료·정원·거리 확인'}</span></label>`;}).join('')}<button class="primary" ${first?'disabled':''}>파티 이동</button></form>`,()=>{
  const form=document.getElementById('world-travel-options');
  form.elements.travelScope.onchange=()=>{const solo=form.elements.travelScope.value==='solo';form.querySelector('button').textContent=solo?'혼자 이동':'파티 이동';for(const item of modes){const q=solo?item.solo:item.quote;if(q&&item.car)form.querySelector('[data-travel-price="'+item.mode+'"]').textContent=q.minutes+'분 · '+q.won.toLocaleString('ko-KR')+'원'+(q.fuelLiters!==undefined?' · 연료 '+q.fuelLiters.toFixed(3)+' L':'');}};
  form.onsubmit=async e=>{e.preventDefault();const data=new FormData(form),mode=data.get('mode'),travelScope=data.get('travelScope');if(await ctx.command('message',{kind:'action',scope:'individual',travelScope,characterId:character.id,text:`${travelScope==='solo'?'혼자 ':''}${travelModes[mode]}로 ${placeLabel(target.name)}으로 간다`}))ctx.closeModal();};
 });
});


