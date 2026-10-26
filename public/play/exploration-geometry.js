// Data-only maps. Shared by the pack validator, preview and authoritative server.
const fail=m=>{throw Object.assign(Error(m),{status:400});};
const number=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b?v:fail('탐색 지도 수치를 확인하세요.');
const text=(v,n=100)=>typeof v==='string'&&v.length<=n?v:fail('탐색 지도 텍스트를 확인하세요.');
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,59}$/.test(v)?v:fail('탐색 요소 ID를 확인하세요.');
const list=(v,n)=>Array.isArray(v)&&v.length<=n?v:fail('탐색 요소 개수를 확인하세요.');
const unique=a=>new Set(a.map(x=>x.id)).size===a.length?a:fail('탐색 요소 ID가 중복됩니다.');
export function normalizeExploration(v,columns,rows){
 if(v===undefined||v===null)return null;
 if(!v||typeof v!=='object'||Array.isArray(v)||columns>40||rows>40)fail('탐색 지도는 최대 40×40칸입니다.');
 const point=p=>({x:number(p?.x,0,1),y:number(p?.y,0,1)});
 const walls=unique(list(v.walls||[],80).map(w=>{const a=point(w.a),b=point(w.b);if(a.x===b.x&&a.y===b.y)fail('벽의 길이가 필요합니다.');return {id:id(w.id),a,b,door:w.door===true,open:w.door===true&&w.open===true,locked:w.locked===true,name:text(w.name||'문')};}));
 const points=unique(list(v.points||[],40).map(p=>{
  if(!['automatic','skill','gm'].includes(p.mode||'automatic'))fail('조사 방식은 automatic, skill, gm입니다.');
  const minutes=number(p.minutes??5,0,120);if(!Number.isInteger(minutes))fail('조사 시간은 정수 분입니다.');
  const check=p.mode==='skill'?{field:text(p.check?.field,100),modifier:number(p.check?.modifier??0,-20,20)}:null;
  if(check&&!Number.isInteger(check.modifier))fail('판정 보정은 정수입니다.');
  return {id:id(p.id),...point(p),name:text(p.name),description:text(p.description||'',2000),result:text(p.result||'',4000),mode:p.mode||'automatic',check,minutes,hidden:p.hidden===true,requires:list(p.requires||[],20).map(id),reveal:list(p.reveal||[],20).map(id)};
 }));
 for(const p of points)if([...p.requires,...p.reveal].some(k=>k===p.id||!points.some(q=>q.id===k)))fail('조사 대상 연결을 확인하세요.');
 const visits=new Set(),active=new Set();function visit(p){if(active.has(p.id))fail('조사 선행 조건이 순환합니다.');if(visits.has(p.id))return;active.add(p.id);p.requires.forEach(k=>visit(points.find(q=>q.id===k)));active.delete(p.id);visits.add(p.id);}points.forEach(visit);
 const bounds=b=>{const a=point(b?.min),z=point(b?.max);if(a.x>=z.x||a.y>=z.y)fail('공간 영역의 최소·최대 좌표를 확인하세요.');return {min:a,max:z};};
 const areas=unique(list(v.areas||[],40).map(a=>{if(!['room','corridor','outdoor'].includes(a.kind))fail('공간 종류를 확인하세요.');return {id:id(a.id),name:text(a.name),kind:a.kind,bounds:bounds(a.bounds),description:text(a.description||'',1000)};}));
 const covers=unique(list(v.covers||[],40).map(c=>{if(typeof c.blocksMovement!=='boolean'||typeof c.blocksVision!=='boolean')fail('엄폐물의 이동·시야 차단 여부를 명시하세요.');return {id:id(c.id),name:text(c.name),bounds:bounds(c.bounds),heightYards:number(c.heightYards,0,100),blocksMovement:c.blocksMovement,blocksVision:c.blocksVision,description:text(c.description||'',1000)};}));
 unique([...walls,...points,...areas,...covers]);
 return {sight:number(v.sight??10,1,30),secondsPerCell:number(v.secondsPerCell??5,1,60),entry:point(v.entry||{x:.15,y:.8}),walls,points,areas,covers};
}
export const cell=(m,p)=>({col:Math.min(m.columns-1,Math.max(0,Math.floor(p.x*m.columns))),row:Math.min(m.rows-1,Math.max(0,Math.floor(p.y*m.rows)))});
export const index=(m,p)=>{const c=cell(m,p);return c.row*m.columns+c.col;};
export const center=(m,i)=>({x:(i%m.columns+.5)/m.columns,y:(Math.floor(i/m.columns)+.5)/m.rows});
export const yards=(m,a,b)=>Math.hypot((a.x-b.x)*m.columns,(a.y-b.y)*m.rows)*m.unit;
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function intersects(a,b,c,d){
 const e=1e-9,on=(p,q,r)=>Math.abs(cross(p,q,r))<e&&r.x>=Math.min(p.x,q.x)-e&&r.x<=Math.max(p.x,q.x)+e&&r.y>=Math.min(p.y,q.y)-e&&r.y<=Math.max(p.y,q.y)+e;
 return cross(a,b,c)*cross(a,b,d)<-e&&cross(c,d,a)*cross(c,d,b)<-e||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}
export function clearLine(m,a,b,ignore=''){
 if(a.x===b.x&&a.y===b.y)return true;
 return !lineBlockers(m,a,b,'vision',ignore).length;
}
export const insideBounds=(p,b)=>p.x>=b.min.x&&p.x<=b.max.x&&p.y>=b.min.y&&p.y<=b.max.y;
export function lineBlockers(m,a,b,mode='vision',ignore=''){
 const walls=(m.exploration?.walls||[]).filter(w=>w.id!==ignore&&!(w.door&&w.open)&&intersects(a,b,w.a,w.b));
 const covers=(m.exploration?.covers||[]).filter(c=>{
  if(c.id===ignore||!(mode==='movement'?c.blocksMovement:c.blocksVision))return false;
  const {min,max}=c.bounds,p=[min,{x:max.x,y:min.y},max,{x:min.x,y:max.y}];
  return insideBounds(a,c.bounds)||insideBounds(b,c.bounds)||p.some((q,i)=>intersects(a,b,q,p[(i+1)%4]));
 });
 return [...walls,...covers].map(x=>x.id);
}
export const clearMovement=(m,a,b)=>!lineBlockers(m,a,b,'movement').length;
export function sightCells(m,origins){
 const seen=new Set();if(!m.exploration)return seen;
 for(const o of origins)for(let i=0;i<m.columns*m.rows;i++){const p=center(m,i);if(yards(m,o,p)<=m.exploration.sight&&clearLine(m,o,p))seen.add(i);}
 return seen;
}
export function findPath(m,from,to){
 return findPaths(m,from,[to])[0];
}
export function findPaths(m,from,destinations){
 const start=index(m,from),ends=destinations.map(to=>index(m,to)),pending=new Set(ends.filter(i=>i!==start)),queue=[start],prev=new Map([[start,null]]);
 for(let n=0;n<queue.length&&pending.size;n++){
  const i=queue[n],x=i%m.columns,y=Math.floor(i/m.columns);
  for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){const nx=x+dx,ny=y+dy,j=ny*m.columns+nx;
   if(nx<0||nx>=m.columns||ny<0||ny>=m.rows||prev.has(j))continue;
   if(lineBlockers(m,i===start?from:center(m,i),center(m,j),'movement').length)continue;
   prev.set(j,i);queue.push(j);pending.delete(j);
  }
 }
 return ends.map(end=>{if(!prev.has(end))return null;const path=[];for(let i=end;i!==start;i=prev.get(i))path.unshift(center(m,i));return path;});
}
