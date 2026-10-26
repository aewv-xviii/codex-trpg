// Store identifiers only. No dialogue or private story content goes into local storage.
export function readingKey(account,room){return 'night-reading/v1/'+encodeURIComponent(account||'local')+'/'+encodeURIComponent(room?.id||'')+'/'+encodeURIComponent(room?.chronicle?.activeCaseId||'');}
export function loadReading(key,storage){try{const p=JSON.parse(storage.getItem(key));return p&&typeof p.messageId==='string'?{...p,restored:true}:undefined;}catch{return undefined;}}
export function saveReading(key,value,storage){try{storage.setItem(key,JSON.stringify(value));}catch{/* Reading still works when storage is unavailable. */}}
