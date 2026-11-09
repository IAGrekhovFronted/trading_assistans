import test from 'node:test';
import assert from 'node:assert/strict';
import {newScheme,newSharedScheme,schemeGroup,schemesUsing,validateSchemes,inspectScheme,duplicateScheme} from '../schemes.mjs';
import {createBuilder} from '../builder.mjs';
import {freshSchemeSession,answerAndAdvance,routeFor,validateImport,lockDecision,FORMAT} from '../engine.mjs';
import {transitionToScheme} from '../scheme-flow.mjs';
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const click=(b,action,extra={})=>b.handleClick({dataset:{builderAction:action,...extra}});
function harness(initial=[]){
  const schemes=initial,events=[];
  const builder=createBuilder({getSchemes:()=>schemes,save:s=>{const i=schemes.findIndex(x=>x.id===s.id);if(i<0)schemes.push(s);else schemes[i]=s;events.push(s.id);},persist:async()=>true,remove:async()=>{},run:async()=>{},render:()=>{},notify:()=>{},esc});
  return {builder,schemes,events};
}
test('shared schemas begin empty and persist as drafts; old archives default to context without mutation',()=>{
  const s=newSharedScheme('Работа с пробежкой');assert.equal(s.group,'shared');assert.deepEqual(s.nodes,[]);assert.equal(s.startId,'');assert.equal(s.status,'draft');assert.equal(inspectScheme(s).valid,false);
  assert.deepEqual(validateSchemes(JSON.parse(JSON.stringify([s])))[0],s);
  const legacy=newScheme();delete legacy.group;const before=structuredClone(legacy);assert.equal(schemeGroup(legacy),'context');assert.deepEqual(legacy,before);assert.deepEqual(validateSchemes([legacy])[0],legacy);
  for(const group of ['other',null,{},'__proto__'])assert.throws(()=>validateSchemes([{...newScheme(),group}]));
  const copied=duplicateScheme(s);assert.equal(copied.group,'shared');assert.notEqual(copied.id,s.id);
});
test('shared creation shortcuts create only empty editable schemes and reopen in their own library group',async()=>{
  for(const[action,name]of [['create-shared','Новая общая схема'],['shared-run','Работа с пробежкой'],['shared-trend','Работа с локальным трендом']]){
    const {builder,schemes}=harness();await click(builder,action);assert.equal(schemes.length,1);assert.equal(schemes[0].name,name);assert.equal(schemes[0].nodes.length,0);
    await click(builder,'save-draft');let html=builder.render();assert.ok(html.includes('Общая схема'));assert.ok(html.includes('Продолжить →'));assert.ok(!html.includes('data-builder-action="run"'));
    await click(builder,'edit',{id:schemes[0].id});html=builder.render();assert.ok(html.includes('Добавь первый блок'));
  }
});
test('group and readiness filters combine without hiding legacy context schemes or creating copies',async()=>{
  const a={...newScheme(),name:'Контекст A',status:'ready'},b={...newScheme(),name:'Общая B',group:'shared',status:'ready'},c=newSharedScheme('Черновик C');
  delete a.group;const {builder,schemes}=harness([a,b,c]);
  await click(builder,'group-filter',{filter:'shared'});let html=builder.render();assert.ok(html.includes('<h2>Общая B</h2>'));assert.ok(html.includes('<h2>Черновик C</h2>'));assert.ok(!html.includes('<h2>Контекст A</h2>'));
  await click(builder,'filter',{filter:'ready'});html=builder.render();assert.ok(html.includes('<h2>Общая B</h2>'));assert.ok(!html.includes('<h2>Черновик C</h2>'));
  await click(builder,'group-filter',{filter:'context'});html=builder.render();assert.ok(html.includes('<h2>Контекст A</h2>'));assert.ok(!html.includes('<h2>Общая B</h2>'));assert.equal(schemes.length,3);
});
test('moving an existing scheme into shared keeps IDs and incoming references while preserving old snapshots',async()=>{
  const a=newScheme(),b={...newScheme(),status:'ready'},snapshot=freshSchemeSession(b);a.nodes[1].nextSchemeId=b.id;
  const id=b.id,nodeIds=b.nodes.map(n=>n.id),{builder}=harness([a,b]);await click(builder,'edit',{id});
  const previous=globalThis.document;
  try{globalThis.document={querySelector:()=>null,querySelectorAll:()=>[]};builder.handleInput({dataset:{builderField:'group'},value:'shared',tagName:'SELECT'});}
  finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
  assert.equal(b.id,id);assert.deepEqual(b.nodes.map(n=>n.id),nodeIds);assert.equal(a.nodes[1].nextSchemeId,id);assert.equal(b.group,'shared');assert.equal(b.status,'draft');assert.equal(b.revision,2);
  assert.equal(snapshot.schemeSnapshot.group,'context');assert.equal(snapshot.schemeSnapshot.revision,1);
});
test('one common destination can retain different source contexts, with independent snapshots for each record',()=>{
  const a={...newScheme(),name:'Контекст тренда',status:'ready'},b={...newScheme(),name:'Контекст отката',status:'ready'},common={...newScheme(),group:'shared',name:'Проверка реакции',status:'ready'};
  a.nodes[1].nextSchemeId=common.id;b.nodes[2].nextSchemeId=common.id;
  const complete=(s,option=0)=>answerAndAdvance(freshSchemeSession(s),s.startId,s.nodes[0].options[option].id);
  const first=transitionToScheme(complete(a),[a,b,common]),second=transitionToScheme(complete(b,1),[a,b,common]);
  assert.equal(first.schemeId,second.schemeId);assert.equal(first.schemeTrail.previous[0].schemeId,a.id);assert.equal(second.schemeTrail.previous[0].schemeId,b.id);assert.notEqual(first.id,second.id);
  common.nodes[0].title='Обновлённая проверка';common.revision=2;
  assert.notEqual(routeFor(first).steps[0].title,common.nodes[0].title);
  const third=transitionToScheme(complete(a),[a,b,common]);assert.equal(third.schemeSnapshot.revision,2);assert.equal(routeFor(third).steps[0].title,common.nodes[0].title);
  const done=lockDecision(answerAndAdvance(first,common.startId,common.nodes[0].options[0].id),'observation');
  const archive=JSON.parse(JSON.stringify({format:FORMAT,sessions:[done],schemes:[a,b,common]}));
  assert.equal(validateImport(archive)[0].schemeSnapshot.group,'shared');assert.equal(validateSchemes(archive.schemes)[2].revision,2);
});
test('usage counts referencing schemes once and grouped destinations keep ready and draft choices distinct',async()=>{
  const a={...newScheme(),name:'Контекст <A>'},b={...newScheme(),name:'Контекст B'},common={...newScheme(),name:'Общая <C>',group:'shared',status:'ready'},draft=newSharedScheme('Общая D');
  a.nodes[1].nextSchemeId=common.id;a.nodes[2].nextSchemeId=common.id;b.nodes[1].nextSchemeId=common.id;
  assert.deepEqual(schemesUsing([a,b,common,draft],common.id).map(s=>s.id),[a.id,b.id]);
  common.editorNodeId=common.nodes[1].id;a.editorNodeId=a.nodes[1].id;
  const {builder}=harness([a,b,common,draft]);await click(builder,'edit',{id:common.id});
  let html=builder.render();assert.ok(html.includes('Используется в 2 схемах'));assert.ok(html.includes('Контекст &lt;A>'));assert.ok(html.includes('data-id="'+a.id+'"'));
  await click(builder,'edit',{id:a.id});html=builder.render();assert.ok(html.includes('<optgroup label="Общие схемы">'));assert.ok(html.includes('<optgroup label="Контекстные схемы">'));assert.ok(html.includes('Общая &lt;C>'));assert.ok(html.includes('Общая D · черновик'));assert.ok(!html.includes('value="'+a.id+'"'));
});
test('deleting a reused scheme names the affected links without deleting anything on cancel',async()=>{
  const a=newScheme(),common=newSharedScheme();a.nodes[1].nextSchemeId=common.id;const {builder,schemes}=harness([a,common]);let message='';
  const previous=globalThis.confirm;
  try{globalThis.confirm=text=>{message=text;return false;};await click(builder,'delete',{id:common.id});}
  finally{if(previous===undefined)delete globalThis.confirm;else globalThis.confirm=previous;}
  assert.match(message,/ссылаются 1 схем/);assert.equal(schemes.length,2);
});
