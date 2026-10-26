import {patchChatLog} from './chat-log.js';
const states=new WeakMap();
export function renderChatHistory(log,messages,key,entry,empty){
 let state=states.get(log);
 if(!state||state.key!==key){state={key,limit:150,latest:'',unread:false};states.set(log,state);}
 const atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<80;
 if(!atBottom&&state.firstId){const start=messages.findIndex(m=>m.id===state.firstId);if(start>=0)state.limit=Math.max(state.limit,messages.length-start);}
 const latest=messages.at(-1)?.id||'',changed=state.latest&&latest!==state.latest;
 if(changed&&!atBottom)state.unread=true;
 if(atBottom)state.unread=false;
 const paint=(prepend=false,follow=atBottom)=>{
  const anchor=[...log.children].find(n=>n.classList.contains('chat-entry')&&n.getBoundingClientRect().bottom>log.getBoundingClientRect().top+2),top=anchor?.getBoundingClientRect().top;
  const rows=messages.slice(-state.limit).map(entry);
  if(messages.length>state.limit)rows.unshift({id:'history:older',html:'<button class="history-more" data-history-older>과거 기록 더 보기</button>'});
  patchChatLog(log,rows,empty);
  state.firstId=messages.slice(-state.limit)[0]?.id;
  if(prepend&&anchor?.isConnected)log.scrollTop+=anchor.getBoundingClientRect().top-top;
  else if(follow)log.scrollTop=log.scrollHeight;
 };
 paint(false,!state.latest||atBottom);state.latest=latest;
 let jump=log.parentElement.querySelector('[data-history-latest]');
 if(!jump){jump=document.createElement('button');jump.dataset.historyLatest='';jump.className='history-latest';log.after(jump);}
 const update=()=>{const away=log.scrollHeight-log.scrollTop-log.clientHeight>=80;if(!away)state.unread=false;jump.hidden=!away;jump.textContent=state.unread?'새 메시지로 이동 ↓':'최신 메시지로 이동 ↓';};
 log.onscroll=update;
 log.onclick=e=>{if(!e.target.closest('[data-history-older]'))return;state.limit+=150;paint(true,false);update();};
 jump.onclick=()=>{log.scrollTop=log.scrollHeight;state.unread=false;update();};update();
}
