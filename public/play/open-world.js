import {carriedLoad,burdenNames} from './carrying.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ctx,bagSelection="";
const input=(name,label,type='text',value='')=>`<label>${label}<input name="${name}" type="${type}" step="any" value="${esc(value)}" required></label>`;
const select=(name,label,items)=>`<label>${label}<select name="${name}">${items.map(([id,label])=>`<option value="${esc(id)}">${esc(label)}</option>`).join('')}</select></label>`;
export function openWorldPanel(context){
 ctx=context;const r=ctx.room,c=r.chronicle,host=r.owner===ctx.me.id,active=c.cases.find(x=>x.id===c.activeCaseId);
 return `<section class="entry"><h3>${active?'진행 중 · '+esc(active.title):'자유행동'}</h3><p>이동·대화·쇼핑·휴식은 평소처럼 선언하세요. 임무 중단은 완료나 보상 정산이 아닙니다.</p><div class="entry-actions">${host&&active?'<button data-world-plan="free">임무 중단 · 자유행동</button>':''}<button data-world-plan="history">자유행동 기록</button>${host?c.cases.filter(x=>x.pausedAt&&x.status==='open'&&x.visibility==='public').map(x=>`<button data-world-plan="resume" data-id="${esc(x.id)}">${esc(x.title)} 재개</button>`).join(''):''}</div><details><summary>세력 관계</summary>${(r.factions||[]).map(f=>`<p><b>${esc(f.name)}</b> · ${f.score}</p>`).join('')||'<p>등록된 세력이 없습니다.</p>'}${host?'<div class="entry-actions"><button data-world-plan="faction">세력 등록</button><button data-world-plan="reputation">신뢰도 변경</button><button data-world-plan="access">접근 조건 설정</button></div>':''}</details></section>`;
}
export function loadPanel(context,c){
 ctx=context;const l=carriedLoad(c,ctx.room.economy.items),host=ctx.room.owner===ctx.me.id;
 return `<section class="load-summary"><div><strong>${l.kg.toFixed(2)} kg${l.unknown.length?' + 미확정':''}</strong><span>${l.complete?l.overloaded?'일반 운반 한도 초과 · GM 재정 필요':burdenNames[l.level]+' · 이동 '+c.combatProfile.move+' · 회피 '+c.combatProfile.dodge:'하중 계산 준비 중'}</span></div>${l.basicLiftKg?`<progress aria-label="운반 하중" max="${l.basicLiftKg*10}" value="${l.kg}"></progress>`:''}${l.unknown.length?`<details><summary>무게 미확정 ${l.unknown.length}종</summary><p>${l.unknown.map(esc).join(' · ')}</p></details>`:''}${host?`<button data-world-plan="carrying" data-character="${esc(c.id)}">하중 기준</button><button data-world-plan="physical">물품 규격</button>`:''}</section>`;
}
export function containerPanel(context,c){
 ctx=context;const r=ctx.room,bags=c.assets?.containers||[],items=r.economy.items;
 const chosen=bags.find(b=>b.id===bagSelection)||bags[0];bagSelection=chosen?.id||'';
 const contents=b=>Object.entries(b.items).map(([id,q])=>({item:items.find(i=>i.id===id),id,q}));
 const totals=b=>contents(b).reduce((s,{item,q})=>({liters:s.liters+(item?.physical?.volumeL||0)*q,kg:s.kg+(item?.physical?.weightKg||0)*q}),{liters:0,kg:0});
 const t=chosen?totals(chosen):null;
 return `<div class="inventory-browser bag-browser"><section class="inventory-list-pane"><div class="inventory-list" aria-label="보유 가방">${bags.map(b=>`<button class="inventory-row" data-bag-select="${esc(b.id)}" aria-current="${b.id===bagSelection}"><span><strong>${esc(b.name)}</strong><small>${totals(b).liters.toFixed(1)} / ${b.capacityL} L</small></span><b>${contents(b).reduce((n,x)=>n+x.q,0)}개</b></button>`).join('')||'<p class="inventory-empty">연결된 가방이 없습니다.</p>'}</div><button data-world-plan="bag" data-character="${esc(c.id)}">보유 가방 연결</button></section><section class="inventory-detail"><h3>${esc(chosen?.name||'가방 수납')}</h3>${chosen?`<div class="bag-capacity"><span>${t.liters.toFixed(2)} / ${chosen.capacityL} L</span><progress max="${chosen.capacityL}" value="${t.liters}" aria-label="가방 사용 용량"></progress><small>내용물 ${t.kg.toFixed(2)} / ${chosen.maxContentsKg} kg · 최대 길이 ${chosen.maxLengthCm} cm</small></div><div class="bag-contents">${contents(chosen).map(({item,id,q})=>`<div><span>${esc(item?.name||id)}</span><b>×${q}</b><button data-world-plan="unpack" data-character="${esc(c.id)}" data-id="${esc(chosen.id)}" data-item="${esc(id)}">꺼내기</button></div>`).join('')||'<p class="inventory-empty">비어 있습니다.</p>'}</div><div class="inventory-actions"><button data-world-plan="pack" data-character="${esc(c.id)}" data-id="${esc(chosen.id)}">물품 넣기 · 수량 변경</button><button data-world-plan="remove-bag" data-character="${esc(c.id)}" data-id="${esc(chosen.id)}" ${Object.keys(chosen.items).length?'disabled':''}>빈 가방 연결 해제</button></div>`:'<p>보유 물품에 가방 규격을 등록한 뒤 연결하세요.</p>'}<p class="inventory-hint">가방 안 물품도 전체 하중에 포함됩니다. 소비·전달 전 꺼내세요. 개별 탄창·장착 무기는 휴대품에서 관리합니다.</p></section></div>${r.owner===ctx.me.id?'<div class="entry-actions"><button data-world-plan="physical">물품·가방 규격</button><button data-world-plan="food">음식 설정</button></div>':''}`;
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-bag-select]');if(b&&ctx){bagSelection=b.dataset.bagSelect;ctx.render();}});
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-world-plan]');if(!b||b.disabled||!ctx)return;
 const r=ctx.room,action=b.dataset.worldPlan,characterId=b.dataset.character;
 const form=(title,html,op,convert=p=>p)=>ctx.formDialog(title,html,p=>ctx.command(op,convert(p)));
 const factions=(r.factions||[]).map(f=>[f.id,f.name]),items=r.economy.items.map(i=>[i.id,i.name]);
 if(action==='free')return ctx.command('beginFreePlay',{});
 if(action==='resume')return ctx.command('resumeCase',{id:b.dataset.id});
 if(action==='history'){
  const groups=new Map();for(const m of r.messages.filter(m=>m.playMode==='free'&&m.type!=='whisper'&&m.channel!=='admin')){const key=[m.gameClock?.date||'날짜 미정',m.sceneTitle||'장소 미기록'].join(' · ');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
  return ctx.modal('자유행동 기록',[...groups].map(([key,ms])=>`<details><summary>${esc(key)} · ${ms.length}건</summary>${ms.map(m=>`<p><b>${esc(m.name)}</b> ${esc(m.text)}</p>`).join('')}</details>`).join('')||'<p>새 자유행동 기록이 없습니다. 이전 미분류 기록은 전체 기록에서 확인하세요.</p>');
 }
 if(action==='faction')return form('세력 등록',input('name','세력 이름')+input('description','설명'),'configureFaction');
 if(action==='reputation')return form('일행 신뢰도 변경',select('id','세력',factions)+input('delta','변화량','number')+input('reason','사건·인지 근거')+input('eventKey','사건 식별자 · 같은 사건에 같은 값'),'adjustFaction',p=>({...p,delta:Number(p.delta)}));
 if(action==='access'){
  const targets=[...r.chronicle.cases.map(c=>[JSON.stringify({kind:'case',id:c.id}),'임무 · '+c.title]),...r.economy.shops.flatMap(s=>s.offers.map(o=>[JSON.stringify({kind:'offer',id:s.id,itemId:o.itemId}),s.name+' · '+r.economy.items.find(i=>i.id===o.itemId)?.name]))];
  return form('접근 조건 설정',select('target','대상',targets)+select('factionId','세력',factions)+input('minimum','최소 신뢰도','number','0')+'<label><input type="checkbox" name="clear">조건 제거</label><p>선택한 대상의 기존 조건을 교체합니다.</p>','setFactionAccess',p=>{return {...JSON.parse(p.target),requirements:p.clear==='on'?[]:[{factionId:p.factionId,minimum:Number(p.minimum)}]};});
 }
 if(action==='carrying'){const c=r.characters.find(c=>c.id===characterId),v=c.carrying||{};return form('하중 기준 확인',input('basicLiftKg','기본 들기 BL (kg)','number',v.basicLiftKg||'')+input('basicMove','무부담 기본 이동','number',v.basicMove||c.combatProfile?.move||'')+input('basicDodge','무부담 회피','number',v.basicDodge||c.combatProfile?.dodge||'')+input('extraKg','목록에 없는 착용품·기타 무게 kg','number',v.extraKg||0)+'<p>시트의 BL과 무부담 수치를 확인하세요. 목록의 무게가 모두 확정되면 이동·회피·부담 단계를 자동 적용합니다. 방어구·옷도 누락 없이 등록하거나 기타 무게에 포함하세요.</p>','configureCarrying',p=>({...Object.fromEntries(Object.entries(p).map(([k,v])=>[k,Number(v)])),characterId}));}
 if(action==='unpack')return ctx.command('packItem',{characterId,containerId:b.dataset.id,itemId:b.dataset.item,quantity:0});
 if(action==='food')return form('음식 설정',select('itemId','소모품',items.filter(([id])=>r.economy.items.find(i=>i.id===id)?.kind==='consumable'))+input('minutes','섭취 시간(분)','number','10')+'<p>즉시 FP 회복이나 버프는 부여하지 않습니다. 휴식은 별도로 진행합니다.</p>','configureFood',p=>({...p,minutes:Number(p.minutes)}));
 if(action==='eat')return ctx.command('inventoryAction',{characterId,verb:'eat',itemId:b.dataset.id,quantity:1});
 if(action==='physical')return form('확인된 물품 규격',select('itemId','물품',items)+input('weightKg','개당 무게 kg','number')+input('volumeL','개당 부피 L','number')+input('lengthCm','길이 cm','number')+'<label><input type="checkbox" name="container">가방으로 사용</label>'+input('capacityL','가방 용량 L','number','1')+input('maxContentsKg','가방 내용물 한도 kg','number','1')+input('maxLengthCm','수납 가능한 길이 cm','number','1'),'configureItemPhysical',p=>({...p,container:p.container==='on',...Object.fromEntries(['weightKg','volumeL','lengthCm','capacityL','maxContentsKg','maxLengthCm'].map(k=>[k,Number(p[k])]))}));
 const c=r.characters.find(c=>c.id===characterId);
 if(action==='bag')return form('보유 가방 연결',select('itemId','가방',items.filter(([id])=>c.assets.items[id]&&r.economy.items.find(i=>i.id===id)?.physical?.container)),'addContainer',p=>({...p,characterId}));
 if(action==='pack')return form('수납 수량 변경',select('itemId','물품',items.filter(([id])=>c.assets.items[id]&&r.economy.items.find(i=>i.id===id)?.physical&&!r.economy.items.find(i=>i.id===id)?.physical?.container))+input('quantity','이 가방에 넣을 총수량 · 0이면 전부 꺼냄','number','0'),'packItem',p=>({...p,quantity:Number(p.quantity),characterId,containerId:b.dataset.id}));
 if(action==='remove-bag')return ctx.command('removeContainer',{characterId,containerId:b.dataset.id});
});
