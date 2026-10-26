import {portraitAssetId,portraitAssetUrl,PORTRAIT_MAX_BYTES} from '../public/play/portrait-image.js';
import {visibleRoom,requireMember,TableError} from './table-engine.mjs';
const fail=(m,status=400)=>{throw new TableError(m,status);};
const hex=buffer=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',value));
const scope='portrait-originals';
const portraits=room=>[...(room.characters||[]),...(room.cast||[])].flatMap(c=>c.portraits||[]).concat(Object.values(room.sceneArchive?.assets||{}).map(image=>({image})));
export async function uploadPortraitAsset(store,user,bytes,mime){
 if(!user?.id)fail('로그인이 필요합니다.',401);
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>PORTRAIT_MAX_BYTES)fail('초상화는 장당 10MB까지 원본으로 저장할 수 있습니다.',413);
 const png=[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n),jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const ascii=(start,end)=>String.fromCharCode(...bytes.subarray(start,end));
 const webp=ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';
 if(!({ 'image/png':png,'image/jpeg':jpeg,'image/webp':webp })[mime])fail('PNG, JPEG, WebP 원본 파일을 선택하세요.');
 const hash=await digest(bytes),id=await digest(new TextEncoder().encode(user.id+'\n'+hash));
 if(!await store.assetGet(id,scope)){
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  await store.assetPut(id,scope,JSON.stringify({owner:user.id,mime,size:bytes.length,hash,data:btoa(binary)}));
 }
 return {image:portraitAssetUrl(id),size:bytes.length,original:true};
}
export async function readPortraitAsset(store,user,id,roomId){
 if(!user?.id)fail('로그인이 필요합니다.',401);
 if(!/^[a-f0-9]{64}$/.test(id||''))fail('이미지를 찾을 수 없습니다.',404);
 const raw=await store.assetGet(id,scope);if(!raw)fail('이미지를 찾을 수 없습니다.',404);
 const record=JSON.parse(raw);
 if(record.owner!==user.id){
  const room=roomId&&await store.get(roomId);if(!room||room.deletedAt)fail('이미지를 찾을 수 없습니다.',404);
  requireMember(room,user);
  if(!portraits(visibleRoom(room,user)).some(p=>portraitAssetId(p.image)===id))fail('공개되지 않은 초상화입니다.',404);
 }
 return {mime:record.mime,bytes:Uint8Array.from(atob(record.data),c=>c.charCodeAt(0))};
}
export async function validatePortraitReferences(store,user,items,previous=[]){
 const retained=new Set(previous.map(p=>portraitAssetId(p.image)).filter(Boolean));
 for(const id of new Set((items||[]).map(p=>portraitAssetId(p.image)).filter(Boolean))){
  if(retained.has(id))continue;
  const raw=await store.assetGet(id,scope);if(!raw||JSON.parse(raw).owner!==user.id)fail('내가 업로드한 초상화만 새로 연결할 수 있습니다.',403);
 }
}
export function projectPortraitAssets(room){
 for(const p of portraits(room)){const id=portraitAssetId(p.image);if(id)p.image=portraitAssetUrl(id,room.id);}
 for(const [key,image] of Object.entries(room.sceneArchive?.assets||{})){const id=portraitAssetId(image);if(id)room.sceneArchive.assets[key]=portraitAssetUrl(id,room.id);}
}
// The binary endpoint is isolated from normal small JSON commands.
export async function readPortraitUpload(request){
 const reader=request.body?.getReader();if(!reader)fail('이미지 파일이 비어 있습니다.');
 const chunks=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>PORTRAIT_MAX_BYTES){await reader.cancel();fail('초상화는 장당 10MB까지 원본으로 저장할 수 있습니다.',413);}chunks.push(part.value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
