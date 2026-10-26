import {uploadPortraitAsset,readPortraitAsset} from '../lib/portrait-assets.mjs';
import {PORTRAIT_MAX_BYTES} from '../public/play/portrait-image.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { openStore } from './store.mjs';
import { tableRequest, mcpRequest, readContentAsset } from '../lib/table-service.mjs';
import { startGMWorker } from './codex-gm.mjs';
import { configureBridge, relayRequest } from '../lib/gm-jobs.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url))), assets = resolve(root, 'public');
const store = openStore(process.env.NIGHT_TABLE_DB || resolve(root, '.local-data/table.sqlite'));
const gmEnabled=process.env.NIGHT_TABLE_DISABLE_GM!=='1';
const stopGM=gmEnabled?startGMWorker(store,{onEvent:event=>console.log('[AI] '+event)}):async()=>{};
console.log('[DB] SQLite 연결 완료 · WAL 저장');
console.log('[AI] '+(gmEnabled?'로컬 캠페인 GM 대기':'온라인 모드 · 로컬 캠페인 GM 비활성'));
const secret = store.setting('session-secret', randomBytes(32).toString('hex'));
const port = Number(process.env.NIGHT_TABLE_PORT || 4317);
const signature = id => createHmac('sha256', secret).update(id).digest('hex');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };
function identity(req, res) {
  const value = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('night-session='))?.slice(14);
  const [id, sig] = (value || '').split('.');
  if (/^[a-f0-9]{32}$/.test(id || '') && /^[a-f0-9]{64}$/.test(sig || '') && timingSafeEqual(Buffer.from(sig), Buffer.from(signature(id)))) return { id, name: '플레이어' };
  const fresh = randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `night-session=${fresh}.${signature(fresh)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`);
  return { id: fresh, name: '플레이어' };
}
async function body(req) {
  const chunks = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > 900000) throw Object.assign(new Error('입력 크기를 줄여주세요.'), { status: 413 }); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function json(res, value, code = 200) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'self'");
  try {
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!allowedHosts.includes(req.headers.host)) return json(res, { error: '허용되지 않은 호스트입니다.' }, 403);
    const url = new URL(req.url, `http://${req.headers.host}`);
    if(url.pathname==='/api/health'&&req.method==='GET')return json(res,{service:'night-table-local',protocol:1,gmEnabled});
    if (req.method === 'POST') {
      if (req.headers.origin && !allowedHosts.some(h => req.headers.origin === `http://${h}`)) return json(res, { error: '다른 사이트에서 보낸 요청입니다.' }, 403);
      if (!(url.pathname==='/api/table'&&url.searchParams.get('portrait')==='upload')&&!req.headers['content-type']?.startsWith('application/json')) return json(res, { error: 'JSON 요청이 필요합니다.' }, 415);
    }
    if (url.pathname === '/api/table' || url.pathname === '/mcp') {
      const user = identity(req, res);
      if(url.pathname==='/api/table'&&url.searchParams.has('portrait')){
        if(req.method==='POST'&&url.searchParams.get('portrait')==='upload'){
          const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>PORTRAIT_MAX_BYTES)return json(res,{error:'초상화는 장당 10MB까지 원본으로 저장할 수 있습니다.'},413);chunks.push(chunk);}
          return json(res,await uploadPortraitAsset(store,user,Buffer.concat(chunks),req.headers['content-type']));
        }
        if(req.method!=='GET')return json(res,{error:'지원하지 않는 메서드입니다.'},405);
        const image=await readPortraitAsset(store,user,url.searchParams.get('portrait'),url.searchParams.get('room'));
        res.writeHead(200,{'Content-Type':image.mime,'Cache-Control':'private, no-store'});return res.end(image.bytes);
      }
      if(req.method==='GET'&&url.pathname==='/api/table'&&url.searchParams.has('asset')){const data=await readContentAsset(store,user,url.searchParams.get('room'),url.searchParams.get('asset'));const [header,bytes]=data.split(',');res.writeHead(200,{'Content-Type':header.slice(5).split(';')[0],'Cache-Control':'private, no-store'});return res.end(Buffer.from(bytes,'base64'));}
      if (req.method === 'GET' && url.pathname === '/api/table') return json(res, { ...await tableRequest(store, user, { op: url.searchParams.has('room') ? 'get' : 'list', roomId: url.searchParams.get('room'), since:url.searchParams.has('since')?Number(url.searchParams.get('since')):undefined }), local: true });
      if (req.method !== 'POST') return json(res, { error: '지원하지 않는 메서드입니다.' }, 405);
      const input = await body(req);
      if (url.pathname === '/mcp') return json(res, await mcpRequest(store, user, input));
      return json(res, { ...await tableRequest(store, user, input), local: true });
    }
    if(url.pathname==='/api/gm-relay'&&req.method==='POST'){
      const input=await body(req);
      if(input.op==='pair')return json(res,await configureBridge(store,identity(req,res),input.roomId,input.token));
      return json(res,await relayRequest(store,input.roomId,req.headers.authorization?.replace(/^Bearer /,''),input));
    }
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, { error: '지원하지 않는 메서드입니다.' }, 405);
    const path = resolve(assets, '.' + decodeURIComponent(['/', '/play', '/play/'].includes(url.pathname) ? '/play/index.html' : url.pathname));
    if (!path.startsWith(assets + sep)) return json(res, { error: '잘못된 경로입니다.' }, 403);
    const bytes = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (e) { json(res, { error: e.code === 'ENOENT' ? '파일을 찾을 수 없습니다.' : e.message }, e.status || (e.code === 'ENOENT' ? 404 : e instanceof SyntaxError ? 400 : 500)); }
});
server.listen(port, '127.0.0.1', () => {console.log(`[SERVER] 준비 완료 http://127.0.0.1:${port}`);process.send?.({type:'ready',port});});
let shuttingDown=false;
async function shutdown(){
 if(shuttingDown)return;shuttingDown=true;console.log('[SERVER] 종료 요청 · AI 작업 정리');
 const closed=new Promise(resolve=>server.close(resolve));server.closeIdleConnections();
 await stopGM();await closed;store.close();console.log('[DB] 연결 종료 · 저장 보존');process.exit(0);
}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
process.on('message',message=>{if(message?.type==='shutdown')void shutdown();});
process.on('disconnect',()=>void shutdown());
server.on('error',async error=>{console.error('[SERVER] '+(error.code==='EADDRINUSE'?'포트가 이미 사용 중입니다.':error.code||'서버 시작 실패'));await stopGM();store.close();process.exit(1);});
