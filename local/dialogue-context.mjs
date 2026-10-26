// Model-input projection only: authoritative state and histories stay in the store.
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
const identity=c=>pick(c,['id','name','owner','kind','controllers','description','hp','maxHp','fp','maxFp','conditions','effects','injuries','combatState','assets','offMapPosition']);
const message=m=>pick(m,['id','type','text','name','speakerId','targetId','actorId','actionId','actionSpeech','sourceMessageId','caseId','gameClock','placeId','sceneTitle']);
export function dialogueProjection(room){
 const targetId=room.gmJob?.targetId,actorId=room.gmJob?.actorId;
 const current=room.worldContext?.current,activeId=room.chronicle?.activeCaseId;
 const active=room.chronicle?.cases?.find(c=>c.id===activeId);
 const recent=room.messages.slice(-12),retained=new Set(recent);
 // Relevant earlier turns are retained verbatim, not rewritten by another model.
 const terms=String(room.gmJob?.requestText||'').match(/[\p{L}\p{N}]{3,}/gu)||[];
 const earlier=room.messages.slice(0,-12).filter(m=>targetId&&(m.speakerId===targetId||m.targetId===targetId)||terms.some(t=>String(m.text).includes(t))).slice(-6);
 for(const m of earlier)retained.add(m);
 const history=room.messages.filter(m=>retained.has(m));
 const shops=(room.economy?.shops||[]).filter(s=>s.npcId===targetId||current&&s.placeId===current.id||s.id===room.economy?.visit?.shopId);
 const itemIds=new Set(shops.flatMap(s=>(s.offers||[]).map(o=>o.itemId)));
 const actors=room.characters.map(c=>identity(c));
 for(const c of actors)for(const id of Object.keys(c.assets?.items||{}))itemIds.add(id);
 const result={
  ...pick(room,['playScope','factions','id','owner','gmJob','partyCharacterIds','gmMemory','secrets','aiPrivate','notes','preparedContext','localRuleExcerpts','localRuleBooks','ruleLookup','ruleLookupExcerpts','gmGuidance','guidanceLookup','scenarioNPCRoster','perceptionContext','awarenessContext','npcAgencyContext','combatTemplates']),
  spatialContext:room.spatialContext,
  campaign:pick(room.campaign,['system','world','bible','gmInstructions']),
  characters:actors,cast:(room.cast||[]).map(c=>identity(c)),
  scene:pick(room.scene,['title','narration','speaker','speakerId']),
  messages:history.map(message),actions:[],rules:[],rolls:[],maps:[],
  documents:(room.documents||[]).filter(d=>d.id===room.campaign?.scenarioId||(room.campaign?.characterReferenceIds||[]).includes(d.id)),
  chronicle:{clock:room.chronicle?.clock,activeCaseId:activeId,cases:active?[pick(active,['id','title','summary','status','scenarioSource'])]:[],events:(room.chronicle?.events||[]).filter(e=>e.caseId===activeId&&e.status==='scheduled')},
  combat:room.combat?.status==='active'?pick(room.combat,['status','pending','currentId','round','roundSeconds','elapsedSeconds']):{status:'idle'},
  economy:{enabled:room.economy?.enabled,visit:room.economy?.visit,shops,items:(room.economy?.items||[]).filter(i=>itemIds.has(i.id))},
 };
 if(room.worldContext){
  result.worldContext={current,presentNpcIds:room.worldContext.presentNpcIds,absentNpcIds:room.worldContext.absentNpcIds,characterPlaces:room.worldContext.characterPlaces,people:(room.worldContext.people||[]).filter(n=>!targetId||n.speakerId===targetId),activeCase:room.worldContext.activeCase,notice:'NPCs in absentNpcIds are not present and must not speak or follow. Prior dialogue is historical, not evidence of current location. Only confirmed active companions follow party travel. Respect recorded locations, live facts and hours. All GM secrets remain private. Dialogue never applies purchases, movement, rewards or time.'};
  // The same case source is already supplied by worldContext; do not send it twice.
  if(result.worldContext.activeCase?.source&&result.chronicle.cases[0])delete result.chronicle.cases[0].scenarioSource;
 }
 // Keep a roster to prevent impersonating a controlled character. Sheet/image/roll
 // definitions are not needed for dialogue; character identity and resources remain.
 return {room:result,report:{history:{original:room.messages.length,selected:history.length,ids:history.map(m=>m.id),reason:'recent-12-and-related-6'},shops:{original:room.economy?.shops?.length||0,selected:shops.length},omittedFields:['maps','rolls','rules','character sheet fields','image metadata','completed calendar events','inactive case sources','economy ledger'],notice:'Projection is for speech only, never a source of authoritative state updates.'}};
}
