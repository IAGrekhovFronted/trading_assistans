import test from 'node:test';
import assert from 'node:assert/strict';
import {imageGallery,assertImageGallery,MAX_SCHEME_IMAGES} from '../hint-images.mjs';
import {newScheme,duplicateScheme,validateSchemes} from '../schemes.mjs';
import {freshSchemeSession,routeFor,answerFor,lockDecision,validateImport,FORMAT} from '../engine.mjs';
import {createBuilder} from '../builder.mjs';
const image=(id,name=id+'.png')=>({id,name,data:'data:image/png;base64,AAAA'});
const file=(name='file.png')=>({name,type:'image/png',size:3});
function harness(schemes,readImage=async f=>({name:f.name,data:'data:image/png;base64,AAAA'})){
 return createBuilder({getSchemes:()=>schemes,save:s=>{schemes[schemes.findIndex(x=>x.id===s.id)]=s;},persist:async()=>true,remove:async()=>{},run:async()=>{},render:()=>{},notify:()=>{},esc:String,readImage});
}
const edit=(b,s)=>b.handleClick({dataset:{builderAction:'edit',id:s.id}});
test('legacy single attachments remain visible, migrate only on editing and keep older run snapshots',async()=>{
 const s=newScheme(),q=s.nodes[0];q.hintImage={name:'legacy.png',data:'data:image/png;base64,AAAA'};q.options[0].exampleImage={...q.hintImage};
 const before=structuredClone(s),run=freshSchemeSession(s),b=harness([s]);await edit(b,s);
 assert.equal(imageGallery(q,'hintImages','hintImage').length,1);assert.deepEqual(s,before);
 await b.attachHintImages([file('two.png'),file('three.png')]);await b.attachAnswerImages([file('answer-two.png')],q.options[0].id);
 assert.deepEqual(q.hintImages.map(i=>i.name),['legacy.png','two.png','three.png']);assert.equal(q.hintImage,undefined);
 assert.equal(q.options[0].exampleImages.length,2);assert.equal(q.options[0].exampleImage,undefined);
 assert.equal(imageGallery(routeFor(run).steps[0],'hintImages','hintImage').length,1);
});
test('gallery backups restore every image in library, copied schemes and locked sessions',()=>{
 const s=newScheme(),q=s.nodes[0];q.hintImages=[image('h1'),image('h2')];q.options[0].exampleImages=[image('a1'),image('a2')];q.options[1].exampleImages=[image('b1')];
 const copy=duplicateScheme(s),run=lockDecision(answerFor(freshSchemeSession(s),q.id,q.options[0].id),'observation');
 const backup=JSON.parse(JSON.stringify({format:FORMAT,sessions:[run],schemes:[s]}));
 assert.equal(validateSchemes(backup.schemes)[0].nodes[0].hintImages.length,2);
 assert.deepEqual(routeFor(validateImport(backup)[0]).steps[0].options[0].exampleImages,[image('a1'),image('a2')]);
 s.nodes[0].hintImages.splice(0,1);s.nodes[0].options[0].exampleImages[0].name='changed';
 assert.equal(copy.nodes[0].hintImages.length,2);assert.equal(run.schemeSnapshot.nodes[0].options[0].exampleImages[0].name,'a1.png');
});
test('imports reject excessive counts, unsafe image IDs, duplicate IDs and invalid image payloads',()=>{
 for(const values of [Array.from({length:MAX_SCHEME_IMAGES+1},(_,i)=>image('x'+i)),[image('same'),image('same')],[image('<unsafe>')],[{...image('bad'),data:'javascript:alert(1)'}]]){
  assert.throws(()=>assertImageGallery(values));
  const s=newScheme();s.nodes[0].hintImages=values;assert.throws(()=>validateSchemes([s]));
  delete s.nodes[0].hintImages;s.nodes[0].options[0].exampleImages=values;const run={...freshSchemeSession(newScheme()),schemeId:s.id,schemeSnapshot:s};
  assert.throws(()=>validateImport({format:FORMAT,sessions:[run]}));
 }
});
test('concurrent batches keep selection order and stay with the original owner after editor switching',async()=>{
 const a=newScheme(),b=newScheme(),reads=[];const builder=harness([a,b],()=>new Promise(resolve=>reads.push(resolve)));await edit(builder,a);
 const first=builder.attachHintImages([file('one.png'),file('two.png')]),second=builder.attachHintImages([file('three.png')]);
 await edit(builder,b);reads[2](image('three'));reads[1](image('two'));reads[0](image('one'));await Promise.all([first,second]);
 assert.deepEqual(a.nodes[0].hintImages.map(i=>i.name),['one.png','two.png','three.png']);assert.equal(b.nodes[0].hintImages,undefined);
});
test('a failed read or invalid batch cannot partially append images or erase saved attachments',async()=>{
 const s=newScheme(),q=s.nodes[0];q.hintImages=[image('saved')];let reads=0;
 const b=harness([s],async f=>{reads++;if(f.name==='fail.png')throw new Error('Read failed');return image(f.name);});await edit(b,s);
 await assert.rejects(b.attachHintImages([file('good.png'),file('fail.png')]),/Read failed/);assert.deepEqual(q.hintImages,[image('saved')]);
 reads=0;await assert.rejects(b.attachHintImages([file(),{...file(),type:'image/svg+xml'}]));assert.equal(reads,0);assert.deepEqual(q.hintImages,[image('saved')]);
});
test('capacity is checked again when queued additions complete',async()=>{
 const s=newScheme(),q=s.nodes[0];q.hintImages=Array.from({length:9},(_,i)=>image('saved'+i));
 const reads=[],b=harness([s],()=>new Promise(resolve=>reads.push(resolve)));await edit(b,s);
 const one=b.attachHintImages([file('one.png')]),two=b.attachHintImages([file('two.png')]);reads[1](image('two'));reads[0](image('one'));
 await one;await assert.rejects(two,/предел/);assert.equal(q.hintImages.length,10);assert.equal(q.hintImages.at(-1).name,'one.png');
});
test('replacement or deletion targets one stable image ID without affecting sibling images',async()=>{
 const s=newScheme(),q=s.nodes[0];q.options[0].exampleImages=[image('one'),image('two'),image('three')];
 const b=harness([s]);await edit(b,s);await b.attachAnswerImages([file('replacement.png')],q.options[0].id,'two');
 assert.deepEqual(q.options[0].exampleImages.map(i=>i.name),['one.png','replacement.png','three.png']);
 await b.handleClick({dataset:{builderAction:'remove-answer-image',id:q.options[0].id,imageId:'one'}});
 assert.deepEqual(q.options[0].exampleImages.map(i=>i.id),['two','three']);
});
