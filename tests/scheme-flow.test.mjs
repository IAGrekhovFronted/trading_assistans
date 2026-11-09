import test from 'node:test';
import assert from 'node:assert/strict';
import {newScheme,newQuestion,inspectScheme,assertSchemeShape,validateSchemes} from '../schemes.mjs';
import {freshSchemeSession,answerAndAdvance,routeFor,lockDecision,validateImport,statistics,csv,FORMAT} from '../engine.mjs';
import {schemeTransitionInfo,transitionToScheme,returnToScheme,assertSchemeTrail} from '../scheme-flow.mjs';
import {layoutSchemeMap,renderSchemeMap} from '../scheme-map.mjs';
import {createBuilder} from '../builder.mjs';
const scheme=name=>({...newScheme(),name,status:'ready'});
function finish(s){for(const n of routeFor(s).steps){if(!s.answers[n.key])s=answerAndAdvance(s,n.key,n.options[0].value);}return s;}
function linked(){
  const a=scheme('Выбор ситуации'),b=scheme('Продолжение локального тренда'),c=scheme('Дополнительная проверка');
  a.nodes[1].nextSchemeId=b.id;b.nodes[1].nextSchemeId=c.id;
  return {a,b,c};
}
const backup=s=>({format:FORMAT,sessions:[s]});
const restore=s=>validateImport(JSON.parse(JSON.stringify(backup(s))))[0];
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');

test('result links accept portable missing targets but reject unsafe IDs, question links and direct self-links',()=>{
  const {a}=linked();assert.equal(inspectScheme(a).valid,true);
  const missing=structuredClone(a);missing.nodes[1].nextSchemeId='not-imported';assert.equal(inspectScheme(missing).valid,true);assert.doesNotThrow(()=>validateSchemes([missing]));
  for(const id of ['javascript:alert(1)','__proto__','a"b',null]){const bad=structuredClone(a);bad.nodes[1].nextSchemeId=id;assert.throws(()=>assertSchemeShape(bad));}
  const question=structuredClone(a);question.nodes[0].nextSchemeId='other';assert.throws(()=>assertSchemeShape(question));
  const self=structuredClone(a);self.nodes[1].nextSchemeId=a.id;assert.equal(inspectScheme(self).valid,false);
  delete missing.nodes[1].nextSchemeId;assert.equal(inspectScheme(missing).valid,true);
});

test('a handoff keeps one record and shared fields while snapshotting both schemes independently',()=>{
  const {a,b}=linked(),source=finish({...freshSchemeSession(a),symbol:'TEST',notes:'Причина входа',zone:'100',screenshots:[{name:'test',data:'data:image/png;base64,aGVsbG8='}]});
  const before=structuredClone(source),next=transitionToScheme(source,[a,b]);
  assert.equal(next.id,source.id);assert.equal(next.createdAt,source.createdAt);assert.equal(next.notes,source.notes);assert.deepEqual(next.screenshots,source.screenshots);assert.equal(next.zone,'100');
  assert.equal(next.schemeId,b.id);assert.equal(next.cursor,0);assert.deepEqual(next.answers,{});assert.equal(next.schemeTrail.previous.length,1);
  assert.deepEqual(next.schemeTrail.previous[0].answers,source.answers);assert.deepEqual(source,before);
  a.name='Изменено';b.nodes[0].title='Изменено';source.answers[a.startId]='changed';
  assert.equal(next.schemeTrail.previous[0].schemeSnapshot.name,'Выбор ситуации');assert.notEqual(next.schemeSnapshot.nodes[0].title,'Изменено');assert.notEqual(next.schemeTrail.previous[0].answers[a.startId],'changed');
  assert.doesNotThrow(()=>assertSchemeTrail(next));
});

test('Back and forward resume saved answers and images even after library edits or deletion',()=>{
  const {a,b}=linked(),second=newQuestion();second.options.forEach(o=>o.next=b.nodes[1].id);b.nodes[0].options[0].next=second.id;b.nodes.push(second);
  b.nodes[0].hintImages=[{id:'sample',name:'sample.png',data:'data:image/png;base64,aGVsbG8='}];
  let s=transitionToScheme(finish(freshSchemeSession(a)),[a,b]);s=answerAndAdvance(s,b.startId,b.nodes[0].options[0].id);
  const back=returnToScheme(s,0);assert.equal(back.schemeId,a.id);assert.equal(back.cursor,routeFor(back).steps.length);assert.equal(back.schemeTrail.next[0].cursor,1);
  assert.equal(schemeTransitionInfo(back,[]).cached,true);
  b.revision=99;b.nodes[0].title='new title';
  const resumed=transitionToScheme(restore(back),[]);
  assert.equal(resumed.schemeSnapshot.revision,1);assert.equal(resumed.cursor,1);assert.equal(resumed.answers[b.startId],b.nodes[0].options[0].id);assert.equal(resumed.schemeSnapshot.nodes[0].hintImages[0].id,'sample');
  assert.equal(resumed.schemeTrail.next.length,0);
});

test('repeating an answer preserves future schemes; a changed answer discards them',()=>{
  const {a,b}=linked();let s=transitionToScheme(finish(freshSchemeSession(a)),[a,b]);s=returnToScheme(s,0);
  const repeated=answerAndAdvance({...s,cursor:0},a.startId,a.nodes[0].options[0].id);assert.equal(repeated.schemeTrail.next.length,1);
  const changed=answerAndAdvance({...s,cursor:0},a.startId,a.nodes[0].options[1].id);assert.equal(changed.schemeTrail.next.length,0);assert.equal(schemeTransitionInfo(changed,[a,b]),null);
  assert.equal(s.schemeTrail.next.length,1);assert.doesNotThrow(()=>restore(changed));
});

test('multiple handoffs and cross-scheme loops are manual and retain their ordered stages',()=>{
  const {a,b,c}=linked();c.nodes[1].nextSchemeId=a.id;
  let s=transitionToScheme(finish(freshSchemeSession(a)),[a,b,c]);s=transitionToScheme(finish(s),[a,b,c]);s=finish(s);
  assert.deepEqual(s.schemeTrail.previous.map(p=>p.schemeId),[a.id,b.id]);assert.equal(s.schemeId,c.id);
  const back=returnToScheme(s,0);assert.deepEqual(back.schemeTrail.next.map(p=>p.schemeId),[b.id,c.id]);
  assert.equal(transitionToScheme(transitionToScheme(back,[]),[]).schemeId,c.id);
  s=transitionToScheme(s,[a,b,c]);assert.equal(s.schemeId,a.id);assert.equal(s.cursor,0);assert.deepEqual(s.answers,{});
  assert.equal(s.schemeTrail.previous.length,3);assert.doesNotThrow(()=>restore(s));
});

test('missing and draft destinations are unavailable without changing the existing record',()=>{
  const {a,b}=linked(),s=finish(freshSchemeSession(a)),before=structuredClone(s);
  assert.equal(schemeTransitionInfo(s,[]).available,false);assert.throws(()=>transitionToScheme(s,[]),/недоступна/);
  b.status='draft';assert.equal(schemeTransitionInfo(s,[b]).available,false);assert.throws(()=>transitionToScheme(s,[b]),/не готова/);assert.deepEqual(s,before);
  const incomplete=freshSchemeSession(a);assert.equal(schemeTransitionInfo(incomplete,[b]),null);assert.throws(()=>transitionToScheme(incomplete,[b]));
});

test('locking captures the whole scheme path, blocks navigation and counts one trade',()=>{
  const {a,b}=linked();let s=finish(transitionToScheme(finish(freshSchemeSession(a)),[a,b]));
  s=lockDecision(s,'trade');s.trade={...s.trade,outcome:'win',stake:'5',payout:'8.95'};
  assert.equal(s.decisionSnapshot.schemePath.length,2);assert.equal(s.decisionSnapshot.schemePath[0].schemeId,a.id);
  assert.throws(()=>transitionToScheme(s,[a,b]),/зафиксирован/);assert.throws(()=>returnToScheme(s,0),/зафиксирован/);
  assert.equal(statistics([s]).wins,1);assert.deepEqual(restore(s),s);assert.match(csv([s]),/Выбор ситуации · v1 → Продолжение локального тренда · v1/);
  const altered=structuredClone(s);altered.schemeTrail.previous[0].answers[a.startId]=a.nodes[0].options[1].id;
  // Keep a valid connection so the locked path comparison, rather than link validation, detects the change.
  altered.schemeTrail.previous[0].schemeSnapshot.nodes[2].nextSchemeId=b.id;
  assert.throws(()=>restore(altered),/Маршрут не совпадает/);
  const missingPath=structuredClone(s);delete missingPath.decisionSnapshot.schemePath;assert.throws(()=>restore(missingPath));
});

test('import rejects broken archived answers, links, cursors and malformed trail shapes',()=>{
  const {a,b}=linked(),s=transitionToScheme(finish(freshSchemeSession(a)),[a,b]);
  const corruptions=[
    x=>x.schemeTrail.previous[0].answers[a.startId]='invalid',
    x=>x.schemeTrail.previous[0].schemeSnapshot.nodes[1].nextSchemeId='elsewhere',
    x=>x.schemeTrail.previous[0].cursor=50,
    x=>x.schemeTrail.previous[0].algorithmVersion='custom.999',
    x=>x.schemeTrail.next={},
    x=>x.schemeTrail.previous.push(null)
  ];
  for(const mutate of corruptions){const bad=structuredClone(s);mutate(bad);assert.throws(()=>restore(bad));}
  const legacy=finish(freshSchemeSession(scheme('Старая схема')));assert.deepEqual(restore(lockDecision(legacy,'observation')).answers,legacy.answers);
});

test('linked result maps show complete escaped destination names without creating false graph edges',()=>{
  const {a,b}=linked();b.name='Подробная проверка окончания локального отката и реакции у заранее выбранного сопротивления <тест>';
  const names=new Map([[b.id,b.name]]),map=layoutSchemeMap(a,{schemeNames:names}),p=map.positions.get(a.nodes[1].id);
  assert.equal(p.linkLines.join(' '),'→ '+b.name);assert.ok(p.linkLines.length>1);assert.ok(p.height>76);
  assert.equal(map.edges.length,2);
  const html=renderSchemeMap(a,{esc,schemeNames:names});assert.ok(html.includes('ИТОГ · ПЕРЕХОД'));assert.ok(html.includes('&lt;тест>'));assert.ok(!html.includes('<тест>'));assert.ok(!html.includes('…'));
});

test('the result editor offers ready schemes, marks drafts and retains an unavailable selected destination',async()=>{
  const {a,b}=linked(),draft=scheme('Черновая схема');draft.status='draft';b.name='<Локальная схема>';
  a.editorNodeId=a.nodes[1].id;
  const builder=createBuilder({getSchemes:()=>[a,b,draft],save:()=>{},persist:async()=>true,remove:async()=>{},run:async()=>{},render:()=>{},notify:()=>{},esc});
  await builder.handleClick({dataset:{builderAction:'edit',id:a.id}});
  let html=builder.render();assert.ok(html.includes('После этого итога'));assert.ok(html.includes('Завершить разбор'));assert.ok(html.includes('&lt;Локальная схема>'));assert.ok(html.includes('Черновая схема · черновик'));
  assert.ok(!html.includes('<option value="'+a.id+'"'));
  a.nodes[1].nextSchemeId='deleted';html=builder.render();assert.ok(html.includes('Схема недоступна'));assert.ok(html.includes('value="deleted" selected disabled'));
});
