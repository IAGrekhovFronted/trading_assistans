import test from 'node:test';
import assert from 'node:assert/strict';
import {newScheme,duplicateScheme,validateSchemes} from '../schemes.mjs';
import {freshSchemeSession,routeFor,answerFor,lockDecision,validateImport,FORMAT} from '../engine.mjs';
import {createBuilder} from '../builder.mjs';
import {imageGallery} from '../hint-images.mjs';
const image=(name='example.png')=>({name,data:'data:image/png;base64,AAAA'});
const file=(name='file.png')=>({name,type:'image/png',size:3});
function harness(schemes,readImage=async file=>image(file.name)){
  return createBuilder({getSchemes:()=>schemes,save:s=>{schemes[schemes.findIndex(x=>x.id===s.id)]=s;},persist:async()=>true,remove:async()=>{},run:async()=>{},render:()=>{},notify:()=>{},esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),readImage});
}
const edit=(builder,s)=>builder.handleClick({dataset:{builderAction:'edit',id:s.id}});
test('answer examples survive library and locked-session JSON round-trip; older schemes need no image',()=>{
  const scheme=newScheme(),q=scheme.nodes[0];q.options[0].exampleImage=image('first.png');q.options[1].exampleImage=image('second.png');
  const run=lockDecision(answerFor(freshSchemeSession(scheme),q.id,q.options[0].id),'observation');
  const backup=JSON.parse(JSON.stringify({format:FORMAT,sessions:[run],schemes:[scheme]}));
  assert.deepEqual(validateSchemes(backup.schemes)[0].nodes[0].options[1].exampleImage,image('second.png'));
  assert.deepEqual(routeFor(validateImport(backup)[0]).steps[0].options[0].exampleImage,image('first.png'));
  assert.equal(routeFor(freshSchemeSession(newScheme())).steps[0].options[0].exampleImage,undefined);
});
test('unsafe or oversized answer examples are rejected in both scheme and session imports',()=>{
  for(const data of ['javascript:alert(1)','https://example.com/picture.png','data:image/svg+xml;base64,AAAA','data:image/png;base64,?','data:image/png;base64,'+'A'.repeat(7*1024*1024)]){
    const scheme=newScheme();scheme.nodes[0].options[0].exampleImage=image();const run=freshSchemeSession(scheme);
    scheme.nodes[0].options[0].exampleImage.data=data;run.schemeSnapshot.nodes[0].options[0].exampleImage.data=data;
    assert.throws(()=>validateSchemes([scheme]));assert.throws(()=>validateImport({format:FORMAT,sessions:[run]}));
  }
});
test('replacing and removing an answer example preserves existing runs and independent copies',async()=>{
  const scheme=newScheme(),option=scheme.nodes[0].options[0];option.exampleImage=image('old.png');
  const run=freshSchemeSession(scheme),copy=duplicateScheme(scheme),builder=harness([scheme]);await edit(builder,scheme);
  await builder.attachAnswerImages([file('new.png')],option.id,'legacy');assert.equal(option.exampleImages[0].name,'new.png');
  await builder.handleClick({dataset:{builderAction:'remove-answer-image',id:option.id}});
  assert.equal(option.exampleImage,undefined);assert.equal(scheme.status,'draft');
  assert.equal(routeFor(run).steps[0].options[0].exampleImage.name,'old.png');assert.equal(copy.nodes[0].options[0].exampleImage.name,'old.png');
});
test('an async answer upload stays with its original scheme, question and option when the editor changes',async()=>{
  const a=newScheme(),b=newScheme();let resolve;const builder=harness([a,b],()=>new Promise(r=>resolve=r));
  await edit(builder,a);const option=a.nodes[0].options[1],upload=builder.attachAnswerImage(file(),option.id);
  await edit(builder,b);resolve(image());await upload;
  assert.deepEqual(imageGallery(option,'exampleImages','exampleImage').map(({name,data})=>({name,data})),[image()]);assert.equal(a.nodes[0].options[0].exampleImage,undefined);assert.equal(b.nodes[0].options[1].exampleImage,undefined);
});
test('latest replacement wins per option without cancelling uploads to other options or the hint',async()=>{
  const scheme=newScheme(),q=scheme.nodes[0],reads=[],builder=harness([scheme],()=>new Promise(r=>reads.push(r)));await edit(builder,scheme);
  q.options[0].exampleImage=image('initial.png');
  const first=builder.attachAnswerImages([file()],q.options[0].id,'legacy'),second=builder.attachAnswerImages([file()],q.options[0].id,'legacy'),other=builder.attachAnswerImage(file(),q.options[1].id),hint=builder.attachHintImage(file());
  reads[1](image('new.png'));await second;reads[2](image('other.png'));await other;reads[3](image('hint.png'));await hint;reads[0](image('old.png'));await first;
  assert.equal(q.options[0].exampleImages[0].name,'new.png');assert.equal(q.options[1].exampleImages[0].name,'other.png');assert.equal(q.hintImages[0].name,'hint.png');
});
test('removing an example cancels an unfinished replacement; deleted options cannot receive stale files',async()=>{
  const scheme=newScheme(),q=scheme.nodes[0],reads=[],builder=harness([scheme],()=>new Promise(r=>reads.push(r)));await edit(builder,scheme);
  const option=q.options[0];option.exampleImage=image();const upload=builder.attachAnswerImages([file()],option.id,'legacy');
  await builder.handleClick({dataset:{builderAction:'remove-answer-image',id:option.id}});reads[0](image('late.png'));await upload;assert.equal(option.exampleImage,undefined);
  const removed=q.options[1],stale=builder.attachAnswerImage(file(),removed.id);q.options=q.options.filter(o=>o.id!==removed.id);reads[1](image());
  await assert.rejects(stale,/Ответ уже удалён/);assert.equal(q.options[0].exampleImage,undefined);
});
test('failed answer image reading retains the saved example and does not alter another option',async()=>{
  const scheme=newScheme(),q=scheme.nodes[0];q.options[0].exampleImage=image();
  const builder=harness([scheme],async()=>{throw new Error('Read failed');});await edit(builder,scheme);
  await assert.rejects(builder.attachAnswerImage(file(),q.options[0].id),/Read failed/);
  assert.deepEqual(q.options[0].exampleImage,image());assert.equal(q.options[1].exampleImage,undefined);
});
test('answer example controls escape names and labels and keep separate drop zones per option',async()=>{
  const scheme=newScheme(),q=scheme.nodes[0];q.options[0].label='<unsafe>';q.options[0].exampleImage=image('"file.png');
  const builder=harness([scheme]);await edit(builder,scheme);const html=builder.render();
  assert.equal((html.match(/data-image-drop="answer"/g)||[]).length,2);
  assert.ok(html.includes('data-option-id="'+q.options[1].id+'"'));assert.ok(html.includes('&quot;file.png'));assert.ok(!html.includes('<unsafe>'));
});
