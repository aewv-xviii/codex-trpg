import sample from '../examples/exploration-demo/manifest.json' with {type:'json'};
import {setupCharacter} from './campaign-setup.mjs';
import {economy,economyCommand} from './economy.mjs';
import {contentPackCommand} from './content-packs.mjs';
import {markScenarioStart} from './scenario-checkpoints.mjs';
export function quickStart(room,user,mode){
 if(mode!=='exploration')throw Object.assign(Error('지원하지 않는 체험입니다.'),{status:400});
 // The example stays in its own campaign, without importing canonical secrets or PCs.
 for(const key of ['world','bible','gmInstructions','openingPrompt','caseTitle','caseScenario','sourceFiles'])delete room.campaign[key];
 room.campaign.world=sample.setting;room.campaign.quickStart='exploration';
 room.chronicle.clock={date:sample.startDate,time:sample.startTime};
 const actor=setupCharacter(room,user,{name:'체험 조사자',description:'비정사 연습용 캐릭터 · 정식 200CP 빌드가 아닙니다.',fields:['ST','DX','IQ','HT','Will','Per'].map(name=>({name,value:'10'})),inventory:'손전등 1개',maxHp:10,maxFp:10});
 room.members[0].activeCharacterId=actor.characterId;room.characters.find(c=>c.id===actor.characterId).practice=true;
 economy(room);economyCommand(room,user,'economySetup',{});
 economyCommand(room,user,'initializeAssets',{characterId:actor.characterId,won:20000,items:[{itemId:'flashlight',quantity:1}],reason:'비정사 체험용 자산'});
 contentPackCommand(room,user,'installContentPack',{pack:structuredClone(sample),baseDate:sample.startDate});
 const entry=room.chronicle.cases.find(c=>c.contentRef?.packId===sample.id);
 contentPackCommand(room,user,'enterContentCase',{caseId:entry.id,date:sample.startDate,mode:'walk',characterId:actor.characterId,expectedMinutes:0,expectedWon:0});
 room.messages.push({id:crypto.randomUUID(),type:'guide',caseId:entry.id,author:user.id,name:'플레이 안내',text:'체험용 별도 캠페인입니다. 영수증 옆으로 드래그해 이동하고 ◇를 눌러 조사하세요. 문 가까이 이동해 문을 열 수 있습니다. 이동·문·영수증 조사는 AI 없이 작동합니다. 관리인 대화와 판단형 조사는 로컬 GM 연결이 필요합니다.',at:new Date().toISOString()});
 markScenarioStart(room,'opening');
}
