// Keep explicitly disabled books disabled; newly indexed books are enabled.
export function extendLocalSelection(room,books){
 if(!Array.isArray(room.campaign?.localBookIds))return;
 const known=new Set((room.localLibrary?.books||[]).map(b=>b.id));
 const readable=books.filter(b=>b.kind==='rule'&&b.emptyPages<b.pages);
 const selected=new Set(room.campaign.localBookIds);
 room.campaign.localBookIds=readable.filter(b=>selected.has(b.id)||!known.has(b.id)).map(b=>b.id);
}
