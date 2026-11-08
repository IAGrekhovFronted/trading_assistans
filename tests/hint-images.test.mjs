import test from 'node:test';
import assert from 'node:assert/strict';
import {assertHintImage,validateHintFile,MAX_HINT_IMAGE_BYTES,imageGallery} from '../hint-images.mjs';
import {newScheme,validateSchemes,duplicateScheme} from '../schemes.mjs';
import {freshSchemeSession,routeFor,answerFor,lockDecision,validateImport,FORMAT} from '../engine.mjs';
import {createBuilder} from '../builder.mjs';
const image=(name='example.png')=>({name,data:'data:image/png;base64,AAAA'});
const file=(name='file.png')=>({name,type:'image/png',size:3});
test('hint image validation rejects executable URLs, unsupported formats, and malformed base64',()=>{
  assert.equal(assertHintImage(image()).name,'example.png');
  for(const data of ['https://example.com/image.png','data:image/svg+xml;base64,AAAA','data:image/png;base64,@@@@','data:image/png;base64,AAA'])assert.throws(()=>assertHintImage({name:'bad',data}));
  assert.throws(()=>assertHintImage({name:'bad',data:'data:image/png;base64,'+'A'.repeat(Math.ceil(MAX_HINT_IMAGE_BYTES/3)*4+4)}));
});
test('file selection enforces the upload limit before reading',()=>{
  assert.equal(validateHintFile({type:'image/jpeg',size:MAX_HINT_IMAGE_BYTES}).size,MAX_HINT_IMAGE_BYTES);
  assert.throws(()=>validateHintFile({type:'image/jpeg',size:MAX_HINT_IMAGE_BYTES+1}));
  assert.throws(()=>validateHintFile({type:'image/svg+xml',size:100}));
});
test('hint screenshots survive full JSON round-trip in both library and decision snapshot',()=>{
  const scheme=newScheme(),q=scheme.nodes[0];q.hintImage=image();
  const session=lockDecision(answerFor(freshSchemeSession(scheme),q.id,q.options[0].id),'observation');
  const data=JSON.parse(JSON.stringify({format:FORMAT,sessions:[session],schemes:[scheme]}));
  assert.deepEqual(validateSchemes(data.schemes)[0].nodes[0].hintImage,image());
  assert.deepEqual(routeFor(validateImport(data)[0]).steps[0].hintImage,image());
  const old=newScheme();assert.equal(validateSchemes([old]).length,1);assert.equal(routeFor(freshSchemeSession(old)).steps[0].hintImage,undefined);
});
test('editing or removing the library image leaves existing sessions and copies unchanged',()=>{
  const scheme=newScheme();scheme.nodes[0].hintImage=image();
  const run=freshSchemeSession(scheme),copy=duplicateScheme(scheme);
  scheme.nodes[0].hintImage.name='changed.png';delete scheme.nodes[0].hintImage;
  assert.equal(routeFor(run).steps[0].hintImage.name,'example.png');assert.equal(copy.nodes[0].hintImage.name,'example.png');
});
test('invalid hint images are rejected in library and session imports',()=>{
  const scheme=newScheme();scheme.nodes[0].hintImage=image();const run=freshSchemeSession(scheme);
  run.schemeSnapshot.nodes[0].hintImage.data='javascript:alert(1)';assert.throws(()=>validateImport({format:FORMAT,sessions:[run]}));
  scheme.nodes[0].hintImage.data='data:image/png;base64,?';assert.throws(()=>validateSchemes([scheme]));
});
function harness(schemes,readImage){
  const builder=createBuilder({getSchemes:()=>schemes,save:s=>{schemes[schemes.findIndex(x=>x.id===s.id)]=s;},persist:async()=>true,remove:async()=>{},run:async()=>{},render:()=>{},notify:()=>{},esc:String,readImage});
  return builder;
}
test('finishing upload after selecting another scheme attaches to the original question',async()=>{
  const a=newScheme(),b=newScheme();let resolve;
  const builder=harness([a,b],()=>new Promise(r=>{resolve=r;}));
  await builder.handleClick({dataset:{builderAction:'edit',id:a.id}});const upload=builder.attachHintImage(file());
  await builder.handleClick({dataset:{builderAction:'edit',id:b.id}});resolve(image());await upload;
  assert.deepEqual(imageGallery(a.nodes[0],'hintImages','hintImage').map(({name,data})=>({name,data})),[image()]);assert.equal(b.nodes[0].hintImage,undefined);
});
test('the latest replacement wins when file reads finish out of order',async()=>{
  const scheme=newScheme(),reads=[];scheme.nodes[0].hintImage=image('original.png');
  const builder=harness([scheme],()=>new Promise(r=>reads.push(r)));
  await builder.handleClick({dataset:{builderAction:'edit',id:scheme.id}});
  const first=builder.attachHintImages([file('first')],'legacy'),second=builder.attachHintImages([file('second')],'legacy');
  reads[1](image('second.png'));await second;reads[0](image('first.png'));await first;
  assert.equal(scheme.nodes[0].hintImages[0].name,'second.png');
});
test('failed image load preserves the existing screenshot and removal keeps the run snapshot',async()=>{
  const scheme=newScheme();scheme.nodes[0].hintImage=image();const run=freshSchemeSession(scheme);
  const builder=harness([scheme],async()=>{throw new Error('Read failed');});
  await builder.handleClick({dataset:{builderAction:'edit',id:scheme.id}});
  await assert.rejects(builder.attachHintImage(file()),/Read failed/);assert.deepEqual(scheme.nodes[0].hintImage,image());
  await builder.handleClick({dataset:{builderAction:'remove-hint-image'}});
  assert.equal(scheme.nodes[0].hintImage,undefined);assert.deepEqual(routeFor(run).steps[0].hintImage,image());
});
