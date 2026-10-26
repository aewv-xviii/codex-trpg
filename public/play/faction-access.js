export function accessAllowed(r,requirements=[]){return requirements.every(q=>{
 const f=r.factions?.find(f=>f.id===q.factionId);return f&&f.score>=q.minimum;
});}
