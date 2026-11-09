import test from 'node:test';
import assert from 'node:assert/strict';
import {createTradeImport} from '../trade-import.mjs';
import {freshSession,lockDecision} from '../engine.mjs';
const sample='Открытие\n74892 · 09.11.2026 22:11:27\nЗакрытие\n74980.8 · 09.11.2026 22:16:27\nСумма сделки\n$500\nВыплата\n$925\nРежим\nSprint\n№\n226175023';
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const make=()=>{const s=freshSession();s.answers={global:'down',wave:'against',correction:'continues'};return lockDecision(s,'trade');};
function harness(){
 const state={current:make(),saved:[],renders:0,notifications:[],persist:async()=>true};
 const importer=createTradeImport({getCurrent:()=>state.current,save:s=>{state.saved.push(s);state.current=s;},persist:()=>state.persist(),render:()=>state.renders++,notify:v=>state.notifications.push(v),esc});
 const action=(type,id=state.current.id)=>importer.handleAction({dataset:{action:type,sessionId:id}});
 const input=(value,field='text')=>importer.handleInput({dataset:{tradeImportField:field},value,closest:()=>({dataset:{sessionId:state.current.id},querySelector:()=>({innerHTML:''})})});
 return {state,importer,action,input};
}
test('parse is a preview; only explicit apply writes to the same trade and preserves the decision',async()=>{
 const {state,importer,action,input}=harness(),before=structuredClone(state.current);input(sample);
 await action('parse-trade-import');assert.equal(state.saved.length,0);assert.deepEqual(state.current,before);assert.ok(importer.panel(state.current).includes('Заполнить поля'));
 await action('apply-trade-import');assert.equal(state.saved.length,1);assert.equal(state.current.id,before.id);assert.deepEqual(state.current.decisionSnapshot,before.decisionSnapshot);assert.equal(state.current.trade.stake,'500');assert.ok(importer.panel(state.current).includes('Данные перенесены'));
});
test('editing source text or format invalidates a preview and invalid input cannot change filled fields',async()=>{
 const {state,importer,action,input}=harness();state.current.trade.stake='25';input(sample);await action('parse-trade-import');assert.ok(importer.panel(state.current).includes('будут заменены'));
 input(sample+'\nЛишняя строка');await action('apply-trade-import');assert.equal(state.saved.length,0);
 await action('parse-trade-import');assert.ok(importer.panel(state.current).includes('role="alert"'));assert.equal(state.current.trade.stake,'25');
 input(sample);await action('parse-trade-import');input('sprint-details-v1','parserId');await action('apply-trade-import');assert.equal(state.saved.length,0);
 await action('parse-trade-import');await action('clear-trade-import');assert.ok(!importer.panel(state.current).includes('Заполнить поля'));assert.equal(state.current.trade.stake,'25');
});
test('stale buttons cannot apply another record preview and duplicate apply clicks write once',async()=>{
 const {state,action,input}=harness();input(sample);await action('parse-trade-import');const first=state.current,other=make();state.current=other;
 await action('apply-trade-import',first.id);assert.equal(state.saved.length,0);state.current=first;
 let release;state.persist=()=>new Promise(resolve=>release=resolve);
 const pending=action('apply-trade-import');await action('apply-trade-import');assert.equal(state.saved.length,1);
 state.current=other;release(true);await pending;assert.equal(state.current.id,other.id);assert.equal(state.current.trade.stake,'');
});
test('failed persistence retains the parsed preview and edited values for a retry without claiming success',async()=>{
 const {state,importer,action,input}=harness();input(sample);await action('parse-trade-import');state.persist=async()=>false;
 await assert.rejects(action('apply-trade-import'),/Не удалось сохранить/);assert.equal(state.current.trade.stake,'500');assert.equal(state.notifications.length,0);assert.ok(!importer.panel(state.current).includes('Данные перенесены'));
 state.persist=async()=>true;await action('apply-trade-import');assert.equal(state.notifications.length,1);
 importer.forget(state.current.id);assert.ok(!importer.panel(state.current).includes('2026'));
});
test('source text and parse errors are escaped, and observations have no trade importer',async()=>{
 const {state,importer,action,input}=harness();input(sample+'\n<script>alert(1)</script>');await action('parse-trade-import');
 const html=importer.panel(state.current);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script>'));assert.ok(html.includes('role="alert"'));
 state.current.trade.executed=false;assert.equal(importer.panel(state.current),'');
});
