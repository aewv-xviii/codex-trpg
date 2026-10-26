const fail=m=>{throw Error(m);};
const text=(v,max,empty=false)=>typeof v==='string'&&v.length<=max&&(empty||v.trim())?v.trim():fail('NPC 소지품의 이름·설명·위치를 확인하세요.');
const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max?v:fail('NPC 소지품 수량·현금을 확인하세요.');
// Missing is unknown, not an authored empty inventory. Never infer gear from prose.
export function normalizeNPCInventory(value){
 if(value==null)return null;
 if(typeof value!=='object'||Array.isArray(value)||typeof value.reviewed!=='boolean'||!Array.isArray(value.items)||value.items.length>60)fail('NPC 소지품 명세를 확인하세요.');
 const items=value.items.map(x=>({key:text(x.key,60),itemId:text(x.itemId||'',100,true),name:text(x.name,100),description:text(x.description||'',500,true),location:text(x.location||'',200,true),quantity:integer(x.quantity,99999)}));
 if(items.some(x=>!x.quantity)||new Set(items.map(x=>x.key)).size!==items.length)fail('소지품 키는 고유해야 하며 수량은 1 이상이어야 합니다.');
 return {reviewed:value.reviewed,won:integer(value.won,1e9),items};
}
