import {renderSchemeMap} from './scheme-map.mjs';
import {newScheme,templateScheme,newQuestion,newResult,newOption,duplicateScheme,inspectScheme,schemeStatus,withSchemeStatus,RESULT_KINDS} from './schemes.mjs';

import {assertHintImage,readHintImageFile,validateHintFile,imageGallery,setImageGallery,MAX_SCHEME_IMAGES} from './hint-images.mjs';

export function createBuilder({getSchemes,save,persist=async()=>true,remove,run,render,notify,esc,showImage=()=>{},readImage=readHintImageFile}){
  const uploads=new Map(),imageQueues=new Map();
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
  const imageFields=answer=>answer?['exampleImages','exampleImage']:['hintImages','hintImage'];
  function mediaEditor(target,answer,index){
    const [plural,legacy]=imageFields(answer),images=imageGallery(target,plural,legacy),kind=answer?'answer':'hint';
    const label=answer?'ответу '+(index+1):'подсказке',extra=answer?'data-id="'+esc(target.id)+'"':'';
    return '<div class="hint-media-editor '+(answer?'answer-media-editor ':'')+'image-drop-zone" data-image-drop="'+kind+'" '+(answer?'data-option-id="'+esc(target.id)+'"':'')+' data-max-files="'+MAX_SCHEME_IMAGES+'" role="group" aria-label="Картинки к '+label+'"><div class="hint-media-toolbar"><span>Примеры · '+images.length+' / '+MAX_SCHEME_IMAGES+'</span>'+button('choose-'+kind+'-image','＋ Добавить картинки','secondary',extra+' aria-label="Добавить картинки к '+label+'" '+(images.length>=MAX_SCHEME_IMAGES?'disabled':''))+'</div><input '+(answer?'data-answer-image-file data-option-id="'+esc(target.id)+'"':'id="hint-image-file"')+' type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" hidden aria-label="Картинки к '+label+'">'+
    '<div class="scheme-image-gallery">'+images.map((image,i)=>'<div class="hint-image-preview"><button class="hint-image-open" data-builder-action="open-'+kind+'-image" '+extra+' data-image-id="'+esc(image.id)+'" aria-label="Увеличить картинку '+(i+1)+' к '+label+'"><img src="'+esc(image.data)+'" alt="Пример '+(i+1)+' к '+label+'"></button><div class="hint-image-meta"><span>'+esc(image.name)+'</span></div><div class="scheme-image-actions">'+button('choose-'+kind+'-image','Заменить','secondary',extra+' data-image-id="'+esc(image.id)+'" aria-label="Заменить картинку '+(i+1)+' к '+label+'"')+button('remove-'+kind+'-image','Удалить','text-button danger',extra+' data-image-id="'+esc(image.id)+'" aria-label="Удалить картинку '+(i+1)+' к '+label+'"')+'</div></div>').join('')+'</div>'+
    '<p class="image-drop-instruction"><span class="drop-idle">Перетащи одну или несколько картинок сюда · до '+MAX_SCHEME_IMAGES+' файлов по 5 МБ</span><span class="drop-active">Отпусти файлы, чтобы добавить картинки</span></p></div>';
  }
  const hintMedia=n=>mediaEditor(n,false);
  const answerMedia=(o,i)=>mediaEditor(o,true,i);
  const attachHintImage=file=>attachHintImages(file?[file]:[]);
  const attachAnswerImage=(file,optionId)=>attachAnswerImages(file?[file]:[],optionId);
  const attachHintImages=(files,replaceId)=>attachImages(files,undefined,replaceId);
  const attachAnswerImages=(files,optionId,replaceId)=>{
    if(typeof optionId!=='string')throw new Error('Выбери ответ для примеров');
    return attachImages(files,optionId,replaceId);
  };
  async function attachImages(fileList,optionId,replaceId){
    const files=Array.from(fileList||[]);if(!files.length)return;
    const owner=current(),question=node(),answer=optionId!==undefined;
    if(!owner||question?.type!=='question')throw new Error('Выбери вопрос для картинок');
    const target=answer?question.options.find(o=>o.id===optionId):question;
    if(!target)throw new Error('Ответ уже удалён. Примеры не прикреплены.');
    const [plural,legacy]=imageFields(answer),existing=imageGallery(target,plural,legacy);
    if(replaceId&&(!existing.some(i=>i.id===replaceId)||files.length!==1))throw new Error('Для замены выбери одну картинку');
    if(!replaceId&&existing.length+files.length>MAX_SCHEME_IMAGES)throw new Error('Можно прикрепить до '+MAX_SCHEME_IMAGES+' картинок к одной подсказке или ответу');
    files.forEach(validateHintFile);
    const schemeId=owner.id,questionId=question.id,revision=nextRevision,key=schemeId+'/'+questionId+(answer?'/'+optionId:''),replacementKey=key+'/'+replaceId,ticket=Symbol();
    if(replaceId)uploads.set(replacementKey,ticket);
    // Reading may finish out of order; commit additions in the order they were selected.
    // Attach the error handler now, even while another operation owns the queue.
    const reading=Promise.all(files.map(async file=>assertHintImage(await readImage(file)))).then(images=>({images}),error=>({error}));
    const previous=imageQueues.get(key)||Promise.resolve();
    const operation=previous.catch(()=>{}).then(async()=>{
      if(replaceId&&uploads.get(replacementKey)!==ticket)return;
      const loaded=await reading;
      if(replaceId&&uploads.get(replacementKey)!==ticket)return;
      if(loaded.error)throw loaded.error;
      const scheme=getSchemes().find(s=>s.id===schemeId),liveQuestion=scheme?.nodes.find(n=>n.id===questionId);
      if(!scheme||liveQuestion?.type!=='question')throw new Error('Вопрос уже удалён. Картинки не прикреплены.');
      const liveTarget=answer?liveQuestion.options.find(o=>o.id===optionId):liveQuestion;
      if(!liveTarget)throw new Error('Ответ уже удалён. Примеры не прикреплены.');
      const gallery=imageGallery(liveTarget,plural,legacy);
      if(replaceId&&!gallery.some(i=>i.id===replaceId))return;
      if(!replaceId&&gallery.length+loaded.images.length>MAX_SCHEME_IMAGES)throw new Error('В галерее уже достигнут предел '+MAX_SCHEME_IMAGES+' картинок');
      const additions=loaded.images.map(image=>({name:image.name,data:image.data,id:replaceId||crypto.randomUUID()}));
      setImageGallery(liveTarget,plural,legacy,replaceId?gallery.map(image=>image.id===replaceId?additions[0]:image):[...gallery,...additions]);
      scheme.status='draft';scheme.revision=Math.max(scheme.revision,revision);scheme.updatedAt=new Date().toISOString();
      save(scheme);if(await persist()===false)throw new Error('Картинки пока не сохранены. Скачай резервную копию.');
      if(editId===schemeId)render();notify(replaceId?'Картинка заменена':'Добавлено картинок: '+additions.length);
    });
    imageQueues.set(key,operation);
    try{await operation;}finally{
      if(imageQueues.get(key)===operation)imageQueues.delete(key);
      if(replaceId&&uploads.get(replacementKey)===ticket)uploads.delete(replacementKey);
    }
  }
  async function removeGalleryImage(answer,optionId,imageId){
    const scheme=current(),question=node(),target=answer?question?.options?.find(o=>o.id===optionId):question;
    if(!scheme||!target)return;
    const [plural,legacy]=imageFields(answer),gallery=imageGallery(target,plural,legacy),id=imageId||gallery[0]?.id;
    if(!gallery.some(image=>image.id===id))return;
    uploads.delete(scheme.id+'/'+question.id+(answer?'/'+optionId:'')+'/'+id);
    setImageGallery(target,plural,legacy,gallery.filter(image=>image.id!==id));
    scheme.status='draft';scheme.revision=Math.max(scheme.revision,nextRevision);scheme.updatedAt=new Date().toISOString();
    save(scheme);if(await persist()===false)throw new Error('Не удалось сохранить удаление картинки');
    render();notify('Картинка удалена');
  }
  function nodeEditor(s,n){
    const targets=n.options?.map((o,i)=>'<div class="builder-option"><div class="builder-option-index">'+(i+1)+'</div><div class="builder-option-content"><div class="builder-option-fields"><label class="field">Текст ответа<input data-option-field="label" data-option-id="'+o.id+'" maxlength="300" value="'+esc(o.label)+'"></label><label class="field">Дальше перейти к<select data-option-field="next" data-option-id="'+o.id+'"><option value="">Выбери блок…</option>'+s.nodes.filter(q=>q.id!==n.id).map((q,j)=>'<option value="'+q.id+'" '+(q.id===o.next?'selected':'')+'>'+esc(q.title||'Без названия')+' · '+(q.type==='result'?'итог':'вопрос')+'</option>').join('')+'</select></label></div>'+answerMedia(o,i)+'</div><button class="text-button danger" data-builder-action="remove-option" data-id="'+o.id+'" aria-label="Удалить ответ '+(i+1)+'" '+(n.options.length<=2?'disabled':'')+'>×</button></div>').join('');
    return '<div class="builder-editor-head"><span class="eyebrow">'+(n.type==='question'?'Вопрос':'Итоговый блок')+'</span>'+button('delete-node','Удалить блок','text-button danger')+'</div><label class="field">'+(n.type==='question'?'Вопрос для разбора':'Название итога')+'<input data-node-field="title" maxlength="500" value="'+esc(n.title)+'"></label>'+
    (n.type==='question'?'<label class="field builder-hint">Подсказка <textarea data-node-field="hint" maxlength="5000" placeholder="Что именно смотреть на графике">'+esc(n.hint)+'</textarea></label>'+hintMedia(n)+'<div class="builder-options-head"><h3>Ответы и переходы</h3>'+button('add-option','＋ Ответ','text-button')+'</div><div class="builder-options">'+targets+'</div>':'<label class="field builder-hint">Категория результата<select data-node-field="kind">'+Object.entries(RESULT_KINDS).map(([k,label])=>'<option value="'+k+'" '+(n.kind===k?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label class="field builder-hint">Пояснение<textarea data-node-field="description" maxlength="5000" placeholder="Что означает этот итог и что зафиксировать">'+esc(n.description)+'</textarea></label><div class="builder-result-tip">В конце маршрута можно записать сделку или наблюдение без входа. Категория итога сохраняется для статистики.</div>');
  }
  const graph=s=>renderSchemeMap(s,{selectedId:nodeId,esc});
  async function handleClick(b){
    const action=b.dataset.builderAction;let s=current();
    if(action==='create'||action==='template'){s=action==='template'?templateScheme():newScheme();save(s);open(s);nextRevision=s.revision;render();}
    else if(action==='edit'){open(getSchemes().find(x=>x.id===b.dataset.id));render();}
    else if(action==='list'){if(await persist()===false)throw new Error('Не удалось сохранить схему');editId=null;render();}
    else if(action==='filter'){libraryFilter=b.dataset.filter;render();}
    else if(action==='select-node'){nodeId=b.dataset.id;s.editorNodeId=nodeId;save(s);render();document.querySelector('.builder-node-editor')?.scrollIntoView({block:'nearest',behavior:'smooth'});}
    else if(action==='choose-answer-image'||action==='choose-hint-image'){
      const input=b.closest('.hint-media-editor').querySelector('input[type="file"]');
      if(b.dataset.imageId){input.dataset.replaceId=b.dataset.imageId;input.multiple=false;}else{delete input.dataset.replaceId;input.multiple=true;}
      input.click();
    }
    else if(action==='open-answer-image'||action==='open-hint-image'){
      const answer=action==='open-answer-image',target=answer?node()?.options?.find(o=>o.id===b.dataset.id):node();
      const image=imageGallery(target,...imageFields(answer)).find(image=>image.id===b.dataset.imageId);
      if(image)showImage(image.data,image.name);
    }
    else if(action==='remove-answer-image')await removeGalleryImage(true,b.dataset.id,b.dataset.imageId);
    else if(action==='remove-hint-image')await removeGalleryImage(false,undefined,b.dataset.imageId);
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
  return {render:()=>editId?editor():listing(),handleClick,handleInput,attachHintImage,attachAnswerImage,attachHintImages,attachAnswerImages};
}
