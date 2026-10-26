export function magazineGroups(c,items=[]){
 const w=c.combatProfile?.weapon||{},groups=new Map();
 for(const m of c.assets?.magazines||[]){
  const capacity=m.capacity||(m.weaponName===w.name?w.magazineCapacity||w.capacity:null);
  const full=capacity&&m.rounds===capacity,empty=m.rounds===0;
  const key=full||empty?JSON.stringify([m.itemId,m.weaponKey||m.weaponName,empty?'':m.ammoItemId,capacity,m.kind||'magazine',m.rounds]):m.id;
  if(groups.has(key)){groups.get(key).count++;groups.get(key).ids.push(m.id);continue;}
  groups.set(key,{...m,ids:[m.id],capacity,count:1,full,empty});
 }
 for(const item of items){const count=c.assets?.items?.[item.id]||0;if(count&&item.magazineSpec){const spec=item.magazineSpec,key=JSON.stringify([item.id,spec.weaponKey||spec.weaponName,'',spec.capacity,spec.kind||'magazine',0]);if(groups.has(key))groups.get(key).count+=count;else groups.set(key,{...spec,itemId:item.id,weaponName:spec.weaponName||item.name,rounds:0,count,empty:true});}}
 return [...groups.values()];
}
