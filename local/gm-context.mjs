import {actionProjection} from './action-context.mjs';
import {combatCatalogContext} from './combat-catalog-context.mjs';
// Independent implementation inspired by context-scoped lorebooks. No external code.
// This is a prompt projection, never a mutation of the authoritative campaign.
import {attackModes} from '../public/play/weapon-modes.js';
import {techniqueCapabilities} from '../lib/combat-techniques.mjs';
import {createHash} from 'node:crypto';
import {dialogueProjection} from './dialogue-context.mjs';
import {combatReactionProjection} from './combat-reaction-context.mjs';

const chunkCache=new Map();
function indexed(text){
 const hash=createHash('sha256').update(text).digest('hex');
 if(chunkCache.has(hash)){const value=chunkCache.get(hash);chunkCache.delete(hash);chunkCache.set(hash,value);return {...value,cacheHit:true};}
 const value={hash,chunks:referenceChunks(text)};chunkCache.set(hash,value);
 if(chunkCache.size>8)chunkCache.delete(chunkCache.keys().next().value);
 return {...value,cacheHit:false};
}

const stopwords=new Set(['안녕하세요','감사합니다','고마워','주세요','합니다','한다','있다','있는','지금','다른','대화','대한','관련','어떻게','그냥','아직','이번','정도','하나','그리고','the','and','this','that','with','from']);
const tokens=text=>[...new Set(String(text||'').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[])].filter(t=>!stopwords.has(t)&&!/^\d+$/.test(t));
export function referenceChunks(text,size=1400){
 const chunks=[],sections=[...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map(m=>({start:m.index,heading:m[1]}));
 if(sections[0]?.start!==0)sections.unshift({start:0,heading:''});
 for(let i=0;i<sections.length;i++){
  const section=sections[i],limit=sections[i+1]?.start??text.length;let start=section.start;
  while(start<limit){
   let end=Math.min(start+size,limit);
   if(end<limit){const line=text.lastIndexOf('\n',end);if(line>start+size/2)end=line+1;}
   chunks.push({start,end,heading:section.heading,content:text.slice(start,end)});start=end;
  }
 }
 return chunks;
}

export function selectGMContext(snapshot){
 const started=performance.now(),kind=snapshot.gmJob?.kind||'turn';
 const projected=kind==='combatReaction'?combatReactionProjection(structuredClone(snapshot)):kind==='dialogue'?dialogueProjection(structuredClone(snapshot)):['individual','request'].includes(kind)?actionProjection(structuredClone(snapshot)):null;
 const room=projected?.room||structuredClone(snapshot);
 delete room.sceneArchive;
 for(const c of room.characters||[])if(c.combatProfile){c.availableAttackModes=attackModes(c);c.availableCombatTechniques=techniqueCapabilities(c);}
 const combatReference=combatCatalogContext(room);if(combatReference)room.combatCatalog=combatReference;
 const activeCase=room.chronicle?.cases?.find(c=>c.id===room.chronicle.activeCaseId);
 const target=[...(room.characters||[]),...(room.cast||[])].find(c=>c.id===room.gmJob?.targetId);
 const actionIds=room.gmJob?.actionIds;
 const queries=[room.gmJob?.requestText,room.scene?.title,kind==='dialogue'?'':activeCase?.title,target?.name,...(room.npcAgencyContext||[]).map(n=>n.name),
  ...(room.actions||[]).filter(a=>actionIds?.includes(a.id)||!actionIds&&a.status==='pending').map(a=>a.text),
  ...(room.messages||[]).slice(-6).map(m=>m.text)].filter(Boolean);
 const terms=tokens(queries.join(' ')).slice(0,160);
 const budget=['dialogue','combatReaction'].includes(kind)?4500:['individual','request'].includes(kind)?9000:24000;
 const report={version:2,kind,referenceBudget:budget,budgetUnit:'characters',sources:[],projection:projected?.report,originalCharacters:JSON.stringify(snapshot).length};
 const sources=[];
 const add=(path,object,key,full=false)=>{
  if(typeof object?.[key]!=='string'||!object[key])return;
  const index=indexed(object[key]);sources.push({path,object,key,text:object[key],full,...index});
 };
 // Full setup/rules jobs must be able to review the whole supplied source.
 add('campaign.bible',room.campaign,'bible',['preparation','rules'].includes(kind));
 for(const d of room.documents||[])add(`documents/${d.id}`,d,'content',kind==='rules'||kind==='preparation'&&d.id===room.campaign.scenarioId);
 if(['dialogue','combatReaction','individual','request'].includes(kind)){
  add('worldContext.activeCase.source',room.worldContext?.activeCase,'source');
  for(const c of room.chronicle?.cases||[])add(`chronicle.cases/${c.id}/scenarioSource`,c,'scenarioSource');
 }
 // Retrieved rule passages are already ranked and bounded. Do not run Korean
 // narrative keyword filtering over English rules a second time.
 let retrievedCharacters=0;
 for(const key of ['localRuleExcerpts','ruleLookupExcerpts'])if(room[key])room[key]=room[key].filter(e=>{const length=(e.text||e.content||'').length;if(retrievedCharacters+length>24000)return false;retrievedCharacters+=length;return true;});
 // Persistent GM instructions, opening request and structured facts are never shortened.
 const candidates=sources.filter(s=>!s.full).flatMap(s=>s.chunks.map((c,index)=>{
  const normalized=(c.heading+'\n'+c.content).normalize('NFKC').toLowerCase();
  const matches=terms.filter(t=>normalized.includes(t));
  const coreHeading=c.heading.replace(/^[\d.\-\s]+/,'').trim();
  const pinned=s.key==='bible'&&(index===0||(kind==='dialogue'?/^(공통 원칙|핵심 원칙|설정 우선순위와 공통 규칙|core principles|canon)$/i.test(coreHeading):/핵심|공통|금지|원칙|절대|core|canon|principle/i.test(c.heading)));
  return {s,c,index,matches,pinned,score:matches.reduce((v,t)=>v+Math.min(8,t.length),0)+(target?.name&&normalized.includes(target.name.toLowerCase())?20:0)};
 }));
 const chosen=new Set();let used=0;
 // Preserve canon sections even if they exceed the optional reference budget.
 for(const item of candidates.filter(x=>x.pinned)){chosen.add(item);used+=item.c.content.length;}
 for(const item of candidates.filter(x=>!x.pinned&&x.score>0).sort((a,b)=>b.score-a.score||a.s.path.localeCompare(b.s.path)||a.index-b.index)){
  if(used+item.c.content.length>budget)continue;
  chosen.add(item);used+=item.c.content.length;
 }
 for(const s of sources){
  const selected=s.full?s.chunks:candidates.filter(x=>x.s===s&&chosen.has(x)).sort((a,b)=>a.index-b.index).map(x=>x.c);
  const omitted=selected.length!==s.chunks.length;
  if(omitted)s.object[s.key]=selected.length?selected.map(c=>`[source ${s.path} chars ${c.start}-${c.end}${c.heading?' · '+c.heading:''}]\n${c.content}`).join('\n\n'):'[Source registered; no excerpt selected for this job. Do not invent its contents.]';
  report.sources.push({path:s.path,sha256:s.hash,cacheHit:s.cacheHit,originalCharacters:s.text.length,selectedCharacters:selected.reduce((n,c)=>n+c.content.length,0),full:!omitted,
   ranges:selected.map(c=>({start:c.start,end:c.end,reason:candidates.find(x=>x.s===s&&x.c===c)?.pinned?'core-canon':s.full?'full-review':'keyword-match',matches:candidates.find(x=>x.s===s&&x.c===c)?.matches||[]})),omittedChunks:s.chunks.length-selected.length,reason:s.full?'full-review':omitted?'relevance-and-canon':'fits-budget'});
 }
 room.contextNotice='Some reference text or history may be omitted. Omitted text is unknown, not nonexistent. Never invent missing facts, past events or citations. State here is a read-only job projection, not the complete world. All included facts, resources and persistent GM instructions are authoritative; respect knowledge boundaries. Source offsets refer to original text.';
 if(target){
  // This is an explicit role boundary for the GM, not a replacement for visibility filtering.
  room.speakerContext={speakerId:target.id,name:target.name,knownMemoryIds:(room.gmMemory||[]).filter(m=>m.status!=='retired'&&(m.knownTo?.includes('all')||m.knownTo?.includes(target.id))).map(m=>m.id),knownClueIds:(room.notes||[]).filter(n=>n.recordType==='discoveredClue'&&n.knownTo?.includes(target.id)).map(n=>n.id),instruction:'Only these memory entries and knownClueIds are established knowledge for this speaker. Other GM knowledge must not become their dialogue. Beliefs remain beliefs.'};
 }
 for(const key of ['localRuleExcerpts','ruleLookupExcerpts'])for(const [i,e] of (room[key]||[]).entries())report.sources.push({path:key+'/'+i,originalCharacters:(e.text||e.content||'').length,selectedCharacters:(e.text||e.content||'').length,full:true,reason:'retrieved-original-passage'});
 report.ruleReferenceBudget=24000;report.selectedRuleCharacters=retrievedCharacters;
 report.selectedReferenceCharacters=used+retrievedCharacters+sources.filter(s=>s.full).reduce((n,s)=>n+s.text.length,0);
 report.modelCharacters=JSON.stringify(room).length;
 report.protectedFields=kind==='dialogue'?['campaign.gmInstructions','gmJob','gmMemory','secrets','aiPrivate','character identities and assets']:['campaign.gmInstructions','campaign.openingPrompt','gmJob','gmMemory','characters','actions','rules','rolls','chronicle','combat'];
 report.selectionMs=Math.round((performance.now()-started)*100)/100;
 return {room,report};
}
