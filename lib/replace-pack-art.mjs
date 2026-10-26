import {requireOwner,requireRequestId,TableError} from './table-engine.mjs';
import {imageSource} from './presentation.mjs';
import {assetFingerprint,persistContentAssets} from './content-assets.mjs';

// Replace only prepared artwork. Immutable new URLs avoid stale browser caches;
// old blobs remain available for recovery and in-flight readers.
export async function replacePackArt(store,user,input,room){
 requireOwner(room,user);requireRequestId(input.requestId);
 const signature=await assetFingerprint(JSON.stringify({op:input.op,user:user.id,payload:input.payload}));
 const receipt=room.receipts[input.requestId];
 if(receipt){if(receipt.signature!==signature)throw new TableError('이미 사용한 요청 ID입니다.',409);return {room,result:receipt.result,duplicate:true};}
 if(input.expectedVersion!==room.version)throw new TableError('캠페인이 변경되었습니다. 다시 확인하세요.',409);
 if(room.archivedAt)throw new TableError('보관된 캠페인은 변경할 수 없습니다.',409);
 if(['queued','running','applying'].includes(room.gmJob?.status))throw new TableError('GM 처리가 끝난 뒤 이미지를 교체하세요.',409);
 const {packId,key,image}=input.payload,pack=room.contentPacks?.find(p=>p.id===packId);
 if(!pack||!Object.hasOwn(pack.assets,key))throw new TableError('등록된 이미지 키를 확인하세요.');
 const data=imageSource(image,false);if(!data.startsWith('data:'))throw new TableError('PNG·JPEG·WebP 파일이 필요합니다.');
 const oldId=pack.assets[key],fingerprint=await assetFingerprint(data);
 if(room.contentAssets[oldId]?.fingerprint===fingerprint)return {room,result:{assetId:oldId},duplicate:true};
 if(Object.keys(room.contentAssets).length>=120||Object.values(room.contentAssets).reduce((n,v)=>n+(typeof v==='string'?v.length:v.size),0)+data.length>20000000)throw new TableError('캠페인 이미지 한도를 초과합니다.');
 const id=crypto.randomUUID(),oldUrl=`/api/table?room=${room.id}&asset=${oldId}`,url=`/api/table?room=${room.id}&asset=${id}`;
 const rewrite=v=>typeof v==='string'?(v===oldId?id:v===oldUrl?url:v):Array.isArray(v)?v.map(rewrite):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rewrite(x)])):v;
 const next=structuredClone(room);
 for(const field of ['contentPacks','maps','characters','scene','scenePresets','sceneArchive','worldLibrary','checkpoints'])if(next[field])next[field]=rewrite(next[field]);
 next.contentAssets[id]=data;await persistContentAssets(store,next);
 const result={assetId:id,previousAssetId:oldId};next.version++;next.updatedAt=new Date().toISOString();next.receipts[input.requestId]={signature,result};
 if(!await store.save(next,room.version))throw new TableError('캠페인이 변경되어 이미지를 적용하지 않았습니다. 다시 확인하세요.',409);
 return {room:next,result,duplicate:false};
}
