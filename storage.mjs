let connection;
function open(){
  if(!connection)connection=new Promise((resolve,reject)=>{
    const r=indexedDB.open('entry-navigator-local',1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('sessions',{keyPath:'id'});r.result.createObjectStore('meta');};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
  return connection;
}
async function tx(store,mode,work){
  const db=await open();
  return new Promise((resolve,reject)=>{
    const t=db.transaction(store,mode);let result;
    const r=work(t.objectStore(store));r.onsuccess=()=>{result=r.result;};r.onerror=()=>reject(r.error);
    t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Сохранение прервано'));
  });
}
export const repository={all:()=>tx('sessions','readonly',s=>s.getAll()),put:value=>tx('sessions','readwrite',s=>s.put(value)),remove:id=>tx('sessions','readwrite',s=>s.delete(id)),meta:key=>tx('meta','readonly',s=>s.get(key)),setMeta:(key,value)=>tx('meta','readwrite',s=>s.put(value,key))};
