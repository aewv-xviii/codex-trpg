import {sameScene,actorPosition} from './awareness.mjs';
import {clearLine,yards} from '../public/play/exploration-geometry.js';
// Include authored enemies in this encounter, never turn every NPC into an enemy.
export function encounterEnemies(r,actor,target){
 return r.characters.filter(c=>c.id===target.id||c.isNPC&&!c.controllers?.length&&!r.partyCharacterIds?.includes(c.id)&&c.contentRole==='enemy'&&!(c.npcIntent?.scene===[r.chronicle?.activeCaseId,r.worldLibrary?.placeId,r.mapId,r.scene?.title].join('|')&&['neutral','defendOnly','endure','withdraw'].includes(c.npcIntent.stance))&&sameScene(r,actor.id,c.id)&&c.hp>0&&!['dead','dying','unconscious','withdrawn'].includes(c.combatState?.status)&&currentlyPresent(r,c,actor)&&connected(r,target,c));
}
function currentlyPresent(r,c,actor){
 if(r.worldLibrary)return sameScene(r,c.id,actor.id);
 return r.maps?.some(m=>m.id===r.mapId&&m.tokens.some(t=>t.characterId===c.id&&!t.hidden));
}
function connected(r,a,b){
 if(a.encounterId&&b.encounterId)return a.encounterId===b.encounterId;
 const m=r.maps?.find(m=>m.id===r.mapId),at=m?.tokens.find(t=>t.characterId===a.id),bt=m?.tokens.find(t=>t.characterId===b.id);
 // A wall/closed door separates encounters unless an authored group joins them.
 if(at&&bt&&m.exploration)return clearLine(m,at,bt);
 return true;
}
export function encounterDistance(r,actor,c,fallback){
 const a=actorPosition(r,actor.id),b=actorPosition(r,c.id),m=r.maps?.find(m=>m.id===a.mapId);
 if(m&&a.mapId===b.mapId&&a.x!==null&&b.x!==null)return yards(m,a,b);
 return fallback;
}
