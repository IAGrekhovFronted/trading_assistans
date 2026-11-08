import test from 'node:test';
import assert from 'node:assert/strict';
import {isFileDrag,imageFilesFromDrop,bindImageDrop} from '../image-drop.mjs';
const file=(name='chart.png',type='image/png',size=100)=>({name,type,size});
const transfer=files=>({types:['Files'],files,dropEffect:'none'});
function fixture(onFiles=async()=>{}){
  const handlers=new Map(),classes=new Set(),errors=[],zone={dataset:{imageDrop:'hint',maxFiles:'1'},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}};
  const target={closest:()=>zone},outside={closest:()=>null};
  const eventTarget={addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)};
  const dispose=bindImageDrop({root:{contains:n=>n===zone},eventTarget,onFiles,onError:message=>errors.push(message)});
  const send=(name,dt=transfer([file()]),to=target)=>{const event={target:to,dataTransfer:dt,prevented:false,preventDefault(){this.prevented=true;}};return {event,result:handlers.get(name)?.(event)};};
  return {send,zone,classes,errors,outside,dispose,handlers};
}
test('file drags are recognized before protected FileList becomes readable',()=>{
  assert.equal(isFileDrag({types:['Files'],files:[]}),true);
  assert.equal(isFileDrag({types:['text/uri-list'],files:[]}),false);
});
test('drop validates the whole batch and different limits before accepting any files',()=>{
  assert.equal(imageFilesFromDrop(transfer([file()]),1).length,1);
  assert.equal(imageFilesFromDrop(transfer([file(),file('second.png')]),4).length,2);
  assert.throws(()=>imageFilesFromDrop(transfer([file(),file('second.png')]),1),/один/);
  assert.throws(()=>imageFilesFromDrop(transfer([file(),file('bad.svg','image\/svg+xml')]),4));
  assert.throws(()=>imageFilesFromDrop(transfer([file('large.png','image/png',6*1024*1024)]),1));
});
test('nested drag events keep highlighting until leaving the whole drop area',()=>{
  const f=fixture();f.send('dragenter');f.send('dragenter');f.send('dragleave');assert.equal(f.classes.has('is-dragover'),true);
  f.send('dragleave');assert.equal(f.classes.has('is-dragover'),false);f.dispose();
});
test('valid drop clears highlighting and forwards files once to the intended zone',async()=>{
  const calls=[],f=fixture(async(files,zone)=>calls.push({files,zone})),dt=transfer([file()]);
  f.send('dragenter',dt);const over=f.send('dragover',dt);assert.equal(over.event.prevented,true);assert.equal(dt.dropEffect,'copy');
  const dropped=f.send('drop',dt);await dropped.result;
  assert.equal(dropped.event.prevented,true);assert.equal(f.classes.has('is-dragover'),false);
  assert.equal(calls.length,1);assert.equal(calls[0].zone,f.zone);assert.equal(calls[0].files[0].name,'chart.png');f.dispose();
});
test('invalid drop does not invoke attachment or discard a previously saved image',async()=>{
  let saved='existing.png';const f=fixture(async files=>{saved=files[0].name;});
  await f.send('drop',transfer([file('bad.svg','image/svg+xml')])).result;
  await f.send('drop',transfer([file(),file('second.png')])).result;
  assert.equal(saved,'existing.png');assert.equal(f.errors.length,2);f.dispose();
});
test('dropping files outside an upload area prevents navigation; ordinary text remains untouched',async()=>{
  const f=fixture();const dropped=f.send('drop',transfer([file()]),f.outside);await dropped.result;
  assert.equal(dropped.event.prevented,true);assert.equal(f.errors.length,1);
  const text=f.send('drop',{types:['text/plain'],files:[]},f.outside);await text.result;assert.equal(text.event.prevented,false);f.dispose();
});
test('an attachment error is reported and does not leave a highlighted or blocked area',async()=>{
  let fail=true;const f=fixture(async()=>{if(fail)throw new Error('Storage failed');});
  f.send('dragenter');await f.send('drop').result;assert.equal(f.classes.has('is-dragover'),false);assert.deepEqual(f.errors,['Storage failed']);
  fail=false;await f.send('drop').result;assert.equal(f.errors.length,1);f.dispose();assert.equal(f.handlers.size,0);
});

test('answer gallery drop forwards a batch with its option owner instead of only the first file',async()=>{
  const calls=[],f=fixture(async(files,zone)=>calls.push({names:files.map(file=>file.name),kind:zone.dataset.imageDrop,optionId:zone.dataset.optionId}));
  f.zone.dataset.imageDrop='answer';f.zone.dataset.maxFiles='10';f.zone.dataset.optionId='answer_one';
  await f.send('drop',transfer([file('first.png'),file('second.png')])).result;
  assert.deepEqual(calls,[{names:['first.png','second.png'],kind:'answer',optionId:'answer_one'}]);assert.equal(f.errors.length,0);f.dispose();
});
