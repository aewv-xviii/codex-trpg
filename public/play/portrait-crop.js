const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Full-body NPC artwork uses an upper-center head crop for small round icons.
// Explicit artist/user framing always wins. This is a preset, not face detection.
export function faceTokenCrop(width,height){const side=Math.min(width,height)*.4;return {x:(width-side)/(2*width),y:0,w:side/width,h:side/height};}
export function portraitMarkup(p,alt='',kind='portrait'){
 const face=kind==='token'&&!p.tokenCrop&&p.tokenFocus==='face',square=kind==='token'&&(!!p.tokenCrop||face),c=square?p.tokenCrop:p.crop;
 const style=face?'width:250%;height:250%;left:-75%;top:0;object-fit:cover;object-position:center top;':c?`width:${100/c.w}%;height:${100/c.h}%;left:${-100*c.x/c.w}%;top:${-100*c.y/c.h}%;object-fit:fill;`:'';
 return `<span class="portrait-art${square?' token-art':''}"><img src="${esc(p.image)}" alt="${esc(alt)}" draggable="false" style="${style}"></span>`;
}
// Store a source rectangle rather than another bitmap, so saved framing remains editable.
export async function cropEditor(container,portrait,onApply,onCancel,options={}){
 container.hidden=false;
 container.innerHTML='<p class="fine">이미지를 불러오는 중…</p>';
 const img=new Image();img.src=portrait.image;await img.decode();
 if(!container.isConnected)return;
 const token=options.kind==='token',ratio=token?1:.75,baseW=Math.min(1,ratio*img.naturalHeight/img.naturalWidth),baseH=baseW*img.naturalWidth/(ratio*img.naturalHeight);
 const saved=token?(portrait.tokenCrop||(portrait.tokenFocus==='face'?faceTokenCrop(img.naturalWidth,img.naturalHeight):null)):portrait.crop;
 let rect=saved?{...saved}:{x:(1-baseW)/2,y:(1-baseH)/2,w:baseW,h:baseH},drag=null;
 const original=()=>({x:(1-baseW)/2,y:(1-baseH)/2,w:baseW,h:baseH});
 const clamp=()=>{rect.x=Math.max(0,Math.min(1-rect.w,rect.x));rect.y=Math.max(0,Math.min(1-rect.h,rect.y));};
 container.innerHTML=`<div class="crop-heading"><h3>${token?'토큰 아이콘 · 1:1':'시트·하단 초상화 · 3:4'}</h3><p>사진을 드래그하거나 휠로 확대하세요. 장면에서는 원본 전체를 표시합니다.</p></div><div class="crop-layout"><div class="crop-viewport" style="aspect-ratio:${ratio}" tabindex="0" role="group" aria-label="초상화 자르기 · 드래그 또는 방향키로 이동"></div><div class="crop-controls"><label>확대 <output id="crop-zoom-value"></output><input id="crop-zoom" aria-label="초상화 확대" type="range" min="1" max="4" step=".01"></label><label>좌우 위치<input id="crop-x" type="range" min="0" max="100" step=".1"></label><label>상하 위치<input id="crop-y" type="range" min="0" max="100" step=".1"></label><small>${token?'원형 토큰':'시트 초상화'} 미리보기</small><span class="${token?'crop-token-preview portrait-avatar':'crop-sheet-preview'}"></span></div></div><div class="owner-tools"><button type="button" data-crop-reset>구도 초기화</button><button type="button" data-crop-cancel>취소</button><button type="button" class="primary" data-crop-apply>${esc(options.applyLabel||'구도 적용')}</button></div>`;
 const view=container.querySelector('.crop-viewport'),zoom=container.querySelector('#crop-zoom'),x=container.querySelector('#crop-x'),y=container.querySelector('#crop-y');
 const paint=()=>{
  clamp();const markup=portraitMarkup({...portrait,[token?'tokenCrop':'crop']:rect},'편집 중인 초상화',token?'token':'portrait');
  view.innerHTML=markup;container.querySelector(token?'.crop-token-preview':'.crop-sheet-preview').innerHTML=markup;
  zoom.value=baseW/rect.w;container.querySelector('output').textContent=Math.round(baseW/rect.w*100)+'%';
  x.disabled=rect.w>=.99999;y.disabled=rect.h>=.99999;
  x.value=x.disabled?50:rect.x/(1-rect.w)*100;y.value=y.disabled?50:rect.y/(1-rect.h)*100;
 };
 const scale=value=>{const cx=rect.x+rect.w/2,cy=rect.y+rect.h/2;value=Math.max(1,Math.min(4,value));rect.w=baseW/value;rect.h=baseH/value;rect.x=cx-rect.w/2;rect.y=cy-rect.h/2;paint();};
 zoom.oninput=()=>scale(Number(zoom.value));
 x.oninput=()=>{rect.x=Number(x.value)/100*(1-rect.w);paint();};
 y.oninput=()=>{rect.y=Number(y.value)/100*(1-rect.h);paint();};
 view.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();view.focus({preventScroll:true});drag={id:e.pointerId,x:e.clientX,y:e.clientY,rect:{...rect},box:view.getBoundingClientRect()};view.setPointerCapture(e.pointerId);};
 view.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;rect.x=drag.rect.x-(e.clientX-drag.x)/drag.box.width*rect.w;rect.y=drag.rect.y-(e.clientY-drag.y)/drag.box.height*rect.h;paint();};
 view.onpointerup=view.onpointercancel=()=>{drag=null;};
 view.addEventListener('wheel',e=>{e.preventDefault();scale(baseW/rect.w*Math.exp(-e.deltaY*.001));},{passive:false});
 view.onkeydown=e=>{const d={ArrowLeft:[.02,0],ArrowRight:[-.02,0],ArrowUp:[0,.02],ArrowDown:[0,-.02]}[e.key];if(d){e.preventDefault();rect.x+=d[0]*rect.w;rect.y+=d[1]*rect.h;paint();}};
 container.querySelector('[data-crop-reset]').onclick=()=>{rect=original();paint();};
 container.querySelector('[data-crop-cancel]').onclick=()=>{container.hidden=true;onCancel();};
 container.querySelector('[data-crop-apply]').onclick=()=>{container.hidden=true;onApply({...rect});};
 paint();
}
