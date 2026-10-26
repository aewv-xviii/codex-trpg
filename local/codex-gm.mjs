import {guidanceContext,guidanceProjection,retrieveGuidance} from './gm-guidance.mjs';
import {retrievalSchema,lookupRequest,retrieveMore} from './rule-retrieval.mjs';
import {validateAbilityPlanConditions} from '../lib/ability-plan-conditions.mjs';
import {loadPreparedContent} from './prepared-content.mjs';
import {progressJob} from '../lib/gm-progress.mjs';
import {libraryConfig,libraryCall,localRuleContext,verifyLocalProposal,proposalSources} from './rule-library.mjs';
import { spawn,execFile } from 'node:child_process';
import { gmConfig,modelArguments,beginRun,auditWrite,recordApplication,ruleQueries,markRun } from './gm-runtime.mjs';
import { mkdtemp,writeFile,readFile,mkdir,readdir,stat } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {buildGMPrompt} from './gm-prompt.mjs';
import {selectGMContext} from './gm-context.mjs';
import { schemaForRoom,claimJob,finishJob,recoverJobs,gmSnapshot } from '../lib/gm-jobs.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
export async function codexExecutable(){
 if(process.env.NIGHT_TABLE_CODEX)return process.env.NIGHT_TABLE_CODEX;
 for(const directory of (process.env.PATH||'').split(process.platform==='win32'?';':':')){
  const candidate=join(directory,process.platform==='win32'?'codex.exe':'codex');
  try{if((await stat(candidate)).isFile())return candidate;}catch{}
 }
 const base=join(process.env.LOCALAPPDATA||'','OpenAI/Codex/bin');
 try{const candidates=await Promise.all((await readdir(base,{withFileTypes:true})).filter(e=>e.isDirectory()).map(async e=>{const path=join(base,e.name,'codex.exe');try{return {path,time:(await stat(path)).mtimeMs};}catch{return null;}}));const latest=candidates.filter(Boolean).sort((a,b)=>b.time-a.time)[0];if(latest)return latest.path;}catch{}
 return join(process.env.LOCALAPPDATA||'','Programs/OpenAI/Codex/bin/codex.exe');
}
async function completeCodexGM(room,{signal,promptText,schemaValue,profile='play',base=resolve(root,'.local-data/gm-runs')}={}) {
 await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'turn-'));
 const schema=join(dir,'schema.json'),answer=join(dir,'answer.json');await writeFile(schema,JSON.stringify(schemaValue||schemaForRoom(room)));
 const prompt=buildGMPrompt(room,{promptText});
 const configuration=await gmConfig(profile);
 await auditWrite(dir,'configuration',configuration);
 await writeFile(join(dir,'prompt.txt'),prompt,'utf8');
 const exe=await codexExecutable();
 const args=['exec','--ignore-user-config','--sandbox','read-only','--ephemeral','--skip-git-repo-check','-c','features.shell_tool=false','-c','web_search="disabled"','--json','--output-schema',schema,'--output-last-message',answer,'--color','never','-C',dir,'-'];
 args.splice(1,0,...modelArguments(configuration));
 // Auth comes from the user's existing ChatGPT login; no API key, shell command interpolation, or paid API fallback.
 const started=performance.now();let usage=null,lineBuffer='';
 await new Promise((res,rej)=>{
  const child=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let stderr='';let settled=false;
  const stop=()=>{if(process.platform==='win32'&&child.pid)execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});else child.kill();};
  const abort=()=>{stop();done(Error('GM 실행이 중단되었습니다.'));};
  const timeout=setTimeout(()=>{stop();done(Error('GM 응답 시간이 초과됐습니다. 다시 진행할 수 있습니다.'));},180000);
  function done(err){if(settled)return;settled=true;clearTimeout(timeout);signal?.removeEventListener('abort',abort);err?rej(err):res();}
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();
  child.stdout.on('data',b=>{
   lineBuffer+=b.toString();const lines=lineBuffer.split('\n');lineBuffer=lines.pop();
   for(const line of lines)try{const event=JSON.parse(line);if(event.type==='turn.completed'&&event.usage)usage=Object.fromEntries(Object.entries(event.usage).filter(([key,value])=>key.endsWith('tokens')&&Number.isFinite(value)));}catch{}
   if(lineBuffer.length>2000000)lineBuffer='';
  });child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-4000);});
  child.once('error',()=>done(Error('Codex 실행 파일을 찾거나 실행할 수 없습니다.')));
  child.once('close',async code=>{await writeFile(join(dir,'diagnostic.txt'),stderr);done(code===0?null:Error(/429|rate_limit_exceeded/i.test(stderr)?'Codex 요청이 일시적으로 제한되었습니다. 잠시 뒤 다시 진행하세요.':/usage_limit_reached|insufficient_quota/i.test(stderr)?'Codex 사용 한도에 도달했습니다.':'Codex 실행에 실패했습니다. 로그인 상태와 로컬 GM 진단 기록을 확인하세요.'));});
  child.stdin.on('error',()=>{});child.stdin.end(prompt);
 });
 await auditWrite(dir,'metrics',{generationMs:Math.round(performance.now()-started),promptCharacters:prompt.length,promptBytes:Buffer.byteLength(prompt),schemaCharacters:JSON.stringify(schemaValue||schemaForRoom(room)).length,usage});
 return JSON.parse(await readFile(answer,'utf8'));
}
export async function runCodexGM(room,options={}) {
 const started=performance.now();const timing={};
 room=gmSnapshot(room);
 const dir=await beginRun(room,options.base,options.profile);options.onRun?.(dir);
 const complete=options.complete||completeCodexGM;
 try {
  await options.onProgress?.('sources');
  const retrievalStarted=performance.now(),config=options.libraryConfig??await libraryConfig(),queries=ruleQueries(room);
  let context=null,augmented=room;
  if(room.gmJob?.kind!=='combatReaction'&&config?.roomIds?.includes(room.id)){
   const scenarioQueries=room.campaign?.localScenarioId?[room.scene?.title,room.gmJob?.requestText].filter(Boolean).map(t=>t.slice(0,100)):[];
   context=await (options.localRuleContext||localRuleContext)(room,queries.length?queries:scenarioQueries,{...options,config,scenarioOnly:!queries.length});
   augmented={...room,localRuleBooks:context.books,localRuleExcerpts:context.excerpts,localRuleNotice:'Selected excerpts only. Cite exact verified passages. Scenario excerpts are GM secrets, never public rule citations.'};
  }
  let guidance;try{guidance=await guidanceContext(room,config,options);}catch(e){guidance={books:[],excerpts:[],notice:'GM guide unavailable: '+e.message};}
  augmented.gmGuidance=guidanceProjection(guidance);
  await auditWrite(dir,'guidance',{books:guidance?.books||[],queries:guidance?.queries||[],excerpts:guidance?.excerpts||[],notice:guidance?.notice});
  await auditWrite(dir,'retrieval',{queries,books:context?.books||[],excerpts:context?.excerpts||[],method:'deterministic-keywords'});
  timing.retrievalMs=Math.round(performance.now()-retrievalStarted);
  let selected=selectGMContext(augmented);
  const prepared=await loadPreparedContent(room,config);
  if(prepared){selected.room.localPreparedContent=prepared;selected.report.prepared={revision:prepared.revision,excerptIds:prepared.excerpts.map(e=>e.id),characters:JSON.stringify(prepared).length};}
  await auditWrite(dir,'context-selection',selected.report);
  await auditWrite(dir,'model-input',selected.room);
  await options.onContext?.(selected.report);
  await options.onProgress?.('compose');
  const generationStarted=performance.now();
  let proposal;const lookupHistory=[];
  const canLookup=room.gmJob?.kind!=='combatReaction'&&(!!context?.books.some(b=>b.kind==='rule')||room.documents.some(d=>d.visibility==='public'&&[...(room.campaign.rulebookIds||[]),room.campaign.rulebookId].includes(d.id)));
  const canGuide=!!guidance?.books.length;
  for(let pass=0;pass<3;pass++){
   if(canLookup)selected.room.ruleLookup={remaining:2-pass,history:lookupHistory};
   if(canGuide)selected.room.guidanceLookup={remaining:2-pass,history:lookupHistory.filter(h=>h.kind==='lookupGuidance')};
   const schemaValue=retrievalSchema(selected.room,canLookup&&pass<2,canGuide&&pass<2);
   await auditWrite(dir,pass?'model-input-'+pass:'model-input',selected.room);
   proposal=await complete(selected.room,{...options,base:dir,schemaValue});
   const request=lookupRequest(proposal);
   if(!request)break;
   const advice=request.lookupKind==='lookupGuidance';
   if(!(advice?canGuide:canLookup)||pass>=2)throw Error('원문 추가 조회 한도에 도달했습니다. 필요한 규칙을 구체적으로 확인하세요.');
   await options.onProgress?.('sources');
   const more=advice?{context,web:augmented.ruleLookupExcerpts||[]}:await retrieveMore(room,context,request,options);context=more.context;
   if(advice)guidance=await retrieveGuidance(guidance,request,options);
   lookupHistory.push({kind:request.lookupKind,request,availablePages:((advice?guidance:context)?.excerpts||[]).map(e=>({bookId:e.bookId,page:e.page,matchedRules:e.matchedRules||[]}))});
   await auditWrite(dir,'lookup-'+pass,{request,guidanceExcerpts:guidance?.excerpts||[],excerpts:context?.excerpts||[],web:more.web});
   augmented={...room,gmGuidance:guidanceProjection(guidance),...(context?{localRuleBooks:context.books,localRuleExcerpts:context.excerpts}:{}),ruleLookupExcerpts:more.web};
   selected=selectGMContext(augmented);if(prepared)selected.room.localPreparedContent=prepared;
   await auditWrite(dir,'context-selection-'+(pass+1),selected.report);
   await options.onProgress?.('compose');
  }
  timing.generationMs=Math.round(performance.now()-generationStarted);
  await auditWrite(dir,'proposal',proposal);
  await options.onProgress?.('validate');
  const validationStarted=performance.now();
  for(const command of proposal.commands||[])if(command.op==='abilityPlan')validateAbilityPlanConditions(command.payload?.steps);
  const verified=context&&proposal.commands?.some(c=>proposalSources(c).some(s=>s.kind==='local_source'))?await verifyLocalProposal(proposal,context,options):proposal;
  timing.validationMs=Math.round(performance.now()-validationStarted);
  if(room.gmJob?.kind==='preparation'&&room.gmJob.generateImages===true){
   const drafts=verified.commands?.filter(c=>c.op==='scenarioDraft');
   if(drafts?.length!==1)throw Error('케이스 준비 초안이 필요합니다.');
   const {generateScenarioImages}=await import('./scenario-images.mjs');
   Object.assign(verified,await generateScenarioImages(drafts[0].payload,dir,options));
  }
  await options.onProgress?.('apply');
  await auditWrite(dir,'verified-proposal',verified);
  await markRun(dir,'proposal-ready');
  await auditWrite(dir,'timings',{...timing,totalMs:Math.round(performance.now()-started),selectionMs:selected.report.selectionMs});
  return verified;
 }catch(e){await auditWrite(dir,'error',{message:e.message,at:new Date().toISOString()});await markRun(dir,'generation-error');throw e;}
}
export function startGMWorker(store,{runner=runCodexGM,interval=1500,onEvent=()=>{}}={}) {
 let active=null,stopped=false,ticking=false;
 const tick=async()=>{
  if(stopped||ticking)return;ticking=true;
  try {
   for(const room of await store.list())if(!room.deletedAt&&!room.archivedAt)await store.connectionWrite?.(room.id,new Date().toISOString());
   if(active){const r=await store.get(active.roomId);if(r?.gmJob?.status!=='running'||r.gmJob.lease!==active.lease)active.controller.abort();return;}
   for(const room of await store.list()){
    if(room.gmJob?.status!=='queued')continue;const job=await claimJob(store,room.id);if(!job)continue;
    const controller=new AbortController();active={roomId:room.id,controller,lease:job.lease};
    if(stopped)controller.abort();onEvent('작업 시작');
    (async()=>{
     let runDir,proposal,error;
     try{if(controller.signal.aborted)throw Error('GM 실행기 종료');proposal=await runner(job.room,{signal:controller.signal,onRun:dir=>runDir=dir,onProgress:stage=>{onEvent(stage);return progressJob(store,room.id,job.lease,stage);}});}catch(e){error=e.message;}
     try{const result=await finishJob(store,room.id,job.lease,job.version,proposal,error);await recordApplication(runDir,result,error);onEvent(result?.status==='done'?'결과 반영 완료':'작업 종료 · 결과 확인 필요');}
     catch(e){console.error('GM 적용 또는 기록 저장 실패:',e.message);}
     finally{active=null;}
    })();break;
   }
  }finally{ticking=false;}
 };
 const timer=setInterval(()=>tick().catch(()=>{}),interval);
 recoverJobs(store).then(tick).catch(()=>{});
 return async()=>{stopped=true;clearInterval(timer);active?.controller.abort();while(ticking||active)await new Promise(resolve=>setTimeout(resolve,20));};
}
