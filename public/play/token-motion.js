// Transient previews never enter the persistent-command retry queue.
export function motionStream(send,base,onFailure=()=>{}){
 let lease,seq=0,latest,pending=false,closed=false,timer,failed=false,paused=false;
 async function tick(){
  if(closed||paused||pending||failed||!latest)return;
  pending=true;
  try{
   const point=latest;
   const result=await send(lease?'motionUpdate':'motionBegin',{...base,...point,...(lease?{lease,seq:++seq}:{})});
   lease??=result.lease;
  }catch{failed=true;if(!closed&&!paused)onFailure();}
  finally{
   pending=false;
   if(closed){if(lease)send('motionEnd',{id:base.id,lease}).catch(()=>{});}
   else if(!failed&&!paused)timer=setTimeout(tick,300);
  }
 }
 return {
  pause(){paused=true;clearTimeout(timer);},
  point(x,y){latest={x,y};if(!pending&&!timer&&!failed&&!closed)tick();},
  stop(){closed=true;clearTimeout(timer);if(lease&&!pending)send('motionEnd',{id:base.id,lease}).catch(()=>{});},
 };
}
export const matchingMotion=(motion,map,token)=>!!motion&&motion.mapId===map?.id&&motion.id===token?.id&&motion.from.x===token.x&&motion.from.y===token.y;
