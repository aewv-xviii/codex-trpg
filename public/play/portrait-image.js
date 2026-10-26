export const PORTRAIT_MAX_BYTES=10*1024*1024;
export const portraitAssetId=value=>typeof value==='string'?/^\/api\/table\?portrait=([a-f0-9]{64})(?:&room=[a-f0-9-]{1,64})?$/.exec(value)?.[1]||'':'';
export const portraitAssetUrl=(id,room='')=>'/api/table?portrait='+id+(room?'&room='+room:'');
export async function uploadOriginalPortrait(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('PNG, JPEG, WebP 파일을 선택하세요.');
 if(!file.size||file.size>PORTRAIT_MAX_BYTES)throw Error('초상화는 장당 10MB까지 원본으로 저장할 수 있습니다.');
 const bitmap=await createImageBitmap(file);bitmap.close();
 const response=await fetch('/api/table?portrait=upload',{method:'POST',headers:{'Content-Type':file.type},body:file});
 const result=await response.json();if(!response.ok)throw Error(result.error||'초상화 업로드에 실패했습니다.');
 return result.image;
}
