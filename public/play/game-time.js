// Message time is a snapshot of fictional time, never the wall clock or current room clock.
export function messageGameTime(message){
 const c=message?.gameClock;
 if(!c||!/^\d{4}-\d{2}-\d{2}$/.test(c.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.time))return {label:'시각 미기록',title:'이 메시지에는 게임 시각이 기록되지 않았습니다.'};
 return {label:c.time,title:c.date+' '+c.time+' · 게임 시각'};
}
