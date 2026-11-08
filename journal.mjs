export function selectCurrentRecordId(sessions,currentId){
  if(sessions.some(s=>s.id===currentId))return currentId;
  return sessions.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id))[0]?.id||null;
}
export function createJournalDeletion({getSessions,getCurrentId,confirm,flush,remove,commit}){
  const active=new Set(),blocked=new Set();let chain=Promise.resolve();
  return {
    canWrite:id=>!blocked.has(id),
    restored:id=>blocked.delete(id),
    async remove(id){
      if(active.has(id))return false;
      const target=getSessions().find(s=>s.id===id);if(!target)throw new Error('Запись уже удалена');
      active.add(id);let persisted=false;
      try{
        if(!await confirm(target))return false;
        blocked.add(id);
        const operation=chain.then(async()=>{
          if(!getSessions().some(s=>s.id===id))return false;
          if(await flush()===false)throw new Error('Не удалось сохранить изменения. Запись не удалена.');
          const remaining=getSessions().filter(s=>s.id!==id),nextId=selectCurrentRecordId(remaining,getCurrentId());
          // Deletion and the new current ID are one storage transaction.
          await remove(id,nextId);persisted=true;commit(id,nextId);return true;
        });
        chain=operation.catch(()=>{});
        return await operation;
      }catch(error){if(!persisted)blocked.delete(id);throw error;}
      finally{active.delete(id);}
    }
  };
}
