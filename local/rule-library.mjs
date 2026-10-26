import {isGMGuide} from './gm-guidance.mjs';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const configFile=fileURLToPath(new URL('../.local-data/rule-library.json',import.meta.url));
export const fixedRuleFolder=fileURLToPath(new URL('../rulebooks',import.meta.url));
export function fixedLibraryConfig(config){
 const previous=config.roots?.find(r=>r.kind==='rule'&&r.path.replaceAll('\\','/').replace(/\/$/,'').toLowerCase()===fixedRuleFolder.replaceAll('\\','/').replace(/\/$/,'').toLowerCase());
 return {...config,roots:[...(config.roots||[]).filter(r=>r.kind!=='rule'),{...previous,kind:'rule',path:fixedRuleFolder,exclude:[...new Set([...(previous?.exclude||[]),'_미사용','README.md'])]}]};
}
export async function libraryConfig(){
 try{return fixedLibraryConfig(JSON.parse(await readFile(configFile,'utf8')));}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function libraryCall(config,input,{signal,onProgress}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(config.python,[fileURLToPath(new URL('./rule-library.py',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','pipe'],signal});
  child.stdout.setEncoding('utf8');let output='',diagnostic='';
  child.stdout.on('data',b=>{output+=b.toString();let at;while((at=output.indexOf('\n'))>=0){const line=output.slice(0,at);output=output.slice(at+1);try{const value=JSON.parse(line);if(value.progress||value.indexed)onProgress?.(value);else child.result=value;}catch{}}});
  child.stderr.on('data',b=>{diagnostic=(diagnostic+b.toString()).slice(-2000);});
  child.on('error',reject);child.on('close',code=>code===0&&child.result&&!child.result.error?resolve(child.result):reject(Error(child.result?.error||'로컬 룰북 색인을 읽지 못했습니다.')));
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({database:config.database,roots:config.roots,...input}));
 });
}
export async function localRuleContext(room,queries,options={}){
 const config=options.config??await libraryConfig();if(!config||!config.roomIds?.includes(room.id))return null;
 const call=options.libraryCall||libraryCall;
 const books=(await call(config,{op:'catalog'},options)).books;
 const selected=room.campaign?.localBookIds??books.filter(b=>b.kind==='rule'&&!isGMGuide(b)&&b.emptyPages<b.pages).map(b=>b.id);
 const scenario=room.campaign?.localScenarioId;
 const ids=[...selected,...(scenario?[scenario]:[])].filter(id=>books.some(b=>b.id===id&&!isGMGuide(b)));
 const searchIds=options.scenarioOnly?ids.filter(id=>id===scenario):ids;
 return {config,books:books.filter(b=>ids.includes(b.id)&&!isGMGuide(b)),...(queries.length&&searchIds.length?await call(config,{op:'search',bookIds:searchIds,queries},options):{excerpts:[]})};
}
export function proposalSources(c){
 const p=c.payload||{};
 if(c.op==='scheduleActivity')return [...(p.sources||[]),...(p.steps||[]).flatMap(proposalSources)];
 if(c.op==='abilityPlan')return (p.steps||[]).flatMap(s=>s.kind==='check'?s.check.sources||[]:[]);
 if(c.op==='rule')return [p];
 return ['possessionAction','sourceRuling','stealthAction','awarenessUpdate','aquariumSituation','reserveWait'].includes(c.op)?p.sources||[]:[];
}
export async function verifyLocalProposal(proposal,context,options={}){
 const citations=[],sourcesToRestore=[],restored=structuredClone(proposal);
 for(const c of restored.commands||[]){
  const sources=proposalSources(c);
  for(const source of sources||[]){
  if(source.kind!=='local_source')continue;
  const match=/^local:([a-f0-9]{24}):(\d+)$/.exec(source.documentId||'');
  if(!match||!context.books.some(b=>b.id===match[1]&&b.kind==='rule'))throw Error('연결된 로컬 룰북의 출처를 지정해야 합니다.');
  citations.push({bookId:match[1],page:Number(match[2]),quote:source.quote});
  sourcesToRestore.push(source);
 }
 }
 const verified=await libraryCall(context.config,{op:'verify',citations},options);
 // Keep commands and their proofs identical for the server's strict comparison.
 sourcesToRestore.forEach((source,i)=>{source.quote=verified.citations[i].quote;});
 return {...restored,localCitations:verified.citations};
}
