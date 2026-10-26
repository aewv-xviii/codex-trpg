import {actorMapId,placeArrivingTokens} from './location-presentation.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const text=(v,max)=>typeof v==='string'&&v.length<=max?v.trim():fail('캠페인 설정의 입력 길이를 확인하세요.');
const limits={world:20000,bible:200000,gmInstructions:200000,openingPrompt:200000,caseTitle:100,caseScenario:200000};
export function setupIssues(r){
 const c=r.campaign,issues=[];
 if(!c.world?.trim()&&!c.bible?.trim())issues.push('캠페인 바이블을 불러오거나 세계관을 입력하세요.');
 if(!(c.rulebookIds?.length||c.rulebookId||(c.localBookIds??r.localLibrary?.books?.filter(b=>b.kind==='rule'&&b.emptyPages<b.pages).map(b=>b.id))?.length))issues.push('사용할 룰북을 선택하세요.');
 const party=r.characters.filter(x=>r.partyCharacterIds.includes(x.id)&&!x.isNPC);
 if(!party.length)issues.push('시작 파티에 플레이어 캐릭터를 등록하세요.');
 if(!r.economy?.enabled)issues.push('시작 소지금·물품에서 캠페인 경제를 설정하세요.');
 for(const x of party){
  const missing=['ST','DX','IQ','HT','Will','Per'].filter(k=>!x.fields?.some(f=>f.name===k&&/^\d+$/.test(String(f.value))&&Number(f.value)>0));
  if(missing.length)issues.push(`${x.name}: ${missing.join(', ')} 미입력`);
  if(!x.inventory?.trim())issues.push(`${x.name}: 시작 장비를 입력하세요. (없으면 ‘없음’)`);
  if(r.economy?.enabled&&!x.assets?.confirmed)issues.push(`${x.name}: 시작 소지금·물품을 확정하세요.`);
 }
 return issues;
}
export function campaignSetup(r,u,p){
 if(r.owner!==u.id)fail('방장만 캠페인 설정을 변경할 수 있습니다.',403);
 if(r.combat?.status==='active')fail('전투 종료 후 설정하세요.');
 const c=r.campaign;
 for(const [key,max] of Object.entries(limits))if(p[key]!==undefined){
  const value=text(p[key],max);
  if(value!==c[key]&&c.sourceFiles)delete c.sourceFiles[key];
  c[key]=value;
 }
 if(p.files!==undefined&&(!Array.isArray(p.files)||p.files.length>4))fail('캠페인 파일은 종류별로 하나씩 선택하세요.');
 const files=[...(p.files||[]),...(p.file!==undefined?[p.file]:[])];
 if(new Set(files.map(f=>f?.slot)).size!==files.length)fail('캠페인 파일은 종류별로 하나씩 선택하세요.');
 for(const f of files){
  if(!f||!['bible','gmInstructions','openingPrompt','caseScenario'].includes(f.slot))fail('캠페인 파일 종류를 선택하세요.');
  const name=text(f.name,200),content=text(f.content,limits[f.slot]);
  if(!/\.(txt|md|pdf)$/i.test(name)||!content)fail('내용이 있는 TXT·MD·PDF 파일을 선택하세요.');
  c[f.slot]=content;c.sourceFiles||={};c.sourceFiles[f.slot]={name,characters:content.length,uploadedAt:new Date().toISOString()};
 }
 if(p.rulebookIds!==undefined){
  if(!Array.isArray(p.rulebookIds)||p.rulebookIds.length>30||new Set(p.rulebookIds).size!==p.rulebookIds.length||p.rulebookIds.some(id=>!r.documents.some(d=>d.id===id&&d.visibility==='public'&&(!d.role||['rulebook','houseRule'].includes(d.role)))))fail('등록된 공개 룰북을 선택하세요.');
  if(JSON.stringify(c.rulebookIds)!==JSON.stringify(p.rulebookIds))r.rules.forEach(rule=>rule.status='draft');
  c.rulebookIds=p.rulebookIds;c.rulebookId=p.rulebookIds[0]||'';
 }
 if(p.localBookIds!==undefined){
  if(!Array.isArray(p.localBookIds)||p.localBookIds.length>100||new Set(p.localBookIds).size!==p.localBookIds.length||p.localBookIds.some(id=>!r.localLibrary?.books?.some(b=>b.id===id&&b.kind==='rule'&&b.emptyPages<b.pages)))fail('읽을 수 있는 로컬 룰북을 선택하세요.');
  if(JSON.stringify(c.localBookIds)!==JSON.stringify(p.localBookIds))r.rules.forEach(rule=>rule.status='draft');
  c.localBookIds=p.localBookIds;
 }
 c.setupVersion=1;c.setupSavedAt=new Date().toISOString();c.ready=false;
 const issues=setupIssues(r);
 if(p.ready){
  if(issues.length)fail(issues.join(' / '));
  const maps=new Map();
  for(const id of r.partyCharacterIds){const mapId=actorMapId(r,id);if(mapId){if(!maps.has(mapId))maps.set(mapId,[]);maps.get(mapId).push(id);}}
  for(const [mapId,ids] of maps)placeArrivingTokens(r,mapId,ids);
  c.ready=true;
 }
 return {issues,ready:c.ready};
}

export function setupCharacter(r,u,p){
 if(r.combat?.status==='active')fail('전투 종료 후 캐릭터를 설정하세요.');
 let c=p.id?r.characters.find(x=>x.id===p.id):null;
 if(p.id&&!c)fail('캐릭터를 찾을 수 없습니다.');
 if(c&&c.owner!==u.id)fail('본인 캐릭터만 수정할 수 있습니다.',403);
 if(!c&&r.characters.length>=20)fail('캐릭터 저장 한도입니다.');
 if(c&&r.actions.some(a=>a.actorId===c.id&&a.status!=='resolved'))fail('대기 행동을 먼저 완료하세요.');
 const fields=p.fields;
 if(!Array.isArray(fields)||fields.length>120||fields.some(f=>typeof f.name!=='string'||!f.name.trim()||f.name.length>60||typeof f.value!=='string'||f.value.length>200))fail('시트 항목을 확인하세요.');
 for(const k of ['maxHp','maxFp'])if(!Number.isInteger(p[k])||p[k]<1||p[k]>999)fail('최대 HP·FP는 1~999입니다.');
 const name=text(p.name,60);if(!name)fail('이름을 입력하세요.');
 const fresh=!c;
 const ownerId=fresh?(p.ownerId||u.id):c.owner;
 if(p.ownerId&&p.ownerId!==ownerId)fail('기존 캐릭터의 소유자는 변경할 수 없습니다.',403);
 if(fresh&&ownerId!==u.id&&r.owner!==u.id)fail('방장만 참가자에게 캐릭터를 등록할 수 있습니다.',403);
 if(!r.members.some(m=>m.id===ownerId))fail('캠페인 참가자를 선택하세요.');
 c||={id:crypto.randomUUID(),owner:ownerId,controllers:[],isNPC:false};
 Object.assign(c,{name,description:text(p.description||'',2000),inventory:text(p.inventory||'',4000),fields:fields.map(f=>({name:f.name.trim(),value:f.value.trim(),formula:''})),maxHp:p.maxHp,maxFp:p.maxFp,sheetRevision:(c.sheetRevision||0)+1});
 c.hp=fresh?p.maxHp:Math.min(c.hp,p.maxHp);c.fp=fresh?p.maxFp:Math.min(c.fp,p.maxFp);
 if(fresh){r.characters.push(c);if(r.partyCharacterIds.length<4)r.partyCharacterIds.push(c.id);}
 r.campaign.ready=false;
 return {characterId:c.id};
}
