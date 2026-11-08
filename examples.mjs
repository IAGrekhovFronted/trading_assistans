export const BUILTIN_EXAMPLES = [
  {id:'context',title:'Выбор ветки'},
  {id:'entry',title:'Продолжение локального тренда'}
];
export function normalizeHiddenExamples(value){
  return Array.isArray(value)?[...new Set(value.filter(id=>BUILTIN_EXAMPLES.some(e=>e.id===id)))]:[];
}
export function createExampleVisibility({load,save}){
  let hidden=[],chain=Promise.resolve();
  function update(change){
    const task=chain.then(async()=>{const next=normalizeHiddenExamples(change(hidden));await save([...next]);hidden=next;});
    chain=task.catch(()=>{});return task;
  }
  return {
    async load(){hidden=normalizeHiddenExamples(await load());},
    get hidden(){return [...hidden];},
    isHidden:id=>hidden.includes(id),
    hide(id){if(!BUILTIN_EXAMPLES.some(e=>e.id===id))return Promise.reject(new Error('Неизвестный пример'));return update(ids=>[...ids,id]);},
    restore:()=>update(()=>[])
  };
}
