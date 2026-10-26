// Keep existing message nodes, expanded details and selection when unrelated state changes.
const caches=new WeakMap();
export function patchChatLog(log,entries,empty){
 let cache=caches.get(log);if(!cache){cache=new Map();caches.set(log,cache);}
 if(!entries.length){if(log.dataset.empty!==empty){log.innerHTML=empty;log.dataset.empty=empty;}cache.clear();return;}
 if(log.dataset.empty!==undefined){log.replaceChildren();delete log.dataset.empty;}
 const ids=new Set(entries.map(e=>e.id));
 for(const [id,item] of cache)if(!ids.has(id)){item.node.remove();cache.delete(id);}
 let next=log.firstChild;
 for(const entry of entries){
  let item=cache.get(entry.id);
  if(!item||item.html!==entry.html){const template=document.createElement('template');template.innerHTML=entry.html;const node=template.content.firstElementChild;
   if(item){const open=[...item.node.querySelectorAll('details')].map(d=>d.open);node.querySelectorAll('details').forEach((d,i)=>d.open=!!open[i]);if(next===item.node)next=node;item.node.replaceWith(node);}
   item={html:entry.html,node};cache.set(entry.id,item);
  }
  if(item.node!==next)log.insertBefore(item.node,next);next=item.node.nextSibling;
 }
}
