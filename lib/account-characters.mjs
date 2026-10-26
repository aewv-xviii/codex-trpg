import {validatePortraitReferences} from './portrait-assets.mjs';
import {createRoom,mutateRoom,requireMember,requireRequestId,TableError} from './table-engine.mjs';
const fail=(m,s=400)=>{throw new TableError(m,s);};
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
export function originalProfile(c){
 const out={};
 for(const k of ['name','description','maxHp','maxFp','fields','inventory','connections','portraits','expressionId'])if(c[k]!==undefined)out[k]=structuredClone(c[k]);
 return {...out,hp:c.maxHp,fp:c.maxFp,conditions:'',sheetRevision:0};
}
const publicRecord=c=>({id:c.id,owner:c.owner,version:c.version,profile:c.profile,updatedAt:c.updatedAt});
function sizeCheck(c){if(new TextEncoder().encode(JSON.stringify(c)).length>1800000)fail('계정 캐릭터의 초상화 용량이 큽니다. 이미지 수나 크기를 줄여주세요.');}
export async function ensureOriginal(store,c){
 if(c.isNPC||c.practice||!store.accountGet)return null;
 const id=c.accountId||c.id;let found=await store.accountGet(id);
 if(found)return found;
 const record={id,owner:c.owner,version:0,profile:originalProfile(c),receipts:{},updatedAt:new Date().toISOString()};
 sizeCheck(record);await store.accountCreate(record);return store.accountGet(id);
}
export async function accountRequest(store,user,input){
 const {op,payload:p={},requestId}=input;
 if(op==='accountList'){
  // Migrate only the caller's PCs. Never overwrite an existing original.
  for(const r of await store.list())if(!r.deletedAt)for(const c of r.characters||[])if(c.owner===user.id)await ensureOriginal(store,c);
  return {characters:(await store.accountList(user.id)).filter(c=>!c.deletedAt).map(publicRecord),me:user};
 }
 if(op==='accountGet'){
  const c=await store.accountGet(p.id);if(!c||c.deletedAt||c.owner!==user.id)fail('내 보관함의 캐릭터를 찾을 수 없습니다.',404);
  return {character:publicRecord(c)};
 }
 requireRequestId(requestId);
 const signature=await digest(JSON.stringify({op,p,user:user.id}));
 if(op==='accountCreate'){
  const id=await digest(JSON.stringify([user.id,requestId]));
  const previous=await store.accountGet(id);
  if(previous){if(previous.deletedAt||previous.creationSignature!==signature)fail('이미 사용한 요청입니다.',409);return {character:publicRecord(previous),duplicate:true};}
  const sandbox=createRoom(user),created=mutateRoom(sandbox,user,{op:'createCharacter',payload:{name:p.name,description:p.description||''},expectedVersion:0,requestId}).room.characters[0];
  created.fields=sandbox.campaign.sheetTemplate;
  const record={id,owner:user.id,version:0,profile:originalProfile(created),creationSignature:signature,receipts:{},updatedAt:new Date().toISOString()};
  await store.accountCreate(record);
  const saved=await store.accountGet(id);
  if(saved.creationSignature!==signature||saved.deletedAt)fail('이미 사용한 요청입니다.',409);
  return {character:publicRecord(saved)};
 }
 let c=await store.accountGet(p.id);
 if(!c||c.owner!==user.id)fail('내 보관함의 캐릭터를 찾을 수 없습니다.',404);
 if(c.receipts?.[requestId]){
  if(c.receipts[requestId]!==signature)fail('이미 사용한 요청 ID입니다.',409);
  return c.deletedAt?{deletedCharacterId:c.id,duplicate:true}:{character:publicRecord(c),duplicate:true};
 }
 if(c.deletedAt)fail('삭제한 원본입니다.',404);
 if(p.version!==c.version)fail('보관함 원본이 변경되었습니다. 다시 열어 최신 내용을 확인하세요.',409);
 const next=structuredClone(c);
 if(op==='accountDelete'){
  if(p.confirmName!==c.profile.name)fail('캐릭터 이름을 정확히 입력하세요.');
  delete next.profile;next.deletedAt=new Date().toISOString();
 }else if(op==='accountCapture'){
  const r=await store.get(p.roomId);if(!r||r.deletedAt)fail('세션을 찾을 수 없습니다.',404);requireMember(r,user);
  const character=r.characters.find(x=>x.id===p.characterId&&x.owner===user.id&&!x.isNPC);
  if(!character||(character.accountId||character.id)!==c.id)fail('내 원본에 연결된 캐릭터만 반영할 수 있습니다.',403);
  if(r.version!==p.roomVersion)fail('세션 캐릭터가 변경되었습니다. 다시 확인하세요.',409);
  next.profile=originalProfile(character);
 }else if(op==='accountUpdate'){
  if(!['character','sheet','portraits','resource'].includes(p.action))fail('지원하지 않는 원본 편집입니다.');
  const sandbox=createRoom(user);sandbox.characters=[{...c.profile,id:c.id,owner:user.id}];
  const result=mutateRoom(sandbox,user,{op:p.action,payload:{...p.values,characterId:c.id},expectedVersion:0,requestId});
  next.profile=originalProfile(result.room.characters[0]);
  await validatePortraitReferences(store,user,next.profile.portraits,c.profile.portraits);
 }else fail('지원하지 않는 보관함 작업입니다.');
 next.version++;next.updatedAt=new Date().toISOString();next.receipts[requestId]=signature;
 sizeCheck(next);
 if(!await store.accountSave(next,c.version))fail('보관함 원본이 변경되었습니다. 다시 확인하세요.',409);
 return next.deletedAt?{deletedCharacterId:c.id}:{character:publicRecord(next)};
}
