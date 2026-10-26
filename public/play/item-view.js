// Presentation metadata is independent of rulebook/catalog IDs and may be replaced by art later.
export const itemKind = i => i?.kind==='ammo'?'탄약':i?.kind==='consumable'?'소모품':'장비';
export function itemSymbol(i={}) {
 const n=i.baseName||i.name||'';
 if(/탄창/.test(n))return 'magazine';
 if(i.kind==='ammo'||/탄약|총알/.test(n))return 'ammo';
 if(/나이프|단검|칼/.test(n))return 'knife';
 if(/권총|카빈|총|Uzi|uzi|우지/.test(n))return 'gun';
 if(/붕대|응급|약|의료/.test(n))return 'medical';
 if(/생수|물|음료|병/.test(n))return 'bottle';
 if(/손전등|랜턴/.test(n))return 'flashlight';
 if(/식사|식량|음식/.test(n))return 'food';
 if(/비닐|봉지/.test(n))return 'plastic';
 if(/공구|드라이버|도구/.test(n))return 'tool';
 if(/폰|전화|녹음/.test(n))return 'phone';
 if(/가방|백팩/.test(n))return 'bag';
 if(/열쇠|자물쇠/.test(n))return 'key';
 if(/코트|의복|장갑|방어|옷/.test(n))return 'coat';
 if(/노트|문서|영수증|지도/.test(n))return 'document';
 return 'box';
}
const paths={knife:'M5 20l5-5m-3-2 4 4M9 13 20 3c1 6-3 10-7 12z',gun:'M3 7h17v5H11l-2 7H5l2-8H3z M15 12v3h-4',ammo:'M6 20V9l3-5 3 5v11z M15 20V8l3-5 3 5v12z',magazine:'M7 3h10l-2 18H5z M8 7h6 M8 11h5 M7 15h5',medical:'M4 5h16v15H4z M9 5V2h6v3 M12 9v7 M8.5 12.5h7',bottle:'M10 2h4v5l3 4v10H7V11l3-4z M8 13h8',phone:'M7 3h10v18H7z M9 6h6v8H9z M11 18h2',bag:'M5 8h14v13H5z M8 8V4h8v4 M8 13h8v5H8z',key:'M9 14a5 5 0 1 1 3-3l9 9h-4v-3h-3z',coat:'M8 3l4 3 4-3 6 6-4 3-2-3v12H8V9l-2 3-4-3z M12 6v15',document:'M5 2h10l4 4v16H5z M14 2v5h5 M8 11h8 M8 15h8 M8 18h5',box:'M3 7l9-5 9 5v11l-9 5-9-5z M3 7l9 5 9-5 M12 12v11'};
Object.assign(paths,{flashlight:'M9 11h6v11H9z M9 11 5 4h14l-4 7 M5 4V1h14v3 M10 15h4',food:'M4 10h16v11H4z M3 7h18v3H3z M8 7V4h8v3 M8 14h8 M8 17h5',plastic:'M5 3h4v5h6V3h4v18H5z M8 13l4 4 4-4',tool:'M14 2a6 6 0 0 0-5 8L2 17l5 5 7-7a6 6 0 0 0 8-7l-5 4-5-5z'});
export function itemIcon(i) {return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${'<path d="'+paths[itemSymbol(i)]+'"/>'}</svg>`;}
export const locationOf=(r,id)=>r.worldLibrary?.characterPlaces?.[id]||r.worldLibrary?.placeId||'';
export const baseHere=(r,c)=>{const b=r.economy?.bases?.[c?.id];return !!b&&(b.placeId?b.placeId===locationOf(r,c.id):!locationOf(r,c.id)&&b.mapId===r.mapId);};
export const looseHere=(r,c,x)=>!x.recovered&&x.located&&x.placeId===locationOf(r,c.id)&&(!x.mapId||x.mapId===r.mapId);
