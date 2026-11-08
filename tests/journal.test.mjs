import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournalDeletion,selectCurrentRecordId} from '../journal.mjs';
import {statistics} from '../engine.mjs';
const record=(id,day=1)=>({id,createdAt:'2026-11-'+String(day).padStart(2,'0')+'T10:00:00.000Z',screenshots:[{name:id+'.png',data:'data:image/png;base64,AAAA'}],disposition:'trade',trade:{executed:true,outcome:'win',stake:'5',payout:'8.95'}});
function harness(records,currentId=records[0]?.id||null,options={}){
  let sessions=structuredClone(records),current=currentId,storedCurrent=current,confirms=[],calls=[];
  const db=new Map(sessions.map(s=>[s.id,structuredClone(s)]));
  const deletion=createJournalDeletion({
    getSessions:()=>sessions,getCurrentId:()=>current,
    confirm:async target=>{confirms.push(target.id);return options.confirm?options.confirm(target):true;},
    flush:async()=>{calls.push('flush');return options.flush?options.flush():true;},
    remove:async(id,nextId)=>{calls.push('remove:'+id);if(options.remove)await options.remove(id,nextId);db.delete(id);storedCurrent=nextId;},
    commit:(id,nextId)=>{calls.push('commit:'+id);sessions=sessions.filter(s=>s.id!==id);current=nextId;}
  });
  return {deletion,db,confirms,calls,get sessions(){return sessions;},get current(){return current;},get storedCurrent(){return storedCurrent;}};
}
test('cancellation leaves the selected record, current pointer, attachments and storage unchanged',async()=>{
  const f=harness([record('a'),record('b')],'a',{confirm:async()=>false}),before=structuredClone(f.sessions);
  assert.equal(await f.deletion.remove('b'),false);assert.deepEqual(f.confirms,['b']);assert.deepEqual(f.sessions,before);assert.deepEqual(f.calls,[]);assert.equal(f.current,'a');assert.equal(f.db.size,2);assert.equal(f.deletion.canWrite('b'),true);
});
test('deleting a different row targets its ID, waits for autosave and updates totals only after storage succeeds',async()=>{
  let finish;const saved=new Promise(resolve=>finish=resolve),f=harness([record('a'),record('b')],'a',{remove:()=>saved});
  const operation=f.deletion.remove('b');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.sessions.length,2);assert.equal(f.deletion.canWrite('b'),false);assert.deepEqual(f.calls,['flush','remove:b']);
  finish();assert.equal(await operation,true);assert.equal(f.current,'a');assert.equal(f.storedCurrent,'a');assert.deepEqual(f.sessions.map(s=>s.id),['a']);assert.equal(f.db.has('b'),false);assert.equal(f.db.get('a').screenshots.length,1);assert.deepEqual(f.calls,['flush','remove:b','commit:b']);assert.equal(statistics(f.sessions).closed,1);
});
test('autosave or transaction failure keeps the row and current pointer and allows a safe retry',async()=>{
  for(const stage of ['flush','remove']){
    let fail=true;
    const f=harness([record('a'),record('b')],'a',{flush:async()=>stage==='flush'&&fail?false:true,remove:async()=>{if(stage==='remove'&&fail)throw new Error('Storage unavailable');}});
    await assert.rejects(f.deletion.remove('a'));assert.deepEqual(f.sessions.map(s=>s.id),['a','b']);assert.equal(f.current,'a');assert.equal(f.storedCurrent,'a');assert.equal(f.db.size,2);assert.equal(f.deletion.canWrite('a'),true);
    fail=false;assert.equal(await f.deletion.remove('a'),true);assert.equal(f.current,'b');
  }
});
test('deleting the current or final record selects an existing row or persists an empty journal',async()=>{
  const f=harness([record('a'),record('old',1),record('new',3)],'a');
  await f.deletion.remove('a');assert.equal(f.current,'new');assert.equal(f.storedCurrent,'new');
  await f.deletion.remove('old');await f.deletion.remove('new');assert.equal(f.sessions.length,0);assert.equal(f.db.size,0);assert.equal(f.current,null);assert.equal(f.storedCurrent,null);
  assert.equal(selectCurrentRecordId([...f.db.values()],f.storedCurrent),null);
  assert.equal(selectCurrentRecordId([record('old'),record('new',3)],'missing'),'new');
});
test('duplicate requests do not open two confirmations or remove the record twice',async()=>{
  let confirm;const f=harness([record('a')],'a',{confirm:()=>new Promise(resolve=>confirm=resolve)});
  const first=f.deletion.remove('a');assert.equal(await f.deletion.remove('a'),false);confirm(true);await first;
  assert.deepEqual(f.confirms,['a']);assert.equal(f.calls.filter(s=>s==='remove:a').length,1);
});
test('concurrent deletions serialize pointer selection and cannot leave the current ID on a deleted row',async()=>{
  const f=harness([record('a'),record('b',2),record('c',3)],'a');
  await Promise.all([f.deletion.remove('a'),f.deletion.remove('c')]);
  assert.deepEqual(f.sessions.map(s=>s.id),['b']);assert.equal(f.current,'b');assert.equal(f.storedCurrent,'b');
});
test('late autosave cannot recreate a deleted row, while explicit import can enable it again',async()=>{
  const f=harness([record('a')]);await f.deletion.remove('a');assert.equal(f.deletion.canWrite('a'),false);f.deletion.restored('a');assert.equal(f.deletion.canWrite('a'),true);await assert.rejects(f.deletion.remove('unknown'),/уже удалена/);
});
