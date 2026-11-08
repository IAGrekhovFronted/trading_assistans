import test from 'node:test';
import assert from 'node:assert/strict';
import {freshSession,freshSchemeSession,answerAndAdvance,routeFor,lockDecision,validateImport,FORMAT} from '../engine.mjs';
import {newScheme,newQuestion,newOption} from '../schemes.mjs';
test('a built-in answer advances immediately and the cursor survives JSON restoration',()=>{
  const original=freshSession(),next=answerAndAdvance(original,'global','down');
  assert.equal(next.cursor,1);assert.equal(routeFor(next).steps[next.cursor].key,'wave');assert.deepEqual(original.answers,{});
  const restored=validateImport(JSON.parse(JSON.stringify({format:FORMAT,sessions:[next]})))[0];assert.equal(restored.cursor,1);assert.equal(restored.answers.global,'down');
});
test('repeating an unchanged answer after Back preserves later answers; changing it removes them',()=>{
  let s=answerAndAdvance(freshSession(),'global','down');s=answerAndAdvance(s,'wave','with');s=answerAndAdvance(s,'local','down');
  const before=structuredClone(s),repeat=answerAndAdvance({...s,cursor:0},'global','down');
  assert.equal(repeat.cursor,1);assert.deepEqual(repeat.answers,before.answers);assert.deepEqual(s,before);
  const changed=answerAndAdvance({...s,cursor:0},'global','unclear');assert.deepEqual(changed.answers,{global:'unclear'});assert.equal(routeFor(changed).steps[changed.cursor].key,'local');
});
test('custom choices including a third option move to the next question or result without locking a decision',()=>{
  const scheme=newScheme(),first=scheme.nodes[0],second=newQuestion();second.title='Второй вопрос';second.options.forEach(o=>o.next=scheme.nodes[1].id);first.options[0].next=second.id;first.options.push(newOption('Не уверен',scheme.nodes[2].id));scheme.nodes.push(second);
  let s=answerAndAdvance(freshSchemeSession(scheme),first.id,first.options[0].id);assert.equal(routeFor(s).steps[s.cursor].key,second.id);
  s=answerAndAdvance(s,second.id,second.options[0].id);assert.equal(s.cursor,routeFor(s).steps.length);assert.equal(routeFor(s).complete,true);assert.equal(s.decisionSnapshot,undefined);
  const repeated=answerAndAdvance({...s,cursor:0},first.id,first.options[0].id);assert.equal(repeated.answers[second.id],second.options[0].id);
  const third=answerAndAdvance({...s,cursor:0},first.id,first.options[2].id);assert.equal(third.cursor,1);assert.deepEqual(third.answers,{[first.id]:first.options[2].id});assert.equal(routeFor(third).result.kind,'waiting');
  assert.equal(validateImport(JSON.parse(JSON.stringify({format:FORMAT,sessions:[third]})))[0].cursor,1);
});
test('automatic navigation preserves zone fields and rejects invalid or locked answers',()=>{
  const answers={global:'down',wave:'with',local:'down',pullback:'yes'},s={...freshSession(),answers,zone:'80 000–80 020',zoneStrength:'strong'};
  const next=answerAndAdvance(s,'level','yes');assert.equal(next.zone,s.zone);assert.equal(next.zoneStrength,'strong');assert.equal(routeFor(next).steps[next.cursor].key,'stoch');
  assert.throws(()=>answerAndAdvance(s,'level','invalid'));
  let waiting=answerAndAdvance(freshSession(),'global','down');waiting=answerAndAdvance(waiting,'wave','against');waiting=answerAndAdvance(waiting,'correction','continues');
  assert.equal(waiting.cursor,routeFor(waiting).steps.length);
  const locked=lockDecision(waiting,'observation');assert.throws(()=>answerAndAdvance(locked,'correction','continues'),/зафиксирован/);
});
