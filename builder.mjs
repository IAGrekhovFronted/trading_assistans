import {newScheme,templateScheme,newQuestion,newResult,newOption,duplicateScheme,inspectScheme,schemeStatus,withSchemeStatus,RESULT_KINDS} from './schemes.mjs';

export function createBuilder({getSchemes,save,persist=async()=>true,remove,run,render,notify,esc}){
  let editId=null,nodeId=null,nextRevision=null,showErrors=false,libraryFilter='all';
  const current=()=>getSchemes().find(s=>s.id===editId);
  const node=()=>current()?.nodes.find(n=>n.id===nodeId);
  const button=(action,label,cls='secondary',extra='')=>'<button class="'+cls+'" data-builder-action="'+action+'" '+extra+'>'+label+'</button>';
  const open=s=>{editId=s.id;nodeId=s.nodes.some(n=>n.id===s.editorNodeId)?s.editorNodeId:s.startId||s.nodes[0]?.id;nextRevision=s.revision+1;showErrors=false;};
  const stage=s=>'<span class="pill '+(schemeStatus(s)==='ready'?'green':'amber')+'">'+(schemeStatus(s)==='ready'?'Готовая схема':'Черновик')+'</span>';
  function touch(){const s=current();s.revision=nextRevision;s.status='draft';s.updatedAt=new Date().toISOString();if(nodeId)s.editorNodeId=nodeId;else delete s.editorNodeId;save(s);refresh();}
  async function commit(s,status){const updated=withSchemeStatus(s,status,nodeId);save(updated);if(await persist()===false)throw new Error('Не удалось сохранить схему. Она остаётся открытой; скачай резервную копию.');return updated;}
  function issues(s){const v=inspectScheme(s);return '<div class="builder-health '+(v.valid?'valid':'invalid')+'">'+(v.valid?(schemeStatus(s)==='draft'?'✓ Переходы корректны. Можно сохранить готовую схему.':'✓ Схема готова к запуску'):'○ Есть незаполненные переходы. Черновик можно сохранить уже сейчас.')+'</div>'+(showErrors?'<div class="builder-issues" role="status">'+[...v.errors,...v.warnings].map(e=>'<p>'+esc(e)+'</p>').join('')+'</div>':'');}
  function refresh(){
    const s=current();if(!s)return;
    const status=document.querySelector('#builder-validation');if(status)status.innerHTML=issues(s);
    const map=document.querySelector('#builder-map');if(map)map.innerHTML=graph(s);
    const title=document.querySelector('[data-node-label="'+nodeId+'"]');if(title)title.textContent=node()?.title||'Без названия';
    const revision=document.querySelector('#scheme-revision');if(revision)revision.textContent='Версия '+s.revision;
    const statusBadge=document.querySelector('#scheme-stage');if(statusBadge)statusBadge.innerHTML=stage(s);
    for(const option of document.querySelectorAll('[data-builder-field="startId"] option,[data-option-field="next"] option')){const n=s.nodes.find(n=>n.id===option.value);if(n)option.textContent=(n.title||'Без названия')+(option.closest('[data-option-field]')?' · '+(n.type==='result'?'итог':'вопрос'):'');}
  }
  function listing(){
    const all=getSchemes().slice().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const list=all.filter(s=>libraryFilter==='all'||schemeStatus(s)===libraryFilter);
    return '<div class="page-heading"><div><h1>Конструктор схем</h1><p class="subtitle">Сначала собери маршрут, затем используй его для разбора.</p></div>'+button('create','＋ Новая схема','primary')+'</div>'+
    '<section class="builder-intro"><div class="builder-intro-icon">◇</div><div><h2>Твой алгоритм — твои шаги</h2><p>Вопросы, варианты ответов и итоговые блоки. Количество шагов свободное; каждый ответ ведёт в выбранный блок.</p></div>'+button('template','Взять за основу группу 1 →')+'</section>'+
    '<div class="scheme-filters" role="group" aria-label="Статус схем">'+[['all','Все схемы'],['draft','Черновики'],['ready','Готовые']].map(([value,label])=>'<button class="scheme-filter '+(libraryFilter===value?'selected':'')+'" data-builder-action="filter" data-filter="'+value+'" aria-pressed="'+(libraryFilter===value)+'">'+label+' <span>'+all.filter(s=>value==='all'||schemeStatus(s)===value).length+'</span></button>').join('')+'</div>'+
    '<div class="scheme-library">'+(list.length?list.map(s=>{const draft=schemeStatus(s)==='draft',q=s.nodes.filter(n=>n.type==='question').length;return '<section class="card custom-scheme-card"><div class="scheme-card-meta">'+stage(s)+'<div class="inline-row"><small>v'+s.revision+'</small>'+button('delete','Удалить','text-button danger','data-id="'+s.id+'" aria-label="Удалить схему: '+esc(s.name||'Без названия')+'"')+'</div></div><h2>'+esc(s.name||'Без названия')+'</h2><p>'+esc(s.description||(draft?'Начни сейчас, сохрани черновик и продолжи позже.':'Добавь описание и настрой переходы между шагами.'))+'</p><div class="scheme-card-bottom"><span>'+q+' вопросов · '+(s.nodes.length-q)+' итогов</span><div>'+button('edit',draft?'Продолжить →':'Изменить',draft?'primary':'secondary','data-id="'+s.id+'"')+(draft?'':button('run','Запустить →','primary','data-id="'+s.id+'"'))+'</div></div></section>';}).join(''):'<section class="card empty"><div class="empty-icon">◇</div><h3>'+(libraryFilter==='draft'?'Черновиков пока нет':libraryFilter==='ready'?'Готовых схем пока нет':'Создай первую схему')+'</h3><p>Начни с пустой схемы или возьми группу 1 за основу.</p>'+button('create','＋ Создать схему','primary')+'</section>')+'</div>';
  }
  function editor(){
    const s=current();if(!s)return listing();let n=node();if(!n){nodeId=s.nodes[0]?.id;n=node();}
    const questions=s.nodes.filter(n=>n.type==='question');
    return '<div class="page-heading"><div><button class="text-button builder-back" data-builder-action="list">← Все схемы</button><h1>Конструктор</h1><p class="subtitle">Добавляй блоки и связывай их через ответы.</p></div><div class="inline-row">'+button('save-draft','Сохранить черновик')+button('save-ready','Сохранить готовую','primary')+'</div></div>'+
    '<section class="card builder-settings"><div class="builder-editor-toolbar"><div id="scheme-stage">'+stage(s)+'</div><div class="inline-row">'+button('check','Проверить','text-button')+button('run','Сохранить и запустить →','secondary','data-id="'+s.id+'"')+button('duplicate','Копия','text-button')+button('delete','Удалить схему','text-button danger','data-id="'+s.id+'"')+'</div></div><div class="builder-name-row"><label class="field">Название схемы<input data-builder-field="name" maxlength="200" value="'+esc(s.name)+'"></label><span class="pill" id="scheme-revision">Версия '+s.revision+'</span></div><div class="builder-settings-row"><label class="field">Описание<input data-builder-field="description" maxlength="5000" value="'+esc(s.description)+'" placeholder="Для каких ситуаций эта схема"></label><label class="field">Первый шаг<select data-builder-field="startId"><option value="">Выбери вопрос</option>'+questions.map(q=>'<option value="'+q.id+'" '+(q.id===s.startId?'selected':'')+'>'+esc(q.title||'Без названия')+'</option>').join('')+'</select></label></div><div id="builder-validation">'+issues(s)+'</div></section>'+
    '<div class="builder-workspace"><aside class="card builder-blocks"><div class="builder-blocks-head"><h3>Блоки <span>'+s.nodes.length+'</span></h3><small>Порядок задают переходы</small></div><div class="builder-node-list">'+s.nodes.map((q,i)=>'<button class="builder-node '+(q.id===nodeId?'selected':'')+'" data-builder-action="select-node" data-id="'+q.id+'"><span class="builder-node-number '+q.type+'">'+(q.type==='result'?'◎':i+1)+'</span><span><strong data-node-label="'+q.id+'">'+esc(q.title||'Без названия')+'</strong><small>'+(q.id===s.startId?'Старт · ':'')+(q.type==='result'?RESULT_KINDS[q.kind]:'Вопрос · '+q.options.length+' ответа')+'</small></span></button>').join('')+'</div><div class="builder-add">'+button('add-question','＋ Вопрос')+button('add-result','＋ Итог')+'</div></aside><section class="card builder-node-editor">'+(n?nodeEditor(s,n):'<div class="empty"><h3>Добавь первый блок</h3><p>Начни с вопроса, затем создай итог и настрой переход.</p></div>')+'</section></div>'+
    '<section class="card builder-graph"><div class="scheme-header"><div><h2>Карта переходов</h2><p>Нажми на блок, чтобы изменить его. Карта обновляется при редактировании.</p></div><span class="pill neutral">Автоматическая раскладка</span></div><div class="builder-map" id="builder-map">'+graph(s)+'</div></section><div class="builder-footer"><small>Автосохранение включено. «Сохранить черновик» сохраняет работу и возвращает в библиотеку.</small></div>';
  }
  function nodeEditor(s,n){
    const targets=n.options?.map((o,i)=>'<div class="builder-option"><div class="builder-option-index">'+(i+1)+'</div><div class="builder-option-fields"><label class="field">Текст ответа<input data-option-field="label" data-option-id="'+o.id+'" maxlength="300" value="'+esc(o.label)+'"></label><label class="field">Дальше перейти к<select data-option-field="next" data-option-id="'+o.id+'"><option value="">Выбери блок…</option>'+s.nodes.filter(q=>q.id!==n.id).map((q,j)=>'<option value="'+q.id+'" '+(q.id===o.next?'selected':'')+'>'+esc(q.title||'Без названия')+' · '+(q.type==='result'?'итог':'вопрос')+'</option>').join('')+'</select></label></div><button class="text-button danger" data-builder-action="remove-option" data-id="'+o.id+'" aria-label="Удалить ответ '+(i+1)+'" '+(n.options.length<=2?'disabled':'')+'>×</button></div>').join('');
    return '<div class="builder-editor-head"><span class="eyebrow">'+(n.type==='question'?'Вопрос':'Итоговый блок')+'</span>'+button('delete-node','Удалить блок','text-button danger')+'</div><label class="field">'+(n.type==='question'?'Вопрос для разбора':'Название итога')+'<input data-node-field="title" maxlength="500" value="'+esc(n.title)+'"></label>'+
    (n.type==='question'?'<label class="field builder-hint">Подсказка <textarea data-node-field="hint" maxlength="5000" placeholder="Что именно смотреть на графике">'+esc(n.hint)+'</textarea></label><div class="builder-options-head"><h3>Ответы и переходы</h3>'+button('add-option','＋ Ответ','text-button')+'</div><div class="builder-options">'+targets+'</div>':'<label class="field builder-hint">Категория результата<select data-node-field="kind">'+Object.entries(RESULT_KINDS).map(([k,label])=>'<option value="'+k+'" '+(n.kind===k?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label class="field builder-hint">Пояснение<textarea data-node-field="description" maxlength="5000" placeholder="Что означает этот итог и что зафиксировать">'+esc(n.description)+'</textarea></label><div class="builder-result-tip">В конце маршрута можно записать сделку или наблюдение без входа. Категория итога сохраняется для статистики.</div>');
  }
  function graph(s){
    if(!s.nodes.length)return '<p class="footnote">Здесь появится схема.</p>';
    const byId=new Map(s.nodes.map(n=>[n.id,n])),depth=new Map(),queue=[s.startId];depth.set(s.startId,0);
    for(let i=0;i<queue.length;i++){const n=byId.get(queue[i]);if(n?.type==='question')for(const o of n.options)if(byId.has(o.next)&&!depth.has(o.next)){depth.set(o.next,depth.get(n.id)+1);queue.push(o.next);}}
    // Put shared outcomes below all their incoming paths when the graph is acyclic.
    const degree=new Map([...depth.keys()].map(id=>[id,0]));
    for(const id of degree.keys()){const n=byId.get(id);if(n?.type==='question')for(const o of n.options)if(degree.has(o.next))degree.set(o.next,degree.get(o.next)+1);}
    const ordered=[...degree].filter(([,n])=>n===0).map(([id])=>id),ranks=new Map([[s.startId,0]]);
    for(let i=0;i<ordered.length;i++){const id=ordered[i],n=byId.get(id);if(n?.type==='question')for(const o of n.options)if(degree.has(o.next)){ranks.set(o.next,Math.max(ranks.get(o.next)||0,(ranks.get(id)||0)+1));degree.set(o.next,degree.get(o.next)-1);if(degree.get(o.next)===0)ordered.push(o.next);}}
    if(ordered.length===degree.size)for(const [id,d] of ranks)depth.set(id,d);
    let last=Math.max(0,...depth.values());for(const n of s.nodes)if(!depth.has(n.id))depth.set(n.id,++last);
    const rows=new Map();for(const n of s.nodes){const d=depth.get(n.id);if(!rows.has(d))rows.set(d,[]);rows.get(d).push(n);}
    const columns=Math.max(...[...rows.values()].map(a=>a.length)),width=Math.max(720,columns*285+60),height=(Math.max(...depth.values())+1)*170+30,positions=new Map();
    for(const [d,nodes] of rows)nodes.forEach((n,i)=>positions.set(n.id,{x:(width-nodes.length*285)/2+i*285+15,y:25+d*170}));
    let edges='';for(const n of s.nodes)if(n.type==='question')n.options.forEach((o,i)=>{const from=positions.get(n.id),to=positions.get(o.next);if(!to)return;const x=from.x+125+(i-(n.options.length-1)/2)*38,y=from.y+70,tx=to.x+125,ty=to.y;edges+='<g><title>'+esc(o.label)+'</title><path d="M'+x+' '+y+' C'+x+' '+(y+45)+','+tx+' '+(ty-45)+','+tx+' '+ty+'" fill="none" stroke="#bcb0d6" stroke-width="1.6" marker-end="url(#custom-arrow)"/><text x="'+(x+5)+'" y="'+(y+22+i%2*13)+'" fill="#8c7b9f" font-size="10">'+esc(o.label.length>22?o.label.slice(0,21)+'…':o.label)+'</text></g>';});
    const blocks=s.nodes.map(n=>{const {x,y}=positions.get(n.id);return '<g data-builder-action="select-node" data-id="'+n.id+'" role="button" tabindex="0" aria-label="Изменить: '+esc(n.title)+'" class="builder-map-node"><title>'+esc(n.title)+'</title><rect x="'+x+'" y="'+y+'" width="250" height="70" rx="12" fill="'+(n.type==='result'?(n.kind==='matched'?'#e8f4ee':'#fff4df'):'#fff')+'" stroke="'+(n.id===nodeId?'#8069cd':'#dcd3e8')+'" stroke-width="'+(n.id===nodeId?2:1.4)+'"/><text x="'+(x+15)+'" y="'+(y+24)+'" font-size="9" fill="#9b8aaf">'+(n.id===s.startId?'СТАРТ · ':'')+(n.type==='result'?'ИТОГ':'ВОПРОС')+'</text><text x="'+(x+15)+'" y="'+(y+46)+'" font-size="12" fill="#655472">'+esc(n.title.length>32?n.title.slice(0,31)+'…':n.title||'Без названия')+'</text></g>';}).join('');
    return '<svg width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Карта переходов схемы '+esc(s.name)+'"><defs><marker id="custom-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#bcb0d6" stroke-width="1.4"/></marker></defs>'+edges+blocks+'</svg>';
  }
  async function handleClick(b){
    const action=b.dataset.builderAction;let s=current();
    if(action==='create'||action==='template'){s=action==='template'?templateScheme():newScheme();save(s);open(s);nextRevision=s.revision;render();}
    else if(action==='edit'){open(getSchemes().find(x=>x.id===b.dataset.id));render();}
    else if(action==='list'){if(await persist()===false)throw new Error('Не удалось сохранить схему');editId=null;render();}
    else if(action==='filter'){libraryFilter=b.dataset.filter;render();}
    else if(action==='select-node'){nodeId=b.dataset.id;s.editorNodeId=nodeId;save(s);render();document.querySelector('.builder-node-editor')?.scrollIntoView({block:'nearest',behavior:'smooth'});}
    else if(action==='duplicate'){s=duplicateScheme(s);save(s);open(s);nextRevision=s.revision;render();notify('Создана независимая копия');}
    else if(action==='add-question'||action==='add-result'){const n=action==='add-question'?newQuestion():newResult();s.nodes.push(n);nodeId=n.id;if(!s.startId&&n.type==='question')s.startId=n.id;touch();render();}
    else if(action==='add-option'){node().options.push(newOption());touch();render();}
    else if(action==='remove-option'){if(node().options.length>2){node().options=node().options.filter(o=>o.id!==b.dataset.id);touch();render();}}
    else if(action==='delete-node'){
      const n=node();if(!confirm('Удалить блок «'+n.title+'»? Переходы на него нужно будет настроить заново.'))return;
      s.nodes=s.nodes.filter(q=>q.id!==n.id);for(const q of s.nodes)if(q.type==='question')for(const o of q.options)if(o.next===n.id)o.next='';
      if(s.startId===n.id)s.startId='';nodeId=s.nodes[0]?.id;touch();render();
    }
    else if(action==='delete'){
      const target=getSchemes().find(s=>s.id===(b.dataset.id||editId));if(!target)throw new Error('Схема уже удалена');
      if(!confirm('Удалить схему «'+(target.name||'Без названия')+'»? Записанные по ней разборы сохранятся.'))return;
      await remove(target.id);if(editId===target.id)editId=null;render();notify('Схема удалена');
    }
    else if(action==='check'){showErrors=true;render();notify(inspectScheme(s).valid?'Все пути корректны':'Проверь отмеченные ошибки');}
    else if(action==='save-draft'||action==='save-ready'){
      const ready=action==='save-ready',v=inspectScheme(s);
      if(ready&&!v.valid){showErrors=true;render();notify('Для готовой схемы исправь ошибки. Черновик можно сохранить без этого.');return;}
      await commit(s,ready?'ready':'draft');editId=null;libraryFilter=ready?'ready':'draft';render();notify(ready?'Готовая схема сохранена':'Черновик сохранён. Нажми «Продолжить», когда вернёшься.');
    }
    else if(action==='run'){
      s=getSchemes().find(x=>x.id===b.dataset.id);const v=inspectScheme(s);if(!v.valid){if(editId!==s.id)open(s);showErrors=true;render();notify('Сначала исправь схему: '+v.errors[0]);return;}
      s=await commit(s,'ready');await run(s);nextRevision=s.revision+1;
    }
  }
  function handleInput(el){
    if(!current())return;
    if(el.dataset.builderField)current()[el.dataset.builderField]=el.value;
    else if(el.dataset.nodeField)node()[el.dataset.nodeField]=el.value;
    else if(el.dataset.optionField){const o=node().options.find(o=>o.id===el.dataset.optionId);if(o)o[el.dataset.optionField]=el.value;}
    else return;touch();
    if(el.tagName==='SELECT')render();
  }
  return {render:()=>editId?editor():listing(),handleClick,handleInput};
}
