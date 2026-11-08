export const SCHEME_FORMAT='entry-navigator/schemes-v1';
export const RESULT_KINDS={matched:'Условия отмечены',waiting:'Ожидание',unclear:'Неясная ситуация'};
const uid=()=>crypto.randomUUID();
export const newOption=(label='Новый ответ',next='')=>({id:uid(),label,next});
export const newQuestion=()=>({id:uid(),type:'question',title:'Новый вопрос',hint:'',options:[newOption('Да'),newOption('Нет')]});
export const newResult=()=>({id:uid(),type:'result',title:'Ожидание',description:'',kind:'waiting'});
export function newScheme(){
  const yes={...newResult(),title:'Условия отмечены',kind:'matched'},no=newResult(),q={...newQuestion(),title:'Что проверяем?'};
  q.options[0].next=yes.id;q.options[1].next=no.id;
  const now=new Date().toISOString();
  return {id:uid(),name:'Новая схема',description:'',status:'draft',revision:1,createdAt:now,updatedAt:now,startId:q.id,nodes:[q,yes,no]};
}
export function templateScheme(){
  const s=newScheme();s.name='Вход по локальному тренду';s.description='Рабочая гипотеза группы 1. Можно изменить каждый шаг и переход.';
  const ready={...newResult(),title:'Условия отмечены',kind:'matched',description:'Последовательность условий собрана. Сохрани решение и проверь исход отдельно.'},wait=newResult();
  const titles=['Локальный тренд определён?','Есть откат или пауза?','Цена у заранее отмеченной зоны?','Stoch RSI был в нужной зоне на откате?','Цена остановилась у зоны?','Нарушена структура отката?'];
  const nodes=titles.map(title=>({...newQuestion(),title}));
  nodes.forEach((q,i)=>{q.options[0].next=nodes[i+1]?.id||ready.id;q.options[1].next=wait.id;});
  nodes[0].hint='Оцени сопоставимые вершины и минимумы. Глобальный тренд учитывается фоном.';
  nodes[3].hint='Для локального снижения — перекупленность, для роста — перепроданность. Это условие поиска.';
  nodes[5].hint='Рабочая гипотеза: закрытие свечи за промежуточным экстремумом отката.';
  s.nodes=[...nodes,ready,wait];s.startId=nodes[0].id;return s;
}
export function duplicateScheme(s){const now=new Date().toISOString();return {...structuredClone(s),id:uid(),name:s.name+' · копия',status:'draft',revision:1,createdAt:now,updatedAt:now};}
// Older libraries inferred readiness from graph validity and did not store a status.
export function schemeStatus(s){return s.status==='draft'||!inspectScheme(s).valid?'draft':'ready';}
export function withSchemeStatus(s,status,nodeId){
  if(!['draft','ready'].includes(status))throw new Error('Неизвестный статус схемы');
  assertSchemeShape(s);
  if(status==='ready'){const v=inspectScheme(s);if(!v.valid)throw new Error(v.errors[0]);}
  const copy=structuredClone(s);copy.status=status;copy.updatedAt=new Date().toISOString();
  if(nodeId&&copy.nodes.some(n=>n.id===nodeId))copy.editorNodeId=nodeId;
  return copy;
}
export function assertSchemeShape(s){
  const text=(v,max)=>typeof v==='string'&&v.length<=max;
  const id=v=>text(v,100)&&/^[A-Za-z0-9_-]+$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
  if(!s||!id(s.id)||!text(s.name,200)||!text(s.description,5000)||!Number.isInteger(s.revision)||s.revision<1||!(s.startId===''||id(s.startId))||!Array.isArray(s.nodes)||s.nodes.length>5000)throw new Error('Некорректный формат схемы');
  if(s.status!==undefined&&!['draft','ready'].includes(s.status))throw new Error('Некорректный статус схемы');
  if(s.editorNodeId!==undefined&&!id(s.editorNodeId))throw new Error('Некорректный сохранённый блок редактора');
  const ids=new Set();
  for(const n of s.nodes){
    if(!n||!id(n.id)||ids.has(n.id)||!['question','result'].includes(n.type)||!text(n.title,500))throw new Error('Некорректный блок схемы');
    ids.add(n.id);
    if(n.type==='result'){if(!Object.hasOwn(RESULT_KINDS,n.kind)||!text(n.description,5000))throw new Error('Некорректный итог схемы');}
    else{
      if(!text(n.hint,5000)||!Array.isArray(n.options)||n.options.length>100)throw new Error('Некорректные варианты ответа');
      const opts=new Set();for(const o of n.options){if(!o||!id(o.id)||opts.has(o.id)||!text(o.label,300)||!(o.next===''||id(o.next)))throw new Error('Некорректный переход схемы');opts.add(o.id);}
    }
  }
  return s;
}
export function inspectScheme(s){
  try{assertSchemeShape(s);}catch(e){return {valid:false,errors:[e.message],warnings:[]};}
  const errors=[],warnings=[],byId=new Map(s.nodes.map(n=>[n.id,n]));
  if(!s.name.trim())errors.push('Укажи название схемы.');
  if(!s.nodes.length)errors.push('Добавь хотя бы один вопрос и итог.');
  if(byId.get(s.startId)?.type!=='question')errors.push('Выбери стартовый вопрос.');
  for(const n of s.nodes){
    const name=n.title.trim()||'Без названия';
    if(!n.title.trim())errors.push('У блока нет названия.');
    if(n.type==='question'){
      if(n.options.length<2)errors.push('«'+name+'»: нужны хотя бы два ответа.');
      if(new Set(n.options.map(o=>o.label.trim())).size!==n.options.length)errors.push('«'+name+'»: названия ответов повторяются.');
      for(const o of n.options){if(!o.label.trim())errors.push('«'+name+'»: ответ без названия.');if(!byId.has(o.next))errors.push('«'+name+'» → «'+(o.label||'Ответ')+'»: выбери следующий блок.');}
    }
  }
  const reached=new Set(),stack=[s.startId];
  while(stack.length){const id=stack.pop();if(reached.has(id)||!byId.has(id))continue;reached.add(id);const n=byId.get(id);if(n.type==='question')stack.push(...n.options.map(o=>o.next));}
  const unused=s.nodes.filter(n=>!reached.has(n.id));
  if(unused.length)warnings.push('Недостижимые блоки: '+unused.map(n=>n.title||'Без названия').join(', ')+'. Они не участвуют в разборе.');
  // Kahn's algorithm: no recursion and no fixed number of steps.
  const degree=new Map([...reached].map(id=>[id,0]));
  for(const id of reached){const n=byId.get(id);if(n.type==='question')for(const o of n.options)if(degree.has(o.next))degree.set(o.next,degree.get(o.next)+1);}
  const queue=[...degree].filter(([,n])=>n===0).map(([id])=>id);let count=0;
  for(let i=0;i<queue.length;i++){const n=byId.get(queue[i]);count++;if(n.type==='question')for(const o of n.options)if(degree.has(o.next)){degree.set(o.next,degree.get(o.next)-1);if(!degree.get(o.next))queue.push(o.next);}}
  if(count<reached.size)errors.push('Переходы образуют цикл. Каждый путь должен завершаться итогом.');
  return {valid:errors.length===0,errors,warnings};
}
export function customRoute(s){
  const scheme=s.schemeSnapshot,byId=new Map(scheme.nodes.map(n=>[n.id,n])),steps=[],seen=new Set();let id=scheme.startId;
  while(true){
    if(seen.has(id))throw new Error('В схеме обнаружен цикл');seen.add(id);
    const n=byId.get(id);if(!n)throw new Error('В схеме потерян переход');
    if(n.type==='result')return {steps,end:n.id,result:n,complete:true};
    steps.push({key:n.id,title:n.title,eyebrow:scheme.name,hint:n.hint,options:n.options.map(o=>({value:o.id,label:o.label,detail:'',icon:'→'}))});
    const selected=n.options.find(o=>o.id===s.answers[n.id]);
    if(!selected)return {steps,end:null,complete:false};id=selected.next;
  }
}
export function customEvaluation(s){const r=customRoute(s);return r.complete?{kind:r.result.kind,title:r.result.title,reason:r.result.description,code:r.end}:{kind:'draft',title:'Разбор в процессе',reason:'Ответь на следующий вопрос.',code:'draft'};}
export function customAnswer(s,key,value){
  if(s.decisionSnapshot)throw new Error('Путь уже зафиксирован');
  const r=customRoute(s),index=r.steps.findIndex(q=>q.key===key);
  if(index<0||!r.steps[index].options.some(o=>o.value===value))throw new Error('Недопустимый ответ');
  const answers={};for(let i=0;i<index;i++)answers[r.steps[i].key]=s.answers[r.steps[i].key];answers[key]=value;
  return {...s,answers,updatedAt:new Date().toISOString()};
}
export function validateSchemes(value=[]){
  if(!Array.isArray(value)||value.length>1000)throw new Error('Некорректный список схем');
  const seen=new Set();return value.map(s=>{assertSchemeShape(s);if(seen.has(s.id))throw new Error('Повторяющиеся схемы');seen.add(s.id);return structuredClone(s);});
}
