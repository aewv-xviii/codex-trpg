import {validatePack,routeQuote,travelModes,departureTime} from './pack-format.js';
import {canControl,partyCharacters} from './character-control.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>n.toLocaleString('ko-KR')+'원';
let ctx;
export const bindContentPacks=context=>{ctx=context;};
export function contentCalendar(context,date,renderEvents=()=>''){
 ctx=context;const r=ctx.room,c=r.chronicle,owner=r.owner===ctx.me.id;
 const cases=c.cases.filter(x=>x.contentRef&&x.visibility==='public'&&c.events.some(e=>e.caseId===x.id&&e.visibility==='public'&&e.kind!=='deadline'&&e.date<=date));
 if(!cases.length)return '';
 return '<section class="prepared-calendar">'+cases.map(x=>{
  const p=r.contentPacks.find(p=>p.id===x.contentRef.packId),region=p?.regions.find(v=>v.id===x.contentRef.regionId),active=x.id===c.activeCaseId,past=date<c.clock?.date;
  const maps=active?r.maps.filter(m=>m.contentRef?.packId===p.id&&x.contentRef.mapIds?.includes(m.contentRef.mapId)):[];
  return `<article class="prepared-case ${active?'active':''}"><div class="prepared-label"><span>${esc(region?.title)}</span><span>${active?'진행 중':x.status!=='open'?'종결':past?'기록':x.opened?'이어하기':'출발 가능'}</span></div><h3>${esc(x.title)}</h3>${x.summary?`<p>${esc(x.summary)}</p>`:''}${active?`<div class="local-destinations">${maps.map(m=>`<button data-pack-map="${m.id}" ${m.id===r.mapId?'aria-current="location" disabled':!owner?'disabled':''}><b>${esc(m.title)}</b><small>${m.id===r.mapId?'현재 위치':m.entryMinutes+'분'}</small></button>`).join('')}</div><div class="entry-actions"><button class="primary" data-pack-scene>플레이 계속</button>${owner?'<button data-pack-pause>케이스 나가기</button>':''}</div>`:owner&&x.status==='open'&&!past?`<button class="primary" data-pack-trip="${x.id}" data-pack-date="${esc(date)}" ${c.activeCaseId?'disabled':''}>${x.opened?'이동 · 이어하기':'이동 · 시작'}</button>`:''}${renderEvents(x.id)}</article>`;
 }).join('')+'</section>';
}
function routeDiagram(pack,quote,from,to){
 const byId=new Map(pack.regions.map(r=>[r.id,r])),point=r=>[40+r.x*420,35+r.y*180];
 return `<svg class="journey-diagram" viewBox="0 0 500 250" role="img" aria-label="선택한 케이스의 지역 이동 경로">${pack.routes.map(e=>{const a=point(byId.get(e.from)),b=point(byId.get(e.to)),on=quote?.path.some((id,i)=>i&&[id,quote.path[i-1]].includes(e.from)&&[id,quote.path[i-1]].includes(e.to));return `<line class="${on?'selected':''}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;}).join('')}${pack.regions.map(r=>{const [x,y]=point(r);return `<g class="${r.id===to?'destination':r.id===from?'origin':''}"><circle cx="${x}" cy="${y}" r="7"/><text x="${x}" y="${y+23}" text-anchor="middle">${esc(r.title)}</text></g>`;}).join('')}</svg>`;
}
function trip(id,date){
 const r=ctx.room,entry=r.chronicle.cases.find(c=>c.id===id),p=r.contentPacks.find(p=>p.id===entry?.contentRef.packId);if(!p)return;
 const from=r.journey?.regionId,to=entry.contentRef.regionId,party=partyCharacters(r),payers=party.filter(a=>canControl(a,ctx.me)&&a.assets?.confirmed),clock=r.chronicle.clock;
 const choices=Object.entries(travelModes).map(([mode,label])=>({mode,label,quote:routeQuote(p,from,to,mode,party.length)})).filter(x=>x.quote);
 const earliest=r.chronicle.events.filter(e=>e.caseId===id&&e.visibility==='public'&&e.kind!=='deadline'&&e.status==='scheduled'&&e.date<=date).map(e=>e.date+'T'+e.time).sort()[0];
 if(!earliest){ctx.toast('이 날짜에 진행할 케이스이 없습니다.');return;}
 const label=ms=>new Date(ms).toISOString().slice(5,16).replace('T',' · ');
 ctx.modal(entry.title,`<form id="pack-trip" class="form-stack"><p class="journey-heading">${esc(p.regions.find(x=>x.id===from)?.title||'현재 위치')} <span>→</span> ${esc(p.regions.find(x=>x.id===to)?.title)}</p><div id="pack-route"></div><label>이동수단<select name="mode">${choices.map(x=>`<option value="${x.mode}">${x.label} · ${x.quote.minutes}분 · ${won(x.quote.won)}</option>`).join('')}</select></label><label>교통비를 낼 캐릭터<select name="payer">${payers.map(a=>`<option value="${a.id}">${esc(a.name)} · ${won(a.assets.won)}</option>`).join('')}</select></label><div id="pack-estimate" class="trip-estimate" role="status"></div><p class="fine">선택한 케이스의 대기·이동 시간을 반영하고 현지 장면을 엽니다.</p><button class="primary" type="submit">출발</button></form>`,()=>{
  const form=document.getElementById('pack-trip'),mode=form.elements.mode,payer=form.elements.payer,submit=form.querySelector('button.primary');
  const update=()=>{const q=choices.find(x=>x.mode===mode.value)?.quote,a=payers.find(a=>a.id===payer.value),departure=departureTime(p,r.chronicle,id,date,q?.minutes||0);document.getElementById('pack-route').innerHTML=routeDiagram(p,q,from,to);document.getElementById('pack-estimate').innerHTML=q?`<div><small>출발</small><b>${label(departure)}</b></div><span>→</span><div><small>도착</small><b>${label(departure+q.minutes*60000)}</b></div><strong>${won(q.won)}</strong>`:'이동 가능한 경로 없음';submit.disabled=!q||!a||a.assets.won<q.won||!r.economy?.enabled||party.some(a=>!a.assets?.confirmed);if(!a||!r.economy?.enabled||party.some(a=>!a.assets?.confirmed))document.getElementById('pack-estimate').insertAdjacentHTML('beforeend','<p>상점 · 소지품에서 파티의 시작 자산을 먼저 확정하세요.</p>');};
  mode.onchange=payer.onchange=update;update();
  form.onsubmit=async e=>{e.preventDefault();const q=choices.find(x=>x.mode===mode.value)?.quote;if(!q)return;submit.disabled=true;const result=await ctx.command('enterContentCase',{caseId:id,date,mode:mode.value,characterId:payer.value,expectedMinutes:q.minutes,expectedWon:q.won});if(result){ctx.closeModal();ctx.openScene();}else update();};
 });
}
export function importContentPack(context){
 const scope=context||ctx;
 scope.modal('케이스 불러오기',`<form id="pack-import" class="form-stack"><label class="setup-file-picker">.nightpack.json 파일<input type="file" name="file" accept=".json,application/json" required></label><div id="pack-preview" role="status">미리 준비한 지도·인물·케이스를 달력에 등록합니다.</div><label>배치 기준일<input name="baseDate" type="date" required></label><p class="fine">새 이미지를 생성하거나 AI를 호출하지 않습니다. 같은 패키지는 중복 등록하지 않습니다.</p><button class="primary" disabled>달력에 등록</button></form>`,()=>{
  const form=document.getElementById('pack-import'),status=document.getElementById('pack-preview'),submit=form.querySelector('button.primary');let pack,sequence=0;
  form.elements.file.onchange=async()=>{
   const current=++sequence;pack=null;submit.disabled=true;const file=form.elements.file.files[0];if(!file)return;
   try{if(file.size>3400000)throw Error('준비 파일은 3.4MB 이하로 묶어주세요.');const value=validatePack(JSON.parse(await file.text()));if(current!==sequence)return;
    const images=Object.values(value.assets);if(images.some(v=>!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v)))throw Error('이미지 파일이 포함된 완성 패키지를 선택하세요.');
    if(images.reduce((n,v)=>n+v.length,0)>2200000)throw Error('포함 이미지 합계는 2.2MB 이하로 준비하세요.');
    pack=value;form.elements.baseDate.value=scope.room.chronicle.clock?.date||value.startDate;status.innerHTML=`<h3>${esc(value.title)}</h3><p>${esc(value.summary)}</p><div class="pack-counts"><span>케이스 ${value.cases.length}</span><span>장소 ${value.maps.length}</span><span>인물 ${value.actors.length}</span><span>이미지 ${images.length}</span></div><small>${esc(value.canonStatus)} · ${value.actors.filter(a=>!a.reviewed||!a.profile).length}명 전투 수치 검토 필요</small>`;submit.disabled=false;
   }catch(error){status.textContent=error.message;}
  };
  form.onsubmit=async e=>{
   e.preventDefault();if(!pack||submit.disabled)return;submit.disabled=true;form.elements.file.disabled=true;const baseDate=form.elements.baseDate.value;form.elements.baseDate.disabled=true;
   try{const installed=structuredClone(pack),assets=Object.entries(pack.assets);for(const [i,[key,data]] of assets.entries()){status.textContent=`이미지 등록 ${i+1} / ${assets.length}`;const result=await scope.command('uploadPackAsset',{image:data});if(!result)throw Error('이미지 등록이 중단됐습니다. 다시 등록하면 같은 이미지는 재사용합니다.');installed.assets[key]=result.result.assetId;}
    status.textContent='케이스·날짜 연결 중…';const result=await scope.command('installContentPack',{pack:installed,baseDate});if(!result)throw Error('등록하지 못했습니다. 오류 알림을 확인하세요.');scope.closeModal();scope.toast('달력에 등록했습니다.');scope.onComplete?.();
   }catch(error){status.textContent=error.message;submit.disabled=false;form.elements.file.disabled=false;form.elements.baseDate.disabled=false;}
  };
 });
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||!ctx?.room)return;
 if(b.hasAttribute('data-pack-import'))importContentPack();
 if(b.dataset.packTrip)trip(b.dataset.packTrip,b.dataset.packDate);
 if(b.hasAttribute('data-pack-scene'))ctx.openScene();
 if(b.hasAttribute('data-pack-pause'))ctx.command('pauseContentCase');
 if(b.dataset.packMap)ctx.command('enterLocalMap',{mapId:b.dataset.packMap}).then(result=>{if(result)ctx.openScene();});
});
