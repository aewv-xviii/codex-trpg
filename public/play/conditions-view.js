const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scopes={'sense:vision':'시각 감각','sense:hearing':'청각 감각','sense:smell':'후각 감각','sense:touch':'촉각 감각','sense:taste':'미각 감각',attack:'명중',defense:'방어',vision:'시각 의존',hearing:'청각',smell:'후각',touch:'촉각',taste:'미각',concentration:'집중',observation:'관찰',approachDetection:'접근 감지'};
const paths={blood:'M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11Z',shock:'m13 2-8 12h6l-1 8 9-13h-7l1-7Z',prone:'M4 15h16M7 11h9l3 4M7 7h.01',stun:'m12 3 2 5 5-1-2 5 4 3-6 1-3 5-2-5-6-1 4-3-2-5 5 1 1-5Z',health:'M3 12h4l3-7 4 14 3-7h4',fatigue:'M7 4h10v16H7zM10 8h4m-4 4h4',sleep:'M7 5h10l-10 14h10',dead:'m5 5 14 14M19 5 5 19',drop:'m7 3 10 10-4 4L3 7zM16 17v4m3-6 3 2',injury:'m6 3 15 15-3 3L3 6zM9 6 6 9m9 3-3 3',buff:'m5 13 7-7 7 7M12 6v14',debuff:'m5 11 7 7 7-7M12 4v14'};
export function effectTime(e){if(e.key==='bleeding')return '지혈까지 · 다음 판정 '+(e.tickRemaining??60)+'초';if(e.remainingSeconds===undefined)return '지속';const s=e.remainingSeconds;return s>=60?Math.floor(s/60)+'분'+(s%60?' '+s%60+'초':''):s+'초';}
export function conditionEntries(c,state=c.combatState){
 const rows=[],add=(key,label,description,icon=key,kind='debuff')=>rows.push({key,label,description,icon,kind});
 if(c.activity&&['queued','paused'].includes(c.activity.status))add('activity',c.activity.label+' · '+(c.activity.status==='paused'?'중단':'진행 중'),`단계 ${c.activity.index+1}/${c.activity.steps.length} · ${c.activity.progress}/${c.activity.steps[c.activity.index]?.seconds||0}초 · ${c.activity.reason||''}`,'buff','buff');
 if(state?.wait)add('wait','Wait · 조건 대기',state.wait.reason,'buff','buff');
 if(c.offMapPosition)add('offmap','지도 밖 · '+c.offMapPosition.label+' · 약 '+c.offMapPosition.distanceYards+'yd','같은 장소의 주변 위치. 현장 접근 행동은 복귀 필요.','buff','buff');
 const status=({unconscious:['의식 없음','의식 회복까지 행동 불가','sleep'],dead:['사망','','dead'],dying:['치명상','처치 필요 · 생존 경과 판정','health'],withdrawn:['이탈','','drop']})[state?.status];if(status)add(state.status,...status);
 if(state?.stunned)add('stun','기절','행동 불가 · 능동방어 −4 · 회복 판정');
 if(state?.prone)add('prone','넘어짐','현재 누운 자세 · 일어나기 필요');
 if(state?.dropped)add('drop','무기 놓침','사용 가능한 무기 준비 필요');
 const shock=Math.max(state?.shock||0,state?.activeShock||0);if(shock)add('shock','충격 −'+shock,'DX·IQ 기반 행동 · 능동방어와 저항 판정 제외');
 if(c.hp<c.maxHp/3&&state?.status!=='dead')add('health','부상','이동력·회피 절반'+(c.hp<=0?' · 의식 유지 판정 필요':''));
 if(c.fp<c.maxFp/3&&state?.status!=='dead')add('fatigue','피로','이동력·회피 절반');
 for(const wound of Object.values(c.injuries||{}))add('injury:'+wound.location,wound.label+' '+(wound.destroyed?'파괴':'사용 불가'),({pending:'전투 후 회복 판정',temporary:'HP 완전 회복까지',lasting:wound.recoveryDate?wound.recoveryDate+'까지 회복':wound.months+'개월 회복 필요',permanent:'영구 손상'})[wound.recovery]||'치료 필요','injury');
 for(const e of c.effects||[])rows.push({...e,icon:e.key==='bleeding'?'blood':e.kind==='buff'?'buff':'debuff',time:effectTime(e),description:Object.entries(e.modifiers||{}).map(([k,v])=>(scopes[k]||k)+' '+(v>0?'+':'')+v).join(' · ')||e.description||(e.key==='bleeding'?'매 게임 1분 HT 판정 · 실패 시 HP 감소':'효과 지속 중')});
 return rows;
}
export function conditionLabels(c,state=c.combatState){return conditionEntries(c,state).map(e=>e.label+(e.time?' · '+e.time:''));}
export function conditionBadges(c,state=c.combatState,{limit=3,overflowLabel=null}={}){
 const rows=conditionEntries(c,state);if(!rows.length)return '';
 return `<span class="condition-badges" aria-label="${esc(rows.map(e=>e.label).join(', '))}">${rows.slice(0,limit).map(e=>`<span class="condition-badge ${e.kind==='buff'?'buff':'debuff'}" role="img" aria-label="${esc(e.label)}" title="${esc([e.label,e.time,e.description].filter(Boolean).join(' · '))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[e.icon]||paths.debuff}"/></svg></span>`).join('')}${rows.length>limit?`<span class="condition-badge condition-overflow" title="${esc(rows.slice(limit).map(e=>e.label).join(' · '))}" aria-label="추가 상태 ${rows.length-limit}개 · 시트에서 확인">${overflowLabel===null?'+'+(rows.length-limit):esc(overflowLabel)}</span>`:''}</span>`;
}
export function conditionDetails(c,state=c.combatState){
 const rows=conditionEntries(c,state);
 return `<section class="condition-details">${rows.map(e=>`<article class="condition-detail ${e.kind==='buff'?'buff':'debuff'}"><b>${esc(e.label)}</b><span>${esc(e.time||'')}</span><small>${esc(e.description)}</small>${e.source?`<small>${esc(e.source)}</small>`:''}</article>`).join('')||'<p class="sheet-prose">현재 적용된 상태 없음</p>'}${c.aquarium?.fish?.length?`<div aria-label="유영어 상태">${c.aquarium.fish.map(f=>`<p>${esc(f.name)} · HP ${f.hp}/${f.maxHp} · ${f.hp<=0?'파괴됨':f.suppression?'사이오닉 억제 '+f.suppression.remainingSeconds+'초':f.mission?.pause?'임무 중단 · '+esc(f.mission.pause.reason):f.reportReady?'귀환 신호 대기':f.mission?esc(({scout:'정찰 중',carryFish:'운반 중',recall:'귀환 중',moveFish:'이동 중'})[f.mission.kind]||'임무 수행 중'):f.blocked||f.lost?'보고 없음':'대기'}${f.cargo?' · 운반 물품 '+esc(f.cargo.name||f.cargo.itemId):''}</p>`).join('')}</div>`:''}</section>`;
}
export function conditionDisclosure(c,state=c.combatState,open=false){const rows=conditionEntries(c,state);return `<details class="sheet-conditions" ${open?'open':''}><summary><span class="condition-heading"><svg class="condition-heading-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg><span>상태 효과</span><b class="condition-count" aria-label="${rows.length}개">${rows.length}</b></span>${conditionBadges(c,state)}<span class="condition-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m8 10 4 4 4-4"/></svg></span></summary>${conditionDetails(c,state)}</details>`;}
