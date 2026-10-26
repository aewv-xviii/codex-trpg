import {dialogueProjection} from './dialogue-context.mjs';
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
export function combatReactionProjection(snapshot){
 const projected=dialogueProjection(snapshot),room=projected.room,b=snapshot.combat;
 const ids=new Set(Object.keys(b?.fighters||{}));
 room.characters=snapshot.characters.filter(c=>ids.has(c.id)).map(c=>pick(c,['id','name','isNPC','owner','controllers','description','hp','maxHp','conditions','effects','injuries','combatState']));
 room.cast=[];
 room.combat={...pick(b,['id','status','reason','winnerTeam','round','roundSeconds','elapsedSeconds','pending']),fighters:structuredClone(b?.fighters||{})};
 room.messages=room.messages.slice(-8);
 delete room.economy;delete room.localRuleExcerpts;delete room.localRuleBooks;
 room.gmMemory=(room.gmMemory||[]).filter(m=>!m.subjectId||ids.has(m.subjectId));
 projected.report.omittedFields.push('equipment and economy','rule retrieval','non-participant characters');
 return projected;
}
