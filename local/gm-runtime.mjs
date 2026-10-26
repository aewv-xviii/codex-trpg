import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function gmConfig(profile='play'){
 if(!['play','test'].includes(profile))throw Error('GM 용도는 play 또는 test를 지정하세요.');
 const c=JSON.parse(await readFile(new URL('./gm-config.json',import.meta.url),'utf8'))[profile];
 if(!['gpt-6-luna','gpt-6.1-sol'].includes(c.model)||!['low','medium','high','xhigh','max'].includes(c.reasoningEffort)||!['fast','standard'].includes(c.serviceTier))throw Error('GM 전용 모델 설정을 확인하세요.');
 return c;
}
export function modelArguments(c){
 return ['--model',c.model,'-c',`model_reasoning_effort="${c.reasoningEffort}"`,...(c.serviceTier==='fast'?['-c','service_tier="fast"','-c','features.fast_mode=true']:['-c','features.fast_mode=false'])];
}
export async function auditWrite(dir,name,value){
 await writeFile(join(dir,name+'.json'),JSON.stringify(value,null,2),'utf8');
}
export async function beginRun(room,base,profile='play'){
 const root=base||fileURLToPath(new URL('../.local-data/gm-runs/',import.meta.url));
 await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root,'run-'));
 await auditWrite(dir,'input',room);
 await auditWrite(dir,'run',{roomId:room.id,jobId:room.gmJob?.id,version:room.version,startedAt:new Date().toISOString(),profile,configuration:await gmConfig(profile),status:'started'});
 return dir;
}
export async function recordApplication(dir,result,error){
 if(dir){
  await auditWrite(dir,'application',{finishedAt:new Date().toISOString(),result:result??null,error:error?String(error):null});
  await markRun(dir,result?.ignored?'ignored':result?.status==='done'?'applied':result?'rejected':'application-unconfirmed');
 }
}
export async function markRun(dir,status){
 const run=JSON.parse(await readFile(join(dir,'run.json'),'utf8'));
 await auditWrite(dir,'run',{...run,status,updatedAt:new Date().toISOString()});
}
// Search selection is retrieval, not a rules ruling. Missing citations still block rules.
export function ruleQueries(room){
 const kind=room.gmJob?.kind;
 if(['dialogue','combatReaction'].includes(kind))return [];
 if(kind==='combatReview')return [room.combat?.pending?.defenseFailure?'Critical Miss Table unarmed parry defense':room.combat?.pending?.miss?'Critical Miss Table weapon':'Critical Hit Table head blow'];
 if(kind==='rules')return ['success roll effective skill critical failure','active defense dodge parry block','damage injury shock','성공 판정 방어 피해'];
 const actions=room.actions.filter(a=>a.status==='pending'&&(!room.gmJob?.actionIds||room.gmJob.actionIds.includes(a.id))).map(a=>a.text);
 if(kind==='request')actions.push(room.gmJob.requestText||'');
 if(kind==='narration')return [];
 const text=actions.join(' '),queries=[];
 for(const [pattern,query] of [
  [/흥정|상업|값.*깎|가격.*협상|merchant|bargain/i,'Merchant'],
  [/흥정|상업|빠른\s*승부|quick\s+contests?|bargain/i,'Quick Contests'],
  [/소매치기|주머니|지갑|pickpocket/i,'Pickpocket'],
  [/슬쩍|훔치|절도|filch/i,'Filch Pickpocket'],
  [/자물쇠|잠금.*따|lockpick/i,'Lockpicking'],
  [/곡예|acrobat/i,'Acrobatics'],
  [/등반|기어오르|climb/i,'Climbing'],
  [/응급|치료|first.?aid/i,'First Aid'],
  [/공격|명중|attack/i,'attack roll hit location'],
  [/방어|회피|막기|피하기|defen|dodge|parry/i,'active defense dodge parry block'],
  [/피해|부상|관통|damage|injur/i,'damage resistance injury wounding modifier'],
  [/은신|잠입|숨|stealth/i,'Stealth concealment vision'],
  [/조사|관찰|탐색|수색|search|observation/i,'Perception Search Observation'],
  [/설득|협상|위협|협박|허세|기만|속이|거짓말|외교|reaction|diplomacy|intimidation|fast.?talk/i,'Influence reaction Diplomacy Intimidation Fast-Talk'],
  [/판정|기능|roll|skill/i,'success roll effective skill critical success failure']
 ])if(pattern.test(text))queries.push(query);
 for(const action of actions)queries.push(action.slice(0,100));
 return [...new Set(queries)].slice(0,8);
}
