import {schemaForRoom} from '../lib/gm-jobs.mjs';
import {libraryCall,localRuleContext} from './rule-library.mjs';

const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const s={type:'string'};
export function retrievalSchema(room,enabled,guidanceEnabled=false){
 const schema=schemaForRoom(room);
 if(enabled)schema.properties.commands.items.anyOf.push(object({op:{type:'string',enum:['lookupRules']},payload:object({queries:{type:'array',maxItems:8,items:s},pages:{type:'array',maxItems:6,items:object({bookId:s,page:{type:'integer',minimum:1}})}})}));
 if(guidanceEnabled)schema.properties.commands.items.anyOf.push(object({op:{type:'string',enum:['lookupGuidance']},payload:object({queries:{type:'array',maxItems:8,items:s},pages:{type:'array',maxItems:6,items:object({bookId:s,page:{type:'integer',minimum:1}})}})}));
 return schema;
}
export function lookupRequest(proposal){
 const requests=proposal.commands?.filter(c=>['lookupRules','lookupGuidance'].includes(c.op))||[];
 if(!requests.length)return null;
 if(requests.length!==1||proposal.commands.length!==1)throw Error('규칙 조회는 게임 명령과 섞을 수 없습니다.');
 const p=requests[0].payload;
 if(!p||!Array.isArray(p.queries)||p.queries.length>8||p.queries.some(q=>typeof q!=='string'||!q.trim()||q.length>150)||!Array.isArray(p.pages)||p.pages.length>6||p.pages.some(v=>!v||typeof v.bookId!=='string'||!Number.isInteger(v.page)||v.page<1)||!p.queries.length&&!p.pages.length)throw Error('규칙 검색어 또는 페이지를 지정하세요.');
 return {...p,lookupKind:requests[0].op};
}
export function mergeExcerpts(pages,fresh,previous){
 // Interleave equally ranked results so another broad search cannot evict all
 // earlier evidence. Exact pages and rule headings take priority across rounds.
 const candidates=pages.map(e=>({...e,retrievalPriority:1000}));
 for(let i=0;i<Math.max(fresh.length,previous.length);i++){
  if(fresh[i])candidates.push(fresh[i]);
  if(previous[i])candidates.push(previous[i]);
 }
 const unique=new Map();
 for(const e of candidates){
  const key=e.bookId+':'+e.page,old=unique.get(key);
  if(!old||(e.retrievalPriority||0)>(old.retrievalPriority||0)||((e.retrievalPriority||0)===(old.retrievalPriority||0)&&(e.text||'').length>(old.text||'').length))unique.set(key,e);
 }
 return [...unique.values()].sort((a,b)=>(b.retrievalPriority||0)-(a.retrievalPriority||0)).slice(0,12);
}
export async function retrieveMore(room,context,request,options={}){
 const call=options.libraryCall||libraryCall;
 let next=context;
 if(context){
  if(request.pages.some(v=>!context.books.some(b=>b.id===v.bookId)))throw Error('캠페인에 연결된 책만 조회할 수 있습니다.');
  const found=request.queries.length?await (options.localRuleContext||localRuleContext)(room,request.queries,{...options,config:context.config}):{excerpts:[]};
  const pages=request.pages.length?(await call(context.config,{op:'pages',pages:request.pages},options)).excerpts:[];
  next={...context,excerpts:mergeExcerpts(pages,found.excerpts,context.excerpts)};
 }else if(request.pages.length)throw Error('로컬 룰북 연결이 없습니다.');
 const ids=[...(room.campaign.rulebookIds||[]),room.campaign.rulebookId];
 const terms=request.queries.flatMap(q=>q.toLowerCase().match(/[\p{L}\p{N}-]{2,}/gu)||[]);
 const web=[];
 for(const doc of room.documents||[]){
  if(!ids.includes(doc.id)||doc.visibility!=='public')continue;
  const lower=doc.content.toLowerCase(),at=terms.map(t=>lower.indexOf(t)).filter(n=>n>=0).sort((a,b)=>a-b)[0];
  if(at!==undefined)web.push({documentId:doc.id,title:doc.title,text:doc.content.slice(Math.max(0,at-400),at+4600)});
 }
 return {context:next,web: web.slice(0,4)};
}
export const retrievalInstruction='RULE LOOKUP: You may request lookupRules as the ONLY command. Use separate short English rule titles (e.g. Merchant, Quick Contests), not long keyword sentences. Put printed Basic Set references such as B348 in queries: the local index resolves verified printed headers to PDF pages. The pages field requires a known bookId and actual PDF file page, never a guessed printed-page offset. This is a read-only lookup, not a player action. If excerpts omit an exception, continuation or cross-reference, use adjacentPages with the same bookId to read the needed neighboring PDF page, or retrieve that missing rule before asking players to paste text. Adjacent pages are navigation hints, not evidence until read. Review ruleLookup.history: do not repeat an unsuccessful query; switch to an exact title, printed reference, or known PDF page. Use the supplied original excerpts and keep relevant earlier evidence. At the lookup limit, ask one specific unresolved rules question; do not fabricate sources. No shell or general filesystem access is available.';
