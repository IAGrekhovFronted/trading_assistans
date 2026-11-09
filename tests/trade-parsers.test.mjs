import test from 'node:test';
import assert from 'node:assert/strict';
import {tradeParserFactory,createTradeParserFactory,MAX_TRADE_TEXT_LENGTH} from '../trade-parsers.mjs';
import {sprintDetailsParser} from '../parsers/sprint-details.mjs';
import {applyParsedTrade} from '../trade-data.mjs';
import {freshSession,lockDecision,profit,validateImport,FORMAT,csv} from '../engine.mjs';
const sample='Открытие\n74892 · 09.11.2026 22:11:27\nЗакрытие\n74980.8 · 09.11.2026 22:16:27\nСумма сделки\n$500\nВыплата\n$925\nРежим\nSprint\n№\n226175023';
function locked(){const s=freshSession();s.answers={global:'down',wave:'against',correction:'continues'};return lockDecision(s,'trade');}

test('the supplied Sprint card preserves all values and second precision without timezone conversion',()=>{
  const parsed=tradeParserFactory.parse(sample);
  assert.equal(parsed.parserId,'sprint-details-v1');
  assert.deepEqual(parsed.fields,{entryPrice:'74892',entryTime:'2026-11-09T22:11:27',exitPrice:'74980.8',exitTime:'2026-11-09T22:16:27',stake:'500',payout:'925',outcome:'win',mode:'Sprint',externalId:'226175023'});
  const s=applyParsedTrade(locked(),parsed);assert.equal(profit(s),425);
});
test('common clipboard whitespace, inline labels and decimal commas are normalized',()=>{
  const input='\uFEFF'+sample.replaceAll('\n','\r\n').replace('74892','74\u00a0892,00').replace('74980.8','74\u202f980,80').replace('$500','$ 1\u2009000,50').replace('$925','1.850,95 USD').replace('Режим\r\nSprint','Режим: sprint').replace('№\r\n226175023','Номер сделки: 000226175023');
  const parsed=tradeParserFactory.parse(input,{parserId:'sprint-details-v1'}).fields;
  assert.equal(parsed.entryPrice,'74892');assert.equal(parsed.exitPrice,'74980.8');assert.equal(parsed.stake,'1000.5');assert.equal(parsed.payout,'1850.95');assert.equal(parsed.externalId,'000226175023');
  const us=tradeParserFactory.parse(sample.replace('$500','$1,000.50').replace('$925','$1,850.95'));assert.equal(us.fields.stake,'1000.5');
});
test('win, loss and refund follow the payout, independently of the direction of the price',()=>{
  assert.equal(tradeParserFactory.parse(sample.replace('$925','$0')).fields.outcome,'loss');
  assert.equal(tradeParserFactory.parse(sample.replace('$925','$500')).fields.outcome,'draw');
  assert.equal(tradeParserFactory.parse(sample.replace('74980.8','74000')).fields.outcome,'win');
  assert.equal(tradeParserFactory.parse(sample.replace('$500','$0.10').replace('$925','$0.30')).fields.outcome,'win');
});
test('dates validate the calendar and ordering, including leap days and crossing midnight',()=>{
  for(const value of [
    sample.replaceAll('09.11.2026','31.11.2026'),
    sample.replaceAll('09.11.2026','29.02.2026'),
    sample.replace('22:11:27','24:11:27'),
    sample.replace('22:16:27','22:10:27'),
    sample.replace('22:16:27','22:11:27')
  ])assert.throws(()=>tradeParserFactory.parse(value));
  const midnight=tradeParserFactory.parse(sample.replace('09.11.2026 22:11:27','09.11.2026 23:58:27').replace('09.11.2026 22:16:27','10.11.2026 00:03:27'));assert.equal(midnight.fields.exitTime,'2026-11-10T00:03:27');
  assert.doesNotThrow(()=>tradeParserFactory.parse(sample.replaceAll('09.11.2026','29.02.2028')));
});
test('missing fields, several trades, unexpected text and unsafe or ambiguous values never produce a partial result',()=>{
  const malformed=[
    sample.replace('№\n226175023',''),sample.replace('Выплата\n$925\n',''),sample+'\n'+sample,sample+'\nДополнительная строка',
    sample.replace('$500','$0'),sample.replace('$925','€925'),sample.replace('$925','$1,000'),sample.replace('$925','$1.234,5.6'),
    sample.replace('74892','Infinity'),sample.replace('74892','-74892'),sample.replace('74892','74 89 2'),
    sample.replace('226175023','<img src=x>'),sample.replace('Sprint','Classic'),sample.replace('22:11:27','22:11'),sample.replace('$925','')
  ];
  for(const value of malformed)assert.throws(()=>tradeParserFactory.parse(value));
  assert.throws(()=>tradeParserFactory.parse(sample+sample),/Повторяется|Лишняя/);
});
test('the factory supports independently registered parsers, explicit selection and deterministic ambiguity errors',()=>{
  const second={id:'second-format',label:'Второй формат',canParse:text=>text.startsWith('demo'),parse:()=>({stake:'1',payout:'2',outcome:'win'})};
  const factory=createTradeParserFactory([sprintDetailsParser,second]);assert.equal(factory.list().length,2);assert.equal(factory.parse('demo example').parserId,'second-format');
  assert.equal(factory.create(sample).id,'sprint-details-v1');
  const conflicting=createTradeParserFactory([{...second,canParse:()=>true},{...second,id:'third-format',canParse:()=>true}]);
  assert.throws(()=>conflicting.parse('example'),/несколько/);assert.equal(conflicting.parse('example',{parserId:'third-format'}).parserId,'third-format');
  assert.throws(()=>factory.parse(sample,{parserId:'not-registered'}),/Неизвестный/);
  assert.throws(()=>createTradeParserFactory([second,second]));assert.throws(()=>createTradeParserFactory([{id:'incomplete'}]));
});
test('unknown or oversized input is rejected; parser plugins cannot overwrite session controls',()=>{
  assert.throws(()=>tradeParserFactory.parse(''));assert.throws(()=>tradeParserFactory.parse('Другой формат'),/не распознан/);
  assert.throws(()=>tradeParserFactory.parse('x'.repeat(MAX_TRADE_TEXT_LENGTH+1)),/слишком длинный/);
  for(const fields of [{executed:true},{stake:'1',payout:'2',outcome:'loss'},{entryPrice:'NaN'},{}]){
    const factory=createTradeParserFactory([{id:'unsafe-format',label:'Проверка',canParse:()=>true,parse:()=>fields}]);assert.throws(()=>factory.parse('example'));
  }
});
test('applying a parse changes only the trade data, retains the locked decision and survives JSON and CSV',()=>{
  const source=locked();source.notes='Собственный комментарий';source.symbol='BTC/USDT';source.zone='Моя зона';source.screenshots=[{name:'sample.png',data:'data:image/png;base64,AAAA'}];
  const before=structuredClone(source),updated=applyParsedTrade(source,tradeParserFactory.parse(sample));
  assert.deepEqual(source,before);assert.equal(updated.id,source.id);assert.equal(updated.notes,source.notes);assert.equal(updated.zone,source.zone);assert.equal(updated.symbol,source.symbol);assert.deepEqual(updated.decisionSnapshot,source.decisionSnapshot);assert.deepEqual(updated.screenshots,source.screenshots);
  const restored=validateImport(JSON.parse(JSON.stringify({format:FORMAT,sessions:[updated]})))[0];assert.deepEqual(restored.trade,updated.trade);
  const output=csv([updated]);for(const value of ['2026-11-09T22:11:27','2026-11-09T22:16:27','226175023','Sprint','sprint-details-v1'])assert.ok(output.includes(value));
  assert.equal(profit(updated),425);assert.throws(()=>applyParsedTrade(freshSession(),tradeParserFactory.parse(sample)),/зафиксируй/);
});
test('old trades without new metadata stay importable; new metadata is validated before restore',()=>{
  const s=locked();for(const key of ['exitTime','externalId','mode','sourceParser'])delete s.trade[key];
  assert.doesNotThrow(()=>validateImport({format:FORMAT,sessions:[s]}));
  for(const extra of [{exitTime:'2026-02-30T12:00:00'},{mode:'x'.repeat(101)},{externalId:5},{sourceParser:'<script>'}]){
    const invalid=structuredClone(s);Object.assign(invalid.trade,extra);assert.throws(()=>validateImport({format:FORMAT,sessions:[invalid]}));
  }
});
