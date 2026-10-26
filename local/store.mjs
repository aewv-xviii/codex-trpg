import {connectionDDL,connectionSQL} from '../lib/gm-progress.mjs';
import {pendingScenarioSnapshot} from '../lib/scenario-checkpoints.mjs';
import {assetDDL,assetSQL} from '../lib/content-assets.mjs';
import {motionDDL,motionSQL} from '../lib/token-motion.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function openStore(path = resolve('.local-data/table.sqlite')) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  const unpack = row => row ? JSON.parse(row.data) : null;
  db.exec('CREATE TABLE IF NOT EXISTS account_characters (id TEXT PRIMARY KEY, owner TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS account_characters_owner_idx ON account_characters(owner);');
  db.exec(motionDDL);
  db.exec(connectionDDL);
  db.exec(assetDDL);
  const checkpoint=room=>{const snapshot=pendingScenarioSnapshot(room);if(snapshot){db.prepare(assetSQL.put).run(snapshot.id,room.id,snapshot.body);delete room._pendingScenarioStart;}};
  return {
    assetPut:(id,room,data)=>db.prepare(assetSQL.put).run(id,room,data),
    assetGet:(id,room)=>db.prepare(assetSQL.get).get(id,room)?.data||null,
    connectionWrite:(id,at)=>db.prepare(connectionSQL.write).run(id,at),
    connectionGet:id=>db.prepare(connectionSQL.read).get(id)||null,
    motionWrite:(op,args)=>db.prepare(motionSQL[op]).run(...args).changes===1,
    motionList:(id,now)=>db.prepare(motionSQL.list).all(id,now),
    db,
    revision: id => {
      const row=db.prepare("SELECT version,json_extract(data,'$.members') AS members,json_extract(data,'$.deletedAt') AS deletedAt FROM rooms WHERE id=?").get(id);
      return row ? {...row,members:JSON.parse(row.members||'[]')} : null;
    },
    accountList: owner=>db.prepare('SELECT data FROM account_characters WHERE owner=?').all(owner).map(unpack),
    accountGet: id=>unpack(db.prepare('SELECT data FROM account_characters WHERE id=?').get(id)),
    accountCreate: c=>db.prepare('INSERT INTO account_characters (id,owner,version,data) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING').run(c.id,c.owner,c.version,JSON.stringify(c)).changes===1,
    accountSave: (c,before)=>db.prepare('UPDATE account_characters SET version=?,data=? WHERE id=? AND owner=? AND version=?').run(c.version,JSON.stringify(c),c.id,c.owner,before).changes===1,
    list: () => db.prepare('SELECT data FROM rooms ORDER BY rowid DESC').all().map(unpack),
    get: id => unpack(db.prepare('SELECT data FROM rooms WHERE id=?').get(id)),
    byCode: code => typeof code === 'string' ? unpack(db.prepare('SELECT data FROM rooms WHERE code=?').get(code)) : null,
    create: room => {checkpoint(room);return db.prepare('INSERT INTO rooms (id,code,version,data) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING').run(room.id, room.joinCode, room.version, JSON.stringify(room)).changes === 1;},
    save: (room, before) => {checkpoint(room);return db.prepare('UPDATE rooms SET code=?, version=?, data=? WHERE id=? AND version=?').run(room.joinCode, room.version, JSON.stringify(room), room.id, before).changes === 1;},
    setting: (key, initial) => {
      db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run(key, initial);
      return db.prepare('SELECT value FROM settings WHERE key=?').get(key).value;
    },
    close: () => db.close()
  };
}
