// Owner maintenance for a first, free walking trip with no subsequent mechanics.
// This deliberately refuses cases that need a complete historical checkpoint.
const fail=message=>{throw Object.assign(Error(message),{status:409});};
export function rollbackTravel(r,u,p){
 if(u.id!==r.owner)throw Object.assign(Error('방장 권한이 필요합니다.'),{status:403});
 if(['queued','running','applying'].includes(r.gmJob?.status)||r.combat?.status==='active')fail('GM과 전투를 중단한 뒤 복원하세요.');
 const a=r.actions.find(x=>x.id===p.actionId),t=a?.travel,w=r.worldLibrary;
 if(!t||a.status!=='resolved'||t.mode!=='walk'||t.won!==0||t.visitMinutes||t.vehicleId||!a.at||!t.fromClock||!t.toClock)fail('복원 가능한 무료 도보 이동이 아닙니다.');
 const cutoff=Date.parse(a.at),after=x=>!x.at||Date.parse(x.at)>=cutoff;
 if(!Number.isFinite(cutoff)||JSON.stringify(r.chronicle.clock)!==JSON.stringify(t.toClock))fail('이동 이후 시간이 변경되었습니다.');
 if(r.actions.some(x=>x.id!==a.id&&after(x)&&x.status!=='pending')||r.rolls.some(after)||r.economy.ledger.some(after))fail('이동 이후 실행된 판정이나 거래가 있습니다.');
 if((r.gmMemory||[]).length||(r.notes||[]).length||(r.aquariumZones||[]).length||r.characters.some(c=>(c.effects||[]).length||c.injuries?.length||c.combatState||c.aquarium))fail('상태 효과나 기억이 있는 플레이는 전체 복구 지점이 필요합니다.');
 const before=r.messages.filter(x=>!after(x));
 if(before.some(m=>m.locationArrival&&m.placeId===t.to)||r.actions.some(x=>x.id!==a.id&&x.travel?.to===t.to&&!after(x)))fail('첫 방문 이전으로만 복원할 수 있습니다.');
 const origin=w?.presentations?.[t.from],destination=r.maps.find(m=>m.placeId===t.to||m.id===w?.presentations?.[t.to]?.mapId);
 const originMap=r.maps.find(m=>m.id===origin?.mapId);
 const actorIds=t.actorIds||[a.actorId];
 if(!origin||!originMap||!destination||destination.exploration||w.placeId!==t.to||actorIds.some(id=>w.characterPlaces?.[id]!==t.to||!originMap.tokens.some(z=>z.characterId===id)))fail('이동 직전 위치를 안전하게 복원할 수 없습니다.');
 if(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>1000)fail('복원 사유가 필요합니다.');
 const archiveId=crypto.randomUUID(),at=new Date().toISOString();
 r.travelRollbacks||=[];
 r.travelRollbacks.push({id:archiveId,at,reason:p.reason,sourceVersion:r.version,actionId:a.id,messages:r.messages.filter(after),actions:r.actions.filter(after),scene:structuredClone(r.scene),world:structuredClone({placeId:w.placeId,visitedIds:w.visitedIds,characterPlaces:w.characterPlaces,presentations:w.presentations}),mapId:r.mapId,mapTokens:structuredClone(destination.tokens),clock:structuredClone(r.chronicle.clock),gmJob:structuredClone(r.gmJob),gmHistory:structuredClone(r.gmHistory||[])});
 r.messages=before;r.actions=r.actions.filter(x=>!after(x));
 for(const id of actorIds)w.characterPlaces[id]=t.from;
 w.placeId=t.from;w.visitedIds=w.visitedIds.filter(id=>id!==t.to);delete w.presentations[t.to];
 destination.tokens=destination.tokens.filter(z=>!r.partyCharacterIds.includes(z.characterId));
 r.scene=structuredClone(origin);r.mapId=origin.mapId;
 const last=before.findLast(m=>m.placeId===t.from&&['narration','dialogue','npcDialogue'].includes(m.type));
 if(last){r.scene.narration=last.text;r.scene.speaker=last.name||'GM';r.scene.speakerId=last.speakerId||'';r.scene.expressionId=last.expressionId||'';}
 w.presentations[t.from]=structuredClone(r.scene);
 r.chronicle.clock=structuredClone(t.fromClock);r.turn.ready=[];
 r.lifecycle={...r.lifecycle,lastClock:Date.parse(t.fromClock.date+'T'+t.fromClock.time+':00Z')/1000+(r.chronicle.combatSeconds||0)};
 r.aquariumScene={key:[r.chronicle.activeCaseId,r.mapId,w.placeId,r.scene.title].join('|'),epoch:(r.aquariumScene?.epoch||0)+1};
 r.gmJob={status:'cancelled',message:'이동 직전으로 복원했습니다. 새 행동을 선언하세요.'};
 r.gmHistory=(r.gmHistory||[]).filter(x=>!after(x));r.gmUpdatedAt=r.gmHistory.at(-1)?.finishedAt||'';
 r.messages.push({id:crypto.randomUUID(),type:'system',author:u.id,name:u.name,at,gameClock:structuredClone(t.fromClock),text:`${origin.title} · ${t.fromClock.time} 이동 직전으로 복원했습니다. 이후 기록은 별도 보관했습니다.`});
 return {archiveId,placeId:t.from,clock:structuredClone(t.fromClock)};
}
