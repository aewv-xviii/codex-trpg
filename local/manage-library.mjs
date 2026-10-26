import {libraryConfig,libraryCall} from './rule-library.mjs';
const config=await libraryConfig();
if(!config)throw Error('.local-data/rule-library.json에 룰북 폴더를 먼저 연결하세요.');
const op=process.argv[2]||'index';
if(op==='index'){
 const result=await libraryCall(config,{op:'index',roots:config.roots},{onProgress:p=>console.log(p.progress?`${p.progress}: ${p.page}/${p.total}`:`${p.indexed}: ${p.pages}쪽/구간 · 텍스트 없는 페이지 ${p.emptyPages}`)});
 console.log(`로컬 자료 ${result.books.length}권 확인 완료. 원본은 수정하지 않았습니다.`);
}else if(op==='search'){
 const {books}=await libraryCall(config,{op:'catalog'});
 console.log(JSON.stringify(await libraryCall(config,{op:'search',bookIds:books.filter(b=>b.kind==='rule').map(b=>b.id),queries:[process.argv.slice(3).join(' ')]}),null,2));
}else if(op==='catalog'){
 console.log(JSON.stringify(await libraryCall(config,{op:'catalog'}),null,2));
}else throw Error('index, search, catalog 중 하나를 선택하세요.');
