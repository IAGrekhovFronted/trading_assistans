import {customRoute,inspectScheme,schemeStatus} from './schemes.mjs';
const emptyTrail=()=>({previous:[],next:[]});
const trailOf=session=>session.schemeTrail||emptyTrail();
export const previousSchemeStages=session=>trailOf(session).previous;
function captureStage(session){
  return structuredClone({schemeId:session.schemeId,schemeSnapshot:session.schemeSnapshot,algorithmVersion:session.algorithmVersion,answers:session.answers,cursor:session.cursor??customRoute(session).steps.length});
}
function activateStage(session,stage,previous,next){
  const active=structuredClone(stage);
  return {...session,...active,schemeTrail:{previous,next},updatedAt:new Date().toISOString()};
}
export function schemeTransitionInfo(session,schemes){
  if(!session.schemeSnapshot)return null;
  const r=customRoute(session);if(!r.complete||!r.result.nextSchemeId)return null;
  const id=r.result.nextSchemeId,cached=trailOf(session).next[0];
  if(session.decisionSnapshot)return {id,resultId:r.end,available:false,reason:'Решение уже зафиксировано.'};
  if(cached?.schemeId===id)return {id,resultId:r.end,available:true,cached:true,scheme:cached.schemeSnapshot};
  const target=schemes.find(s=>s.id===id);
  if(!target)return {id,resultId:r.end,available:false,reason:'Схема для перехода недоступна. Выбери другую в конструкторе.'};
  if(schemeStatus(target)!=='ready')return {id,resultId:r.end,available:false,scheme:target,reason:'Схема пока не готова. Сохрани её готовой в конструкторе.'};
  return {id,resultId:r.end,available:true,cached:false,scheme:target};
}
export function transitionToScheme(session,schemes){
  if(session.decisionSnapshot)throw new Error('Путь уже зафиксирован');
  const info=schemeTransitionInfo(session,schemes);if(!info?.available)throw new Error(info?.reason||'У этого итога нет перехода в другую схему');
  const trail=trailOf(session);
  if(!info.cached&&trail.previous.length>=1000)throw new Error('Достигнут предел переходов в одном разборе');
  const stage=info.cached?trail.next[0]:{schemeId:info.scheme.id,schemeSnapshot:structuredClone(info.scheme),algorithmVersion:'custom.'+info.scheme.revision,answers:{},cursor:0};
  return activateStage(session,stage,[...trail.previous,captureStage(session)],info.cached?trail.next.slice(1):[]);
}
export function returnToScheme(session,index){
  if(session.decisionSnapshot)throw new Error('Путь уже зафиксирован');
  const trail=trailOf(session);
  if(!Number.isInteger(index)||index<0||index>=trail.previous.length)throw new Error('Предыдущая схема не найдена');
  const stage={...trail.previous[index],cursor:customRoute(trail.previous[index]).steps.length};
  return activateStage(session,stage,trail.previous.slice(0,index),[...trail.previous.slice(index+1),captureStage(session),...trail.next]);
}
export function discardFutureSchemes(session){
  return session.schemeTrail?{...session,schemeTrail:{previous:session.schemeTrail.previous,next:[]}}:session;
}
export function schemeDecisionPath(session){
  if(!previousSchemeStages(session).length)return [];
  return [...previousSchemeStages(session),session].map(stage=>({schemeId:stage.schemeId,revision:stage.schemeSnapshot.revision,answers:structuredClone(stage.answers),resultId:customRoute(stage).end}));
}
export function assertSchemeTrail(session){
  if(session.schemeTrail===undefined)return;
  const trail=session.schemeTrail;
  if(!trail||!Array.isArray(trail.previous)||!Array.isArray(trail.next)||trail.previous.length+trail.next.length>1000||!session.schemeSnapshot)throw new Error('Некорректный маршрут схем');
  const stages=[...trail.previous,session,...trail.next];
  for(const stage of stages){
    const checked=inspectScheme(stage?.schemeSnapshot);
    if(!checked.valid||stage.schemeId!==stage.schemeSnapshot.id||stage.algorithmVersion!=='custom.'+stage.schemeSnapshot.revision||!stage.answers||typeof stage.answers!=='object'||Array.isArray(stage.answers))throw new Error('Повреждённый этап маршрута схем');
    const r=customRoute(stage),byKey=new Map(r.steps.map(q=>[q.key,q]));
    for(const [key,value]of Object.entries(stage.answers))if(!byKey.get(key)?.options.some(o=>o.value===value))throw new Error('Недопустимые ответы этапа схемы');
    if(!Number.isInteger(stage.cursor)||stage.cursor<0||stage.cursor>r.steps.length)throw new Error('Неверный шаг этапа схемы');
  }
  for(let i=0;i<stages.length-1;i++){
    const r=customRoute(stages[i]);
    if(!r.complete||r.result.nextSchemeId!==stages[i+1].schemeId)throw new Error('Нарушена связь между этапами схем');
  }
}
