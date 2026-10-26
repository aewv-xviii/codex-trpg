const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const mapPoint=(box,x,y)=>({x:clamp((x-box.left)/box.width,0,1),y:clamp((y-box.top)/box.height,0,1)});
export function rulerDistance(measurement,map){
 const {a,b}=measurement;
 const distance=Math.hypot((b.x-a.x)*map.columns,(b.y-a.y)*map.rows)*map.unit;
 return {distance,primary:distance.toFixed(1)+(map.distanceUnit==='yd'?' 야드':' m'),secondary:map.distanceUnit==='yd'?'≈ '+(distance*.9144).toFixed(2)+' m':''};
}
export function paintRuler(measurement,map){
 const scroll=document.getElementById('map-scroll'),board=document.getElementById('map-board');
 if(!scroll||!board)return;
 let layer=scroll.querySelector('.map-ruler');
 if(!measurement||!map){layer?.remove();return;}
 if(!layer){layer=document.createElement('div');layer.className='map-ruler';layer.innerHTML='<svg aria-hidden="true"><line class="ruler-shadow"/><line class="ruler-line"/><circle r="5"/><circle r="5"/></svg><div class="ruler-label" role="status"><small>직선거리</small><strong></strong><span></span></div>';scroll.append(layer);}
 const box=board.getBoundingClientRect(),viewport=scroll.getBoundingClientRect();
 const point=p=>({x:box.left-viewport.left+p.x*box.width,y:box.top-viewport.top+p.y*box.height});
 const a=point(measurement.a),b=point(measurement.b),value=rulerDistance(measurement,map);
 const svg=layer.querySelector('svg');svg.setAttribute('viewBox','0 0 '+viewport.width+' '+viewport.height);
 for(const line of svg.querySelectorAll('line'))for(const [key,v] of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y}))line.setAttribute(key,v);
 [...svg.querySelectorAll('circle')].forEach((el,i)=>{el.setAttribute('cx',i?b.x:a.x);el.setAttribute('cy',i?b.y:a.y);});
 const label=layer.querySelector('.ruler-label');label.querySelector('strong').textContent=value.primary;label.querySelector('span').textContent=value.secondary;
 label.style.left=clamp(b.x+16,8,viewport.width-label.offsetWidth-8)+'px';
 label.style.top=clamp(b.y-label.offsetHeight-16,8,viewport.height-label.offsetHeight-8)+'px';
}
