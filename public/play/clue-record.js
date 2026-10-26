const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function clueRecordMarkup(note,room){
 const people=[...(room.characters||[]),...(room.cast||[])];
 const names=(note.knownTo||[]).map(id=>people.find(c=>c.id===id)?.name).filter(Boolean);
 return `<article class="case-note"><span class="case-stamp">${({person:'인물',clue:'단서',quest:'퀘스트',summary:'요약'})[note.kind]||'기록'}${note.visibility==='gm'?' / GM 전용':''}</span><h3>${esc(note.title)}</h3><p>${esc(note.text)}</p>${note.recordType==='discoveredClue'?`<p><strong>사용 방법</strong> · ${esc(note.usage)}</p><p class="inline-note">출처 · ${esc(note.source)}</p><p class="inline-note">${esc(({confirmed:'확인한 정보',belief:'증언·추정',unknown:'미확인'})[note.certainty]||'미확인')}${names.length?' · 알고 있는 인물: '+esc(names.join(', ')):''}</p>`:''}</article>`;
}
