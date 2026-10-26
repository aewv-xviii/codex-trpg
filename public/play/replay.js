const $=id=>document.getElementById(id);
let data,room,input;
async function request(body){const res=await fetch('/api/table',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await res.json();if(!res.ok)throw Error(value.error||'요청 실패');return value;}
async function load(text){try{
 $('apply').disabled=true;data=JSON.parse(text);
 if(data.format!=='night-table-replay/v1')throw Error('다시 시작 자료 형식이 아닙니다.');
 const current=await request({op:'get',roomId:data.roomId});room=current.room;
 if(room.owner!==current.me.id)throw Error('방장만 다시 시작할 수 있습니다.');
 const names=data.characterIds.map(id=>room.characters.find(c=>c.id===id&&!c.isNPC)?.name);
 if(names.some(n=>!n))throw Error('기존 캐릭터를 확인하세요.');
 $('summary').textContent=[room.title,'유지할 캐릭터: '+names.join(' · '),'시나리오: '+data.pack.title+' v'+data.pack.version,'시작: '+data.date+' '+data.time,'인물 자료: '+data.pack.actors.length+'명 · 장소 DB: '+data.world.places.length+'곳','현재 시트와 자산 유지 · 이전 진행 보관'].join('\n');
 input={op:'resetCampaign',roomId:room.id,expectedVersion:room.version,requestId:crypto.randomUUID(),payload:{confirmName:room.title,replay:data}};
 if(new TextEncoder().encode(JSON.stringify(input)).length>890000)throw Error('이미지 전송용 사본을 더 줄여주세요.');
 $('status').textContent='자료 확인 완료. 버튼을 누르면 이전 기록을 보관하고 다시 시작합니다.';$('apply').disabled=false;
}catch(e){$('status').textContent=e.message;}};
$('file').onchange=async e=>load(await e.target.files[0].text());
$('load').onclick=()=>load($('source').value);
$('apply').onclick=async()=>{try{
 $('apply').disabled=true;$('status').textContent='이전 기록 보관 및 최신 자료 적용 중…';
 const result=await request(input);localStorage.setItem('night-table-room',result.room.id);
 $('status').textContent='준비 완료 · '+result.room.scene.title+' · '+result.room.chronicle.clock.date+' '+result.room.chronicle.clock.time+' · 이전 기록 보관됨';
 $('summary').textContent+='\n보관본: '+result.result.archiveId;
}catch(e){$('status').textContent=e.message+' 같은 요청으로 다시 시도할 수 있습니다.';$('apply').disabled=false;}};

