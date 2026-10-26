import {openWorldPanel} from './open-world.js';
import {replayList,replayDialog} from './scene-replay.js';
import {sceneSegments} from './scene-records.js';
import {contentCalendar} from './content-packs.js';
import {periods,storyState,remaining} from './story-state.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ctx,view='story',roomId='',day='',month='',previousClock='',fileSequence=0,recordPlace='',recordPhase='',recordCase='';
const own=()=>ctx.room.owner===ctx.me.id,state=()=>ctx.room.chronicle;
const button=(a,t,id='')=>`<button type="button" data-chronicle="${a}" data-id="${esc(id)}">${t}</button>`;
export const chronicleCaseScope=()=>state()?.activeCaseId||'';
const labels={available:'진행 가능',locked:'선행 전개 대기',upcoming:'예정',overdue:'기한 검토 필요',done:'완료',cancelled:'취소'};
function caseEvents(id,events,c){const matching=events.filter(e=>e.caseId===id);return matching.length?'<div class="case-developments">'+matching.map(e=>card(e,c)).join('')+'</div>':'';}
function calendarEvents(events,c){
 const standalone=events.filter(e=>!c.cases.some(x=>x.id===e.caseId&&x.contentRef));
 if(!standalone.length)return '';
 const ids=[...new Set(standalone.map(e=>e.caseId||''))];
 return ids.map(id=>{const entry=c.cases.find(x=>x.id===id);return '<section class="calendar-case"><header><h3>'+esc(entry?.title||'공통 전개')+'</h3>'+(entry?button('log','플레이 기록',id)+(own()&&!entry.contentRef&&entry.visibility==='public'&&entry.status==='open'&&!c.activeCaseId?button('start','케이스 시작',id):''):'')+'</header>'+standalone.filter(e=>(e.caseId||'')===id).map(e=>card(e,c)).join('')+'</section>';}).join('');
}
function card(e,c){const status=e.availability||storyState(e,c);return `<article class="story-beat ${status}"><div class="beat-time"><b>${esc(e.time)}</b><small>${esc(e.date.slice(5).replace('-',' / '))}</small></div><div><span class="case-stamp">${{scene:'전개',activity:'활동',deadline:'기한'}[e.kind]||'전개'} · ${labels[status]}${e.visibility==='gm'?' · GM 전용':''}</span><h3>${esc(e.title)}</h3>${e.description?`<details class="beat-description"><summary>자세히</summary><p>${esc(e.description)}</p></details>`:''}<small>${e.duration?`${e.duration}분 소요`:''} ${e.kind==='deadline'?remaining(e,c.clock):''}</small>${status==='available'&&(!e.caseId||e.caseId===c.activeCaseId)&&(!e.contentMapId||e.mapId===ctx.room.mapId)&&e.kind!=='deadline'&&e.visibility!=='gm'&&ctx.activeCharacter?.()?button('choose','장면에서 진행',e.id):''}${own()?`<details class="beat-management"><summary>GM 수정</summary><div class="entry-actions">${status==='available'&&(!e.caseId||e.caseId===c.activeCaseId)?button('finish','완료 · 시간 반영',e.id):''}${button('event','편집',e.id)}</div></details>`:''}</div></article>`;}
export function chroniclePage(context){
 ctx=context;const c=state(),active=c.cases.find(x=>x.id===c.activeCaseId),date=c.clock?.date;
 if(roomId!==ctx.room.id){roomId=ctx.room.id;view='story';day='';month='';previousClock='';recordPlace='';recordPhase='';recordCase='';}
 const clockKey=c.clock?c.clock.date+' '+c.clock.time:'';
 const changed=!!previousClock&&!!clockKey&&previousClock!==clockKey;
 if(changed&&!day)month='';previousClock=clockKey;
 month||=(date||c.events[0]?.date||'').slice(0,7);
 const phase=periods.filter(p=>p.hour<=Number(c.clock?.time.slice(0,2)||0)).at(-1);
 const events=c.events.filter(e=>e.status!=='cancelled').sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
 const deadline=events.find(e=>e.kind==='deadline'&&e.status==='scheduled');
 const header=`<header class="story-hero"><div class="story-date"><small>${esc(date?.slice(0,4)||'')}</small><strong>${date?esc(date.slice(5).replace('-',' / ')):'— / —'}</strong><span>${c.clock?`${phase.name} · ${esc(c.clock.time)}`:'이야기 시작일 미설정'}</span></div><div class="story-objective"><h2>${esc(active?.title||(c.clock?'자유행동':'시작 전'))}</h2>${deadline?`<div class="story-deadline"><b>${remaining(deadline,c.clock)}</b><span>${esc(deadline.title)}</span></div>`:''}</div></header>`;
 let body='';
 if(view==='story'){
 const selected=day||date;
 const monthDate=month?new Date(month+'-01T00:00:00Z'):null;
 const offset=monthDate?.getUTCDay()||0;
 const days=monthDate?new Date(Date.UTC(monthDate.getUTCFullYear(),monthDate.getUTCMonth()+1,0)).getUTCDate():0;
 const cells=monthDate?Array.from({length:Math.ceil((offset+days)/7)*7},(_,i)=>{
  const n=i-offset+1;if(n<1||n>days)return '<span class="game-day blank" aria-hidden="true"></span>';
  const iso=month+'-'+String(n).padStart(2,'0'),entries=events.filter(e=>e.date===iso),pending=entries.filter(e=>e.status==='scheduled');
  const recorded=ctx.room.messages.some(m=>m.gameClock?.date===iso&&m.channel!=='admin'&&!['request','adminReply','adjudication'].includes(m.type));
  const due=pending.some(e=>e.kind==='deadline'),done=entries.length&&!pending.length;
  return `<button class="game-day ${iso===date?'today':''} ${iso===selected?'selected':''} ${due?'deadline':''} ${iso<date?'past':''}" data-story-date="${iso}" aria-label="${iso}${iso===date?' 오늘':''}${due?' 마감':''}${entries.length?' 전개 '+entries.length+'개':''}" aria-pressed="${iso===selected}" ${iso===date?'aria-current="date"':''}><b>${n}</b><span>${due?'마감':done?'✓':pending.length?'•'.repeat(Math.min(3,pending.length)):recorded?'◦':''}</span></button>`;
 }).join(''):Array.from({length:35},()=>'<span class="game-day blank" aria-hidden="true"></span>').join('');
 const visible=events.filter(e=>e.date===selected);
 const available=events.filter(e=>e.kind!=='deadline'&&(e.availability||storyState(e,c))==='available');
 const preparing=ctx.room.gmJob?.kind==='preparation'&&['queued','running'].includes(ctx.room.gmJob.status);
 const started=c.playedDays?.includes(`${c.activeCaseId}/${selected}`);
 const canStart=!active?.contentRef&&!!active&&own()&&selected&&date&&selected>=date&&visible.some(e=>e.visibility==='public'&&e.status==='scheduled')&&!started;
 body=`${own()&&(preparing||ctx.room.gmJob?.kind==='preparation'&&ctx.room.gmJob.status==='error')?`<div class="calendar-setup">${preparing?'<span role="status">장소·인물·전개 준비 중…</span>'+button('cancel-setup','중단'):''}${ctx.room.gmJob?.kind==='preparation'&&ctx.room.gmJob.status==='error'?'<span>준비 실패</span>'+button('retry-setup','다시 시도'):''}</div>`:''}<section class="game-calendar"><header class="game-month"><button data-story-month="-1" aria-label="이전 달" ${month?'':'disabled'}>‹</button><h3>${month?Number(month.slice(5))+'월 <small>'+month.slice(0,4)+'</small>':'시작일 미설정'}</h3><button data-story-month="1" aria-label="다음 달" ${month?'':'disabled'}>›</button>${button('current','오늘')}</header><div class="game-weekdays">${['일','월','화','수','목','금','토'].map(d=>`<span>${d}</span>`).join('')}</div><div class="game-month-grid">${cells}</div></section><div class="story-phases">${periods.map(p=>`<span class="${phase===p&&c.clock?'active':''}">${p.name}</span>`).join('')}</div>${changed?`<div class="story-time-shift" role="status"><small>${esc(date?.slice(0,4))}</small><strong>${esc(date?.slice(5).replace('-',' / '))}</strong><span>${phase.name} · ${esc(c.clock.time)}</span></div>`:''}<div class="page-heading"><h3>${selected?esc(selected.slice(5).replace('-',' / ')):'케이스'}</h3></div>${contentCalendar(ctx,selected,id=>caseEvents(id,events.filter(e=>e.date===selected||selected===date&&e.kind!=='deadline'&&(e.availability||storyState(e,c))==='available'),c))}${canStart?button('play-day','이 날짜 시작',selected):started?button('scene-view','장면으로'):''}${calendarEvents(visible,c)}${selected===date&&available.some(e=>e.date!==date&&!c.cases.some(x=>x.id===e.caseId&&x.contentRef))?`<details class="story-upcoming"><summary>진행 가능한 전개</summary>${calendarEvents(available.filter(e=>e.date!==date),c)}</details>`:''}`;
  const groups=sceneSegments(ctx.room,{date:selected});
 const options=(values,current)=>'<option value="">전체</option>'+values.map(v=>'<option value="'+esc(v)+'" '+(v===current?'selected':'')+'>'+esc(v)+'</option>').join('');
 body+='<section class="calendar-replay"><h3>이날의 기록</h3><div class="record-filters"><label>장소<select data-record-filter="place">'+options([...new Set(groups.map(g=>g.title))],recordPlace)+'</select></label><label>시간대<select data-record-filter="phase">'+options([...new Set(groups.map(g=>g.phase).filter(Boolean))],recordPhase)+'</select></label><label>케이스<select data-record-filter="case"><option value="">전체</option>'+[...new Set(groups.map(g=>g.caseId))].map(id=>'<option value="'+esc(id||'none')+'" '+(recordCase===(id||'none')?'selected':'')+'>'+esc(c.cases.find(x=>x.id===id)?.title||'자유 활동')+'</option>').join('')+'</select></label></div>'+replayList(ctx.room,{date:selected,place:recordPlace,phase:recordPhase,...(recordCase?{caseId:recordCase==='none'?'':recordCase}:{})})+'</section>';

 }else{
 body=`<div class="page-heading"><h3>케이스 목록</h3>${own()?'<button class="primary" data-pack-import>케이스 불러오기</button>':''}</div>${c.cases.map((x,i)=>`<article class="story-case"><span class="case-stamp">CASE ${String(i+1).padStart(2,'0')} · ${x.id===c.activeCaseId?'진행 중':{open:'미해결',resolved:'해결',closed:'종결'}[x.status]}${x.visibility==='gm'?' · GM 전용':''}</span><h3>${esc(x.title)}</h3>${x.summary?`<p>${esc(x.summary)}</p>`:''}${x.recap?`<p>${esc(x.recap)}</p>`:''}<div class="entry-actions">${x.id===c.activeCaseId?button('scene-view','플레이 계속'):''}${button('case-date','달력에서 보기',x.id)}${button('log','플레이 기록',x.id)}${own()?`${!x.contentRef&&x.status==='open'&&x.visibility==='public'&&!c.activeCaseId?button('start','케이스 시작',x.id):''}`:''}</div>${own()?`<details class="case-management"><summary>케이스 관리</summary><div class="entry-actions">${button('case','편집',x.id)}${button('reward','보상 설정',x.id)}${x.endedAt&&x.reward&&!x.rewardReceipt?button('claim-reward','보상 정산',x.id):''}</div></details>`:''}</article>`).join('')||'<p class="empty-note">케이스 파일을 불러오면 달력과 목록에 함께 표시됩니다.</p>'}${c.episodes.length?`<details class="case-management"><summary>이전 기록</summary>${c.episodes.map(e=>`<article><h4>${esc(e.title)}</h4><p>${esc(e.recap)}</p></article>`).join('')}</details>`:''}`;

 }
 return `<section class="section-page dossier chronicle-page story-page">${header}${openWorldPanel(context)}<nav class="chronicle-tabs" aria-label="시나리오">${[['story','달력'],['cases','케이스 목록']].map(([id,t])=>`<button data-story-view="${id}" class="${view===id?'active':''}" aria-pressed="${view===id}">${t}</button>`).join('')}</nav>${body}${own()?`<details class="story-controls"><summary>GM · 시나리오 관리</summary><div class="entry-actions">${button('case','빈 케이스 만들기')}${button('event','전개 추가')}${button('clock','게임 시각 설정')}${c.clock?button('advance','시간 경과')+button('phase','다음 시간대'):''}${active?button('end','현재 케이스 종료'):''}${button('prepare','원문으로 AI 준비')}${c.preparation?button('draft','준비 초안 검토'):''}</div><p class="fine">완료된 플레이 결과를 확인한 뒤 전개를 완료하세요. 서버가 선행 전개과 시각을 검사하고 소요 시간을 반영합니다. 기한 초과만으로 실패하지 않습니다.</p></details>`:''}</section>`;
}
const input=(n,t,v='',type='text')=>`<label>${t}<input name="${n}" type="${type}" value="${esc(v)}" required maxlength="100"></label>`;
const area=(n,t,v='',max=4000)=>`<label>${t}<textarea name="${n}" maxlength="${max}">${esc(v)}</textarea></label>`;
const select=(n,t,items,v)=>`<label>${t}<select name="${n}">${items.map(([id,label])=>`<option value="${esc(id)}" ${id===v?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`;
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!ctx||!b)return;
 if(b.dataset.storyMonth&&month){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+Number(b.dataset.storyMonth));if(d.getUTCFullYear()<1||d.getUTCFullYear()>9999)return;month=d.toISOString().slice(0,7);day=month+'-01';ctx.render();return;}
 if(b.dataset.storyView){view=b.dataset.storyView;ctx.render();return;}if(b.dataset.storyDate){day=b.dataset.storyDate;recordPlace='';recordPhase='';recordCase='';ctx.render();return;}
 if(b.dataset.replay){replayDialog(ctx,b.dataset.replay);return;}
 const a=b.dataset.chronicle,id=b.dataset.id,c=state();if(!a)return;
 const form=(title,html,op,extra={},convert=p=>p)=>ctx.formDialog(title,html,p=>ctx.command(op,{...extra,...convert(p)}));
 if(a==='scene-view'){ctx.openScene?.();return;}
 if(a==='play-day'&&own()){ctx.command('playStoryDay',{date:id}).then(result=>{if(result)ctx.openScene?.();});return;}
 if(a==='cancel-setup'&&own())return ctx.command('cancelGM');
 if(a==='retry-setup'&&own())return ctx.command('retryGM');
 if(a==='current'){day='';month='';ctx.render();return;}
 if(a==='case-date'){const entry=c.cases.find(x=>x.id===id),dates=c.events.filter(e=>e.caseId===id&&e.status!=='cancelled').map(e=>e.date).sort();day=id===c.activeCaseId?c.clock?.date:entry?.status==='open'?(dates.find(d=>d>=c.clock?.date)||dates.at(-1)):dates.at(-1);day||=c.clock?.date||'';month=day.slice(0,7);view='story';ctx.render();requestAnimationFrame(()=>document.querySelector('.prepared-calendar,.calendar-case')?.scrollIntoView({block:'nearest'}));return;}
 if(a==='log'){ctx.modal(c.cases.find(x=>x.id===id)?.title||'케이스 기록',replayList(ctx.room,{caseId:id}));return;}
 if(a==='choose'){const event=c.events.find(x=>x.id===id);if(event&&ctx.activeCharacter?.())ctx.beginStoryAction(event);return;}
 if(!own())return;
 if(a==='clock')return form('이야기 시작 시각',input('date','게임 날짜',c.clock?.date||'','date')+input('time','시각',c.clock?.time||'18:00','time')+input('reason','설정 이유')+(c.clock?'<label><input type="checkbox" name="correctStart"> 시작 날짜 정정 · 기존 도입과 일정을 함께 이동</label>':''),'setClock',{},p=>({...p,correctStart:p.correctStart==='on'}));
 if(a==='advance')return form('시간 경과',input('minutes','경과 시간(분)','60','number')+input('reason','이동 · 조사 · 휴식 사유'),'advanceClock',{},p=>({...p,minutes:Number(p.minutes)}));
 if(a==='phase')return form('다음 시간대로 진행',input('reason','시간 경과 사유'),'nextPeriod');
 if(a==='finish')return form('전개 완료',`<p>「${esc(c.events.find(e=>e.id===id)?.title)}」의 결과를 확정하고 지정한 소요 시간을 반영합니다.</p>`,'finishBeat',{id});
 if(a==='start')return ctx.command('startCase',{id}).then(result=>{if(result)ctx.openScene();});
 if(a==='reward'){
  const x=c.cases.find(x=>x.id===id),reward=x?.reward;
  if(x?.rewardReceipt)return ctx.modal('지급된 보상',x.rewardReceipt.awards.map(a=>`<p>${esc(ctx.room.characters.find(ch=>ch.id===a.characterId)?.name||'캐릭터')} · ${a.won.toLocaleString('ko-KR')}원 · ${a.cp} CP</p>`).join(''));
  return form('케이스 보상',input('won','1인당 원화 보상',reward?.won??0,'number')+input('cp','1인당 CP',reward?.cp??0,'number')+'<p>케이스 종료 시 아래 인물에게 한 번 지급합니다.</p>'+ctx.room.characters.filter(ch=>ctx.room.partyCharacterIds.includes(ch.id)).map(ch=>`<label class="check-label"><input type="checkbox" name="recipient_${esc(ch.id)}" ${(reward?.recipientIds||ctx.room.partyCharacterIds).includes(ch.id)?'checked':''}>${esc(ch.name)}</label>`).join('')+'<details><summary>반드시 완료할 전개</summary>'+c.events.filter(e=>e.caseId===id).map(e=>`<label class="check-label"><input type="checkbox" name="event_${esc(e.id)}" ${reward?.requiredEventIds?.includes(e.id)?'checked':''}>${esc(e.title)}</label>`).join('')+'</details>','configureCaseReward',{id},p=>({won:Number(p.won),cp:Number(p.cp),recipientIds:Object.keys(p).filter(k=>k.startsWith('recipient_')).map(k=>k.slice(10)),requiredEventIds:Object.keys(p).filter(k=>k.startsWith('event_')).map(k=>k.slice(6))}));
 }
 if(a==='claim-reward')return ctx.command('claimCaseReward',{id});
 if(a==='end')return form('케이스 종료',area('recap','해결 결과 · 남은 단서'),'endCase');
 if(a==='case'){const x=c.cases.find(x=>x.id===id);return form(x?'케이스 편집':'새 케이스',input('title','케이스 이름',x?.title)+area('summary','개요 · 현재 목표',x?.summary)+select('status','상태',[['open','미해결'],['resolved','해결'],['closed','종결']],x?.status||'open')+select('visibility','공개 범위',[['public','참가자 공개'],['gm','GM 전용']],x?.visibility||'public'),'caseFile',{id:id||''});}
 if(a==='event'){const x=c.events.find(e=>e.id===id);return form(x?'전개 편집':'전개 배치',input('title','제목',x?.title)+area('description','상황 · 목표',x?.description)+select('caseId','케이스',[['','캠페인 공통'],...c.cases.map(x=>[x.id,x.title])],x?.caseId??c.activeCaseId)+select('kind','종류',[['scene','전개'],['activity','활동'],['deadline','기한']],x?.kind||'scene')+input('date','해금 날짜',x?.date||day||c.clock?.date||'','date')+input('time','해금 시각',x?.time||'18:00','time')+input('duration','완료 시 소요 시간(분)',x?.duration||0,'number')+select('requires','선행 전개',[['','없음'],...c.events.filter(e=>e.id!==id).map(e=>[e.id,e.title])],x?.requires?.[0]||'')+select('status','상태',[['scheduled','미완료'],['done','완료'],['cancelled','취소']],x?.status||'scheduled')+select('visibility','공개 범위',[['public','참가자 공개'],['gm','GM 전용']],x?.visibility||'public'),'calendarEvent',{id:id||''},p=>({...p,duration:Number(p.duration),requires:p.requires?[p.requires]:[]}));}
 if(a==='prepare'){form('시나리오 파일 넣기',input('title','제목')+'<label>파일<input id="scenario-file" type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"></label><p id="scenario-file-state" role="status"></p><details><summary>본문 확인</summary>'+area('scenario','시나리오','',200000)+'</details><p class="fine">이미지 없이 날짜·전개·장소·인물을 준비합니다. 완료되면 달력에서 날짜를 선택하세요.</p>','prepareScenario',{autoApply:true});const submit=document.querySelector('#detail-form button.primary');if(submit)submit.textContent='자동 준비';return;}
 if(a==='draft'){const d=c.preparation;return form('케이스 준비 초안',`<h3>${esc(d.title)}</h3><p>${esc(d.summary)}</p><h4>장소</h4>${d.locations.map(x=>`<article class="asset-preview">${x.image?`<img src="${esc(x.image)}" alt="${esc(x.title)}">`:"<span>이미지 생성 실패 · 기본 지도 사용</span>"}<p><b>${esc(x.title)}</b> · ${esc(x.description)}</p></article>`).join('')}<h4>등장인물</h4>${d.people.map(x=>`<article class="asset-preview portrait">${x.image?`<img src="${esc(x.image)}" alt="${esc(x.name)}">`:"<span>이미지 생성 실패</span>"}<p><b>${esc(x.name)}</b> · ${x.enemy?'적':'NPC'} · ${esc(x.description)}</p></article>`).join('')}<h4>전개</h4>${(d.beats||[]).map(x=>`<p>+${x.dayOffset}일 ${esc(x.time)} · ${esc(x.title)}</p>`).join('')}<p class="fine">지도와 NPC·적 토큰을 배치합니다. 적 토큰은 처음에 숨겨져 있습니다. NPC의 HP·FP 10은 임시값이며 겁스 빌드는 시트에서 검토하세요.</p>`,'applyPreparation',{id:d.id});}
});

document.addEventListener('change',async e=>{
 if(e.target.dataset.recordFilter){const kind=e.target.dataset.recordFilter;if(kind==='place')recordPlace=e.target.value;if(kind==='phase')recordPhase=e.target.value;if(kind==='case')recordCase=e.target.value;ctx.render();return;}
 if(e.target.id!=='scenario-file')return;const file=e.target.files?.[0];if(!file)return;const sequence=++fileSequence;
 const form=document.getElementById('detail-form'),status=form.querySelector('#scenario-file-state'),submit=form.querySelector('button.primary'),body=form.querySelector('textarea[name="scenario"]');
 submit.disabled=true;body.value='';status.textContent='파일 읽는 중…';
 try{const value=ctx.readDocument?await ctx.readDocument(file):await file.text();if(!value.trim()||value.length>200000)throw Error('텍스트가 있는 20만 자 이하의 시나리오를 사용하세요.');if(!form.isConnected||sequence!==fileSequence)return;body.value=value;form.querySelector('[name="title"]').value=file.name.replace(/\.[^.]+$/,'').slice(0,100);status.textContent='파일 준비됨';}
 catch(error){if(sequence===fileSequence)status.textContent=error.message;}
 finally{if(form.isConnected&&sequence===fileSequence)submit.disabled=false;}
});

