import test from 'node:test';
import assert from 'node:assert/strict';
import {freshSession,answer,route,evaluation,lockDecision,statistics,validateImport,FORMAT,csv} from '../engine.mjs';
const complete={global:'down',wave:'with',local:'down',pullback:'yes',level:'yes',stoch:'yes',reaction:'yes',confirmation:'structure'};
function session(answers=complete){const s=freshSession();s.answers={...answers};return s;}
test('complete down scenario is marked, without predicting an outcome',()=>{assert.equal(evaluation(complete).kind,'matched');assert.equal(route(complete).complete,true);});
test('unclear global context still reaches local structure',()=>{const r=route({global:'unclear'});assert.deepEqual(r.steps.map(x=>x.key),['global','local']);});
test('ongoing global pullback ends in waiting',()=>{const a={global:'down',wave:'against',correction:'continues'};assert.equal(evaluation(a).code,'correction');assert.equal(route(a).steps.at(-1).key,'correction');});
test('early response is not converted to structural confirmation',()=>{assert.equal(evaluation({...complete,confirmation:'first'}).kind,'waiting');});
test('contradictory context needs clarification',()=>{assert.equal(evaluation({...complete,local:'up'}).code,'conflict');});
test('mirror branch stays explicitly experimental',()=>{assert.equal(evaluation({...complete,global:'up',local:'up'}).experimental,true);});
test('changing context removes downstream answers',()=>{const s=answer(session(),'global','up');assert.deepEqual(s.answers,{global:'up'});});
test('captured decision cannot be rewritten by answering later',()=>{const locked=lockDecision(session(),'trade');assert.throws(()=>answer(locked,'global','up'));assert.deepEqual(locked.decisionSnapshot.answers,complete);});
test('win rate excludes pending, observations, and refunds; net requires amounts',()=>{
  const make=(outcome,stake='',payout='')=>{const s=lockDecision(session(),'trade');s.trade={...s.trade,outcome,stake,payout};return s;};
  const records=[make('win','5','8,95'),make('loss','7','0'),make('draw','5','5'),make('pending','5',''),lockDecision(session(),'observation'),make('win')];
  const x=statistics(records);assert.equal(x.winrate,66.7);assert.equal(x.net,-3.05);assert.equal(x.netCount,3);assert.equal(x.pending,1);assert.equal(x.observations,1);
});
test('export can be reimported including a waiting record',()=>{const s=lockDecision(session({...complete,confirmation:'first'}),'trade');assert.equal(validateImport({format:FORMAT,sessions:[s]}).length,1);});
test('import rejects malformed snapshots and unreachable answers',()=>{
  const s=lockDecision(session(),'trade');s.decisionSnapshot={};assert.throws(()=>validateImport({format:FORMAT,sessions:[s]}));
  const bad=session({global:'unclear',wave:'with'});assert.throws(()=>validateImport({format:FORMAT,sessions:[bad]}));
});
test('CSV quotes notes and neutralizes spreadsheet formulas',()=>{const s=session();s.notes='=SUM(1;2)';assert.ok(csv([s]).includes('"\'=SUM(1;2)"'));});
