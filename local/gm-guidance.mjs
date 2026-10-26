import {libraryCall} from './rule-library.mjs';

// Explicitly selected GM guide. Installed books are not all adopted as rules.
export const isGMGuide=book=>/how[\s_-]+to[\s_-]+be[\s_-]+a[\s_-]+gurps[\s_-]+gm/i.test(book.title||'');
export const guidanceTopics=['Player Freedom','Following the Players’ Lead','NPCs Are People, Too','Before the Session','During the Session','Running the Campaign','Selecting Options','Speeding Up Combat'];
export const guidanceInstruction='GM GUIDANCE: gmGuidance contains advisory book excerpts, not executable rules or new campaign requirements. Preserve player choice, established canon, approved house rules and server authority. For a difficult pacing, clue, NPC portrayal or unexpected-choice question, use lookupGuidance alone with short English topic queries or a listed bookId and actual PDF page. Do not search for routine greetings or every turn. Use adjacentPages with the same bookId when an excerpt cuts off relevant advice. Consult only missing advice; do not turn examples or optional suggestions into obligations. Rules and numerical procedures use lookupRules and verified rule sources instead. Missing guide excerpts never authorize fabricated citations or restrict a legal player action.';

export function selectGuidanceExcerpts(excerpts,budget=6000){
 const seen=new Set(),result=[];let used=0;
 for(const e of excerpts||[]){
  const key=e.bookId+':'+e.page;if(seen.has(key)||result.length>=3)continue;
  const text=String(e.text||'').slice(0,Math.min(3000,budget-used));if(!text.trim())continue;
  result.push({...e,text,purpose:'gm-advice'});seen.add(key);used+=text.length;
 }
 return result;
}
export async function guidanceContext(room,config,options={}){
 if(!config?.roomIds?.includes(room.id)||room.gmJob?.kind==='combatReaction'||!config.python&&!options.libraryCall)return null;
 const call=options.libraryCall||libraryCall;
 const books=(await call(config,{op:'catalog'},options)).books.filter(b=>isGMGuide(b)&&b.emptyPages<b.pages&&(!Array.isArray(room.campaign?.localBookIds)||room.campaign.localBookIds.includes(b.id)));
 if(!books.length)return {config,books:[],excerpts:[],notice:'GM guide not indexed. Keep core principles; do not invent book advice.'};
 const queries=['preparation','storyDay'].includes(room.gmJob?.kind)?['Player Freedom','Before the Session']:[];
 const excerpts=queries.length?(await call(config,{op:'search',bookIds:books.map(b=>b.id),queries},options)).excerpts:[];
 return {config,books,excerpts:selectGuidanceExcerpts(excerpts),queries};
}
export function guidanceProjection(context){
 if(!context)return undefined;
 return {books:context.books,topics:guidanceTopics,excerpts:context.excerpts,notice:context.notice||'Advisory guidance only. Not a rule citation source. Search only when useful.'};
}
export async function retrieveGuidance(context,request,options={}){
 if(!context?.books.length)throw Error('검색 가능한 GM 가이드가 없습니다.');
 const ids=context.books.map(b=>b.id);
 if(request.pages.some(p=>!ids.includes(p.bookId)))throw Error('연결된 GM 가이드만 조회할 수 있습니다.');
 const call=options.libraryCall||libraryCall;
 const fresh=request.queries.length?(await call(context.config,{op:'search',bookIds:ids,queries:request.queries},options)).excerpts:[];
 const pages=request.pages.length?(await call(context.config,{op:'pages',pages:request.pages},options)).excerpts:[];
 return {...context,excerpts:selectGuidanceExcerpts([...pages,...fresh,...context.excerpts])};
}
