// Explicit roles keep character evidence out of the rulebook selection.
export const documentRoles=['rulebook','characterSheet','ability','houseRule','scenario','reference'];
export function normalizeReferences(r){
 const c=r.campaign;if(!c)return;
 for(const d of r.documents||[]){if(d.role)continue;if(d.id==='gyh-sheet-v2')d.role='characterSheet';else if(d.id==='gyh-aquarium-v14')d.role='ability';}
 const linked=[...new Set([...(c.rulebookIds||[]),c.rulebookId].filter(Boolean))],refs=linked.filter(id=>['characterSheet','ability','reference'].includes(r.documents.find(d=>d.id===id)?.role));
 if(refs.length){c.characterReferenceIds=[...new Set([...(c.characterReferenceIds||[]),...refs])];c.rulebookIds=linked.filter(id=>!refs.includes(id));c.rulebookId=c.rulebookIds[0]||'';}
}
export function referenceIds(r){return r.campaign?.characterReferenceIds||[];}
export function classifyDocument(r,u,p){
 if(u.id!==r.owner)throw Error('자료 분류는 방장만 변경할 수 있습니다.');
 if(['queued','running','applying'].includes(r.gmJob?.status))throw Error('진행 중인 GM 작업을 마친 뒤 자료를 분류하세요.');
 const d=r.documents.find(d=>d.id===p.documentId);if(!d||!documentRoles.includes(p.role)||typeof p.linked!=='boolean')throw Error('자료와 분류·연결 여부를 확인하세요.');
 d.role=p.role;const c=r.campaign;if(c.scenarioId===d.id)c.scenarioId='';
 c.rulebookIds=[...new Set([...(c.rulebookIds||[]),c.rulebookId].filter(id=>id&&id!==d.id))];c.characterReferenceIds=(c.characterReferenceIds||[]).filter(id=>id!==d.id);
 if(p.linked){if(d.role==='scenario')c.scenarioId=d.id;else if(['rulebook','houseRule'].includes(d.role)){if(d.visibility!=='public')throw Error('규칙 근거는 공개 자료여야 합니다.');c.rulebookIds.push(d.id);}else if(['characterSheet','ability','reference'].includes(d.role))c.characterReferenceIds.push(d.id);}
 c.rulebookId=c.rulebookIds[0]||'';return {documentId:d.id,role:d.role,linked:p.linked};
}
