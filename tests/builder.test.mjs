import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuilder} from '../builder.mjs';
import {newScheme} from '../schemes.mjs';

test('deleting a library card targets its ID, even when another scheme is open',async()=>{
  const a=newScheme(),b=newScheme();let schemes=[a,b],removed;
  const builder=createBuilder({getSchemes:()=>schemes,save:()=>{},remove:async id=>{removed=id;schemes=schemes.filter(s=>s.id!==id);},run:()=>{},render:()=>{},notify:()=>{},esc:String});
  await builder.handleClick({dataset:{builderAction:'edit',id:a.id}});
  const previous=globalThis.confirm;
  try{globalThis.confirm=()=>true;await builder.handleClick({dataset:{builderAction:'delete',id:b.id}});}
  finally{if(previous===undefined)delete globalThis.confirm;else globalThis.confirm=previous;}
  assert.equal(removed,b.id);assert.deepEqual(schemes.map(s=>s.id),[a.id]);
});
test('cancelling deletion leaves the ready scheme in the library',async()=>{
  const s=newScheme();let removed=false;const builder=createBuilder({getSchemes:()=>[s],save:()=>{},remove:async()=>{removed=true;},run:()=>{},render:()=>{},notify:()=>{},esc:String});
  const previous=globalThis.confirm;
  try{globalThis.confirm=()=>false;await builder.handleClick({dataset:{builderAction:'delete',id:s.id}});}
  finally{if(previous===undefined)delete globalThis.confirm;else globalThis.confirm=previous;}
  assert.equal(removed,false);
});
test('incomplete draft is durably saved before returning to the library and can be resumed',async()=>{
  const scheme=newScheme();scheme.nodes[0].options[0].next='';scheme.editorNodeId=scheme.nodes[2].id;
  let schemes=[scheme],stored,committed=false;
  const options={getSchemes:()=>schemes,save:s=>{schemes=[s];},persist:async()=>{stored=structuredClone(schemes);committed=true;return true;},remove:async()=>{},run:async()=>{},render:()=>{},notify:()=>{},esc:String};
  const builder=createBuilder(options);await builder.handleClick({dataset:{builderAction:'edit',id:scheme.id}});
  await builder.handleClick({dataset:{builderAction:'save-draft'}});
  assert.equal(committed,true);assert.equal(stored[0].status,'draft');assert.equal(stored[0].nodes[0].options[0].next,'');
  assert.equal(stored[0].editorNodeId,scheme.nodes[2].id);assert.ok(builder.render().includes('Продолжить →'));
  schemes=stored;const reopened=createBuilder(options);await reopened.handleClick({dataset:{builderAction:'edit',id:scheme.id}});
  assert.ok(reopened.render().includes('value="Ожидание"')); // The previously selected result is open.
});
test('failed persistence keeps the draft editor open and does not claim success',async()=>{
  const scheme=newScheme();let notice=false;
  const builder=createBuilder({getSchemes:()=>[scheme],save:()=>{},persist:async()=>false,remove:async()=>{},run:async()=>{},render:()=>{},notify:()=>{notice=true;},esc:String});
  await builder.handleClick({dataset:{builderAction:'edit',id:scheme.id}});
  await assert.rejects(builder.handleClick({dataset:{builderAction:'save-draft'}}),/Не удалось сохранить/);
  assert.equal(notice,false);assert.ok(builder.render().includes('data-builder-action="save-draft"'));
});
test('incomplete schema cannot be saved as ready',async()=>{
  const scheme=newScheme();scheme.nodes[0].options[0].next='';let saved=false,ran=false;
  const builder=createBuilder({getSchemes:()=>[scheme],save:()=>{saved=true;},persist:async()=>true,remove:async()=>{},run:async()=>{ran=true;},render:()=>{},notify:()=>{},esc:String});
  await builder.handleClick({dataset:{builderAction:'edit',id:scheme.id}});
  await builder.handleClick({dataset:{builderAction:'save-ready'}});
  assert.equal(saved,false);assert.equal(ran,false);
});
