// A nearby detached position belongs to the same scene, not another world region.
export function offMapPosition(r,id){
 const p=r.characters?.find(c=>c.id===id)?.offMapPosition;
 if(!p||p.caseId!==(r.chronicle?.activeCaseId||''))return null;
 if(r.worldLibrary){if(p.placeId!==(r.worldLibrary.characterPlaces?.[id]||r.worldLibrary.placeId))return null;}
 else if(p.mapId!==r.mapId)return null;
 return p;
}
export function offMapDistance(r,a,b){
 const x=offMapPosition(r,a),y=offMapPosition(r,b);if(!x&&!y)return null;
 if(a===b)return 0;
 // Two independently adjudicated rooftops have no measured relationship.
 if(x&&y)return Infinity;
 const p=x||y,other=x?b:a;
 if(r.worldLibrary&&(r.worldLibrary.characterPlaces?.[other]||r.worldLibrary.placeId)!==p.placeId)return Infinity;
 if(!r.worldLibrary&&!r.maps?.find(m=>m.id===p.mapId)?.tokens.some(t=>t.characterId===other))return Infinity;
 return p.distanceYards;
}
export function offMapLine(r,a,b){const d=offMapDistance(r,a,b);return d===null?null:Number.isFinite(d)&&!!(offMapPosition(r,a)||offMapPosition(r,b))?.canSeeScene;}
export function requireLocalAccess(r,...ids){if(ids.some(id=>offMapPosition(r,id)))throw Error('지도 밖 위치에서는 현장에 직접 접근해야 합니다. 먼저 복귀를 선언하세요.');}
