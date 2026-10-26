// UI destination and server message type share one explicit mapping.
export function composerRoute(kind,target='@gm') {
 return kind==='dialogue'?'dialogue:'+target:kind==='request'?'request':'action';
}
export function parseComposerRoute(value) {
 if(value==='request')return {kind:'request',target:'@gm'};
 if(typeof value==='string'&&value.startsWith('dialogue:'))return {kind:'dialogue',target:value.slice(9)};
 return {kind:'action',target:'@gm'};
}
export function composerMessageRoute(value) {
 const {kind,target}=parseComposerRoute(value);
 return {kind,targetId:kind==='dialogue'&&target!=='@gm'?target:'',askGM:kind==='dialogue'&&target==='@gm'};
}
