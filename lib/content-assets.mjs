export const assetDDL='CREATE TABLE IF NOT EXISTS content_assets (id TEXT PRIMARY KEY,room_id TEXT NOT NULL,data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS content_assets_room_idx ON content_assets(room_id);';
export const assetSQL={
 put:'INSERT INTO content_assets (id,room_id,data) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING',
 get:'SELECT data FROM content_assets WHERE id=? AND room_id=?',
};
export async function assetFingerprint(data){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function persistContentAssets(store,room){
 for(const [id,data] of Object.entries(room.contentAssets||{})){
  if(typeof data!=='string')continue;
  await store.assetPut(id,room.id,data);
  room.contentAssets[id]={size:data.length,fingerprint:await assetFingerprint(data)};
 }
}
