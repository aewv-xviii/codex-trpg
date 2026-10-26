import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {libraryCall,fixedRuleFolder} from '../local/rule-library.mjs';
import {openStore} from '../local/store.mjs';
import {extendLocalSelection} from '../lib/library-selection.mjs';
const roomId=process.argv[2],python=process.argv[3]||'python';
if(!roomId)throw Error('사용법: node scripts/setup-rulebooks.mjs 캠페인ID [Python실행파일]');
const data=fileURLToPath(new URL('../.local-data/',import.meta.url));
await mkdir(data,{recursive:true});
const file=resolve(data,'rule-library.json');
const store=openStore(process.env.NIGHT_TABLE_DB||resolve(data,'table.sqlite'));
const room=store.get(roomId);
if(!room){store.close();throw Error('캠페인 ID를 찾지 못했습니다. 먼저 앱에서 테이블을 만드세요.');}
if(['queued','running','applying'].includes(room.gmJob?.status)){store.close();throw Error('GM 작업이 끝난 뒤 서버를 종료하고 다시 실행하세요.');}
store.db.exec("VACUUM INTO '"+resolve(data,'before-rulebooks-'+Date.now()+'.sqlite').replaceAll("'","''")+"'");
store.close();
let previous=null;
try{previous=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const config={...(previous||{}),python,database:previous?.database||resolve(data,'rule-library.sqlite'),roots:[{path:fixedRuleFolder,kind:'rule',exclude:['_미사용','README.md']}],roomIds:[...new Set([...(previous?.roomIds||[]),roomId])]};
const result=await libraryCall(config,{op:'index'},{onProgress:p=>console.log(p.progress||p.indexed)});
if(previous)await writeFile(file+'.'+Date.now()+'.bak',JSON.stringify(previous,null,2));
await writeFile(file,JSON.stringify(config,null,2));
const updateStore=openStore(process.env.NIGHT_TABLE_DB||resolve(data,'table.sqlite'));
try{
 const current=updateStore.get(roomId);
 if(current.version!==room.version)throw Error('설정 중 캠페인이 바뀌었습니다. 서버 종료 후 다시 실행하세요.');
 const books=result.books.map(({id,title,kind,pages,emptyPages,digest,format})=>({id,title,kind,pages,emptyPages,digest,format}));
 extendLocalSelection(current,books);
 current.localLibrary={books,updatedAt:new Date().toISOString()};current.version++;
 if(!updateStore.save(current,room.version))throw Error('캠페인이 바뀌었습니다. 다시 실행하세요.');
}finally{updateStore.close();}
console.log('색인 완료: '+result.books.length+'권. 캠페인 '+roomId+'에서 로컬 검색을 허용합니다.');
