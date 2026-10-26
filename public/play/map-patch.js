// Keep the board, images and unchanged tokens mounted across shared-state updates.
export function patchMap(canvas,html){
 const template=document.createElement('template');template.innerHTML=html;
 const next=template.content.querySelector('#map-board'),board=canvas.querySelector('#map-board');
 // Scene rendering replaces the board without changing the cached map markup.
 // A missing board must be mounted again even when that markup is unchanged.
 if(!board||!next){canvas.innerHTML=html;canvas._mapHTML=html;return;}
 const sync=(a,b)=>{
  for(const attr of [...a.attributes])if(!b.hasAttribute(attr.name))a.removeAttribute(attr.name);
  for(const attr of b.attributes)if(a.getAttribute(attr.name)!==attr.value)a.setAttribute(attr.name,attr.value);
 };
 // Camera position is local; the state projection does not own it.
 for(const key of ['left','top','--map-zoom'])next.style.setProperty(key,board.style.getPropertyValue(key));
 sync(board,next);
 const key=n=>['token','pin','fog'].map(k=>n.dataset[k]?k+':'+n.dataset[k]:'').find(Boolean)||n.tagName+':'+n.className;
 const existing=new Map([...board.children].map(n=>[key(n),n]));let before=board.firstElementChild;
 for(const desired of [...next.children]){
  const id=key(desired),node=existing.get(id)||desired;existing.delete(id);
  if(node!==desired){sync(node,desired);if(node.innerHTML!==desired.innerHTML)node.innerHTML=desired.innerHTML;}
  if(node!==before)board.insertBefore(node,before);before=node.nextElementSibling;
 }
 for(const node of existing.values())node.remove();
 for(const selector of ['.map-caption','.start-overlay']){
  const old=canvas.querySelector(selector),fresh=template.content.querySelector(selector);
  if(old?.outerHTML===fresh?.outerHTML)continue;
  if(old)fresh?old.replaceWith(fresh):old.remove();else if(fresh)canvas.append(fresh);
 }
 canvas._mapHTML=html;
}
export function fittedMap(width,height,aspect){
 const baseWidth=Math.min(width,height*aspect);
 return {baseWidth,panX:(width-baseWidth)/2,panY:(height-baseWidth/aspect)/2};
}
