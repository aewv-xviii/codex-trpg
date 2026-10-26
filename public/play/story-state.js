export const periods=[{name:'새벽',hour:0},{name:'오전',hour:6},{name:'오후',hour:12},{name:'저녁',hour:18},{name:'심야',hour:22}];
export const clockStamp=c=>c?Date.parse(`${c.date}T${c.time}:00Z`):NaN;
export function storyState(event,chronicle){
 if(event.status==='done')return 'done';
 if(event.status==='cancelled')return 'cancelled';
 if((event.requires||[]).some(id=>!chronicle.events.some(e=>e.id===id&&e.status==='done')))return 'locked';
 const now=clockStamp(chronicle.clock),at=clockStamp(event);
 if(!Number.isFinite(now)||now<at)return 'upcoming';
 return event.kind==='deadline'&&now>at?'overdue':'available';
}
export function remaining(event,clock){
 const minutes=Math.ceil((clockStamp(event)-clockStamp(clock))/60000);
 if(!Number.isFinite(minutes))return '시각 미설정';
 if(minutes<0)return '기한 경과';
 if(!minutes)return '지금';
 return minutes>=1440?`${Math.ceil(minutes/1440)}일 남음`:minutes>=60?`${Math.floor(minutes/60)}시간 ${minutes%60}분 남음`:`${minutes}분 남음`;
}
