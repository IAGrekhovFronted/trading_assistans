import test from 'node:test';
import assert from 'node:assert/strict';
import {newScheme,newQuestion,newResult,newOption,templateScheme,duplicateScheme,inspectScheme,validateSchemes,schemeStatus,withSchemeStatus} from '../schemes.mjs';
import {freshSchemeSession,routeFor,answerFor,evaluationFor,lockDecision,validateImport,FORMAT,csv} from '../engine.mjs';

test('custom branches lead to different user-defined results',()=>{
  const scheme=newScheme(),q=scheme.nodes[0],s=freshSchemeSession(scheme);
  assert.equal(evaluationFor(answerFor(s,q.id,q.options[0].id)).kind,'matched');
  assert.equal(evaluationFor(answerFor(s,q.id,q.options[1].id)).kind,'waiting');
});
test('the runner supports a variable number of steps beyond the old route limit',()=>{
  const scheme=newScheme(),end=newResult(),questions=Array.from({length:75},()=>newQuestion());
  questions.forEach((q,i)=>q.options.forEach(o=>o.next=questions[i+1]?.id||end.id));
  scheme.startId=questions[0].id;scheme.nodes=[...questions,end];assert.equal(inspectScheme(scheme).valid,true);
  let s=freshSchemeSession(scheme);for(const q of questions)s=answerFor(s,q.id,q.options[0].id);
  assert.equal(routeFor(s).steps.length,75);assert.equal(routeFor(s).complete,true);
});
test('changing a branch prunes answers that no longer belong to the path',()=>{
  const scheme=templateScheme();let s=freshSchemeSession(scheme);
  for(const q of scheme.nodes.filter(n=>n.type==='question'))s=answerFor(s,q.id,q.options[0].id);
  const first=scheme.nodes[0];s=answerFor(s,first.id,first.options[1].id);
  assert.deepEqual(Object.keys(s.answers),[first.id]);assert.equal(evaluationFor(s).kind,'waiting');
});
test('edits and deletion in the library cannot alter an existing run',()=>{
  const scheme=newScheme(),q=scheme.nodes[0];let s=freshSchemeSession(scheme);
  scheme.nodes[0].title='Changed';scheme.nodes[1].kind='waiting';scheme.revision=2;
  s=lockDecision(answerFor(s,q.id,q.options[0].id),'trade');
  assert.equal(routeFor(s).steps[0].title,'Что проверяем?');assert.equal(s.schemeSnapshot.revision,1);
  assert.equal(s.decisionSnapshot.conclusion.kind,'matched');assert.throws(()=>answerFor(s,q.id,q.options[1].id));
});
test('validation detects missing destinations and reachable cycles; unused blocks are warnings',()=>{
  const s=newScheme();s.nodes[0].options[0].next='missing';assert.equal(inspectScheme(s).valid,false);
  s.nodes[0].options[0].next=s.startId;assert.ok(inspectScheme(s).errors.some(e=>e.includes('цикл')));
  s.nodes[0].options[0].next=s.nodes[1].id;s.nodes.push(newResult());const v=inspectScheme(s);assert.equal(v.valid,true);assert.equal(v.warnings.length,1);
});
test('three choices and converging branches are accepted without a fixed yes/no format',()=>{
  const s=newScheme(),q=s.nodes[0];q.options.push(newOption('Не уверен',s.nodes[2].id));
  const run=freshSchemeSession(s),result=answerFor(run,q.id,q.options[2].id);
  assert.equal(inspectScheme(s).valid,true);assert.equal(evaluationFor(result).kind,'waiting');
});
test('backup restores custom sessions with their own scheme snapshot and library drafts',()=>{
  const scheme=newScheme(),q=scheme.nodes[0];const s=lockDecision(answerFor(freshSchemeSession(scheme),q.id,q.options[0].id),'observation');
  const copy=JSON.parse(JSON.stringify({format:FORMAT,sessions:[s],schemes:[scheme]}));
  assert.equal(validateImport(copy)[0].schemeSnapshot.name,scheme.name);assert.equal(validateSchemes(copy.schemes).length,1);
  copy.sessions[0].schemeSnapshot.nodes[1].kind='waiting';assert.throws(()=>validateImport(copy));
  scheme.nodes[0].options[0].next='';assert.equal(validateSchemes([scheme]).length,1);
});
test('duplicates have independent IDs and CSV identifies the scheme version',()=>{
  const scheme=newScheme(),copy=duplicateScheme(scheme);assert.notEqual(copy.id,scheme.id);copy.nodes[0].title='Independent';assert.notEqual(copy.nodes[0].title,scheme.nodes[0].title);
  const output=csv([freshSchemeSession(scheme)]);assert.ok(output.includes(scheme.id));assert.ok(output.includes(scheme.name));
});
test('import rejects IDs that can break markup or object keys',()=>{
  const scheme=newScheme();scheme.nodes[0].id='__proto__';assert.throws(()=>validateSchemes([scheme]));
  scheme.nodes[0].id='bad"attribute';assert.throws(()=>validateSchemes([scheme]));
});
test('valid schemes can remain drafts until explicitly marked ready; legacy libraries remain compatible',()=>{
  const s=newScheme();assert.equal(inspectScheme(s).valid,true);assert.equal(schemeStatus(s),'draft');
  const ready=withSchemeStatus(s,'ready');assert.equal(schemeStatus(ready),'ready');assert.equal(s.status,'draft');
  delete ready.status;assert.equal(schemeStatus(ready),'ready');ready.nodes[0].options[0].next='';assert.equal(schemeStatus(ready),'draft');
  assert.throws(()=>withSchemeStatus(ready,'ready'));
});
test('backups preserve unfinished drafts and selected editor block',()=>{
  const s=newScheme();s.nodes[0].options[0].next='';const draft=withSchemeStatus(s,'draft',s.nodes[2].id);
  const restored=validateSchemes(JSON.parse(JSON.stringify([draft])))[0];
  assert.equal(restored.status,'draft');assert.equal(restored.editorNodeId,s.nodes[2].id);
  restored.status='unknown';assert.throws(()=>validateSchemes([restored]));
});
