import {access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {codexExecutable} from '../local/codex-gm.mjs';
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<13))throw Error('Node.js 22.13 이상이 필요합니다.');
await import('node:sqlite');
const exe=await codexExecutable();
try {await access(exe);}catch {console.error('Codex 실행 파일을 찾지 못했습니다. Codex 설치 후 다시 실행하거나 NIGHT_TABLE_CODEX 환경 변수로 codex.exe 경로를 지정하세요.');process.exit(1);}
const result=spawnSync(exe,['--version'],{encoding:'utf8',windowsHide:true});
if(result.status!==0)throw Error('Codex 실행 확인 실패');
console.log('Node.js '+process.versions.node+' / '+result.stdout.trim());
console.log('실행 파일 확인 완료. Codex 로그인과 모델 사용 가능 여부는 별도로 확인하세요. API 키는 필요하지 않습니다.');
