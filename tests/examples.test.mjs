import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHiddenExamples,createExampleVisibility} from '../examples.mjs';
test('example preferences accept known unique IDs and tolerate missing old metadata',()=>{
  assert.deepEqual(normalizeHiddenExamples(undefined),[]);
  assert.deepEqual(normalizeHiddenExamples(['entry','entry','unknown','context']),['entry','context']);
});
test('removing an example persists across reopening; restore brings all examples back',async()=>{
  let stored;const options={load:async()=>structuredClone(stored),save:async value=>{stored=structuredClone(value);}};
  const a=createExampleVisibility(options);await a.load();await a.hide('context');
  const b=createExampleVisibility(options);await b.load();assert.equal(b.isHidden('context'),true);assert.equal(b.isHidden('entry'),false);
  await b.restore();const c=createExampleVisibility(options);await c.load();assert.deepEqual(c.hidden,[]);
});
test('failed storage does not remove a visible example or prevent a later retry',async()=>{
  let fail=true;const v=createExampleVisibility({load:async()=>[],save:async()=>{if(fail)throw new Error('quota');}});
  await assert.rejects(v.hide('entry'),/quota/);assert.equal(v.isHidden('entry'),false);
  fail=false;await v.hide('entry');assert.equal(v.isHidden('entry'),true);
});
test('concurrent remove actions preserve both choices and reject unknown IDs',async()=>{
  let stored=[];const v=createExampleVisibility({load:async()=>stored,save:async value=>{stored=value;}});
  await Promise.all([v.hide('context'),v.hide('entry')]);assert.deepEqual(stored,['context','entry']);
  await assert.rejects(v.hide('anything'));assert.deepEqual(v.hidden,['context','entry']);
});
