// A read-only, job-scoped projection. Unresolved actions and mechanical state stay exact.
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
export function actionProjection(room){
 const job=room.gmJob,activeId=room.chronicle?.activeCaseId,current=room.worldContext?.current;
 const actions=(room.actions||[]).filter(a=>a.status!=='resolved'||job.actionIds?.includes(a.id));
 const ids=new Set(actions.map(a=>a.id));
 const query=[job.requestText,...actions.filter(a=>job.actionIds?.includes(a.id)).map(a=>a.text)].join(' ');
 const terms=[...new Set(query.match(/[\p{L}\p{N}]{2,}/gu)||[])];
 const related=m=>ids.has(m.actionId)||terms.some(t=>String(m.text).includes(t));
 const recent=room.messages.slice(-16),earlier=room.messages.slice(0,-16).filter(related).slice(-8),keep=new Set([...earlier,...recent]);
 const history=room.messages.filter(m=>keep.has(m)||ids.has(m.actionId));
 const trading=/구매|판매|상점|가격|재고|돈|현금|소지금|buy|sell|shop|price/i.test(query);
 const shops=trading?(room.economy?.shops||[]).filter(s=>s.placeId===current?.id||s.id===room.economy?.visit?.shopId||query.includes(s.name)):[];
 const itemIds=new Set(shops.flatMap(s=>(s.offers||[]).map(o=>o.itemId)));
 for(const c of [...(room.characters||[]),...(room.cast||[])])for(const id of [...Object.keys(c.assets?.items||{}),...Object.keys(c.assets?.storedItems||{})])itemIds.add(id);
 for(const x of [...(room.groundItems||[]),...(room.looseWeapons||[])])itemIds.add(x.itemId);
 for(const c of room.characters||[])for(const f of c.aquarium?.fish||[])if(f.cargo)itemIds.add(f.cargo.itemId);
 const active=room.chronicle?.cases?.find(c=>c.id===activeId);
 const result={...room,actions,messages:history,
  maps:(room.maps||[]).filter(m=>m.id===room.mapId||actions.some(a=>a.mapIntent?.mapId===m.id)),
  rolls:(room.rolls||[]).filter(r=>ids.has(r.actionId)||history.some(m=>m.rollId===r.id)),
  economy:{...pick(room.economy,['enabled','currency','visit','visits','bases']),shops,items:(room.economy?.items||[]).filter(i=>itemIds.has(i.id))},
  chronicle:{...pick(room.chronicle,['clock','activeCaseId']),cases:active?[{...active}]:[],events:(room.chronicle?.events||[]).filter(e=>e.caseId===activeId&&e.status==='scheduled')},
 };
 // Duplicated case source is still available once, with its citation path.
 if(result.worldContext?.activeCase?.source&&result.chronicle.cases[0])delete result.chronicle.cases[0].scenarioSource;
 delete result.campaign.sourceFiles;
 return {room:result,report:{history:{original:room.messages.length,selected:history.length,ids:history.map(m=>m.id)},shops:{original:room.economy?.shops?.length||0,selected:shops.length},actions:{original:room.actions?.length||0,selected:actions.length},omittedFields:['resolved actions outside job','unrelated old messages','inactive maps and cases','unrelated shops','economy ledger']}};
}
