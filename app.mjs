import {ALGORITHM_VERSION,FORMAT,route,routeFor,answerFor,evaluationFor,scenarioFor,freshSession,freshSchemeSession,lockDecision,decimal,profit,statistics,validateImport,csv} from './engine.mjs';
import {repository} from './storage.mjs';
import {validateSchemes} from './schemes.mjs';
import {createBuilder} from './builder.mjs';

const app=document.querySelector('#app');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=v=>v?new Date(v).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
const money=v=>v===null?'—':new Intl.NumberFormat('ru-RU',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(v);
const labels={global:'Глобальный фон',wave:'Текущая волна',correction:'Состояние отката',local:'Локальный тренд',pullback:'Подготовка',level:'Уровень',stoch:'Stoch RSI',reaction:'Остановка цены',confirmation:'Подтверждение'};
const outcomeLabels={pending:'Ожидает исхода',win:'Плюс',loss:'Минус',draw:'Возврат'};
const icons={
new:'<path d="M12 3v18M3 12h18"/>',
journal:'<path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/>',
stats:'<path d="M4 20V11M12 20V4M20 20V8"/>',
schemes:'<rect x="8" y="2" width="8" height="5" rx="1"/><rect x="1" y="17" width="8" height="5" rx="1"/><rect x="15" y="17" width="8" height="5" rx="1"/><path d="M12 7v5M5 17v-5h14v5"/>',builder:'<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="19" r="2"/>'};
const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';
let sessions=[],customSchemes=[],schemesDirty=false,currentId=null,cursor=0,view=['journal','stats','schemes','builder'].includes(location.hash.slice(1))?location.hash.slice(1):'new';
let toastTimer,saveTimer,saveChain=Promise.resolve(),pending=new Map(),saveLabel='Сохранено на устройстве',storageFailed=false;
let search='',filter='all';
const current=()=>sessions.find(s=>s.id===currentId);
const builder=createBuilder({getSchemes:()=>customSchemes,save:putScheme,persist:flush,remove:async id=>{customSchemes=customSchemes.filter(s=>s.id!==id);schemesDirty=true;if(!await flush())throw new Error('Не удалось сохранить удаление');},run:runScheme,render,notify,esc});
const stepLabel=q=>labels[q.key]||q.title;
function putScheme(s){const i=customSchemes.findIndex(x=>x.id===s.id);if(i<0)customSchemes.unshift(s);else customSchemes[i]=s;schemesDirty=true;saveStatus('Сохраняем…');clearTimeout(saveTimer);saveTimer=setTimeout(flush,250);}
async function runScheme(scheme){if(!await flush())throw new Error('Схема пока не сохранена');const s=freshSchemeSession(scheme);currentId=s.id;cursor=0;put(s);await repository.setMeta('currentId',currentId).catch(()=>{});view='new';location.hash='new';render();window.scrollTo({top:0});}
function notify(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4200);}
function saveStatus(text){saveLabel=text;const el=document.querySelector('#save-status');if(el)el.textContent=text;}
function put(s){
  s.updatedAt=new Date().toISOString();
  const i=sessions.findIndex(x=>x.id===s.id);if(i<0)sessions.unshift(s);else sessions[i]=s;
  pending.set(s.id,structuredClone(s));saveStatus('Сохраняем…');
  clearTimeout(saveTimer);saveTimer=setTimeout(flush,250);
}
async function flush(){
  clearTimeout(saveTimer);const values=[...pending.values()];pending.clear();const schemes=schemesDirty?structuredClone(customSchemes):null;schemesDirty=false;
  saveChain=saveChain.then(async()=>{for(const s of values)await repository.put(s);if(schemes)await repository.setMeta('schemes',schemes);});
  try{await saveChain;saveStatus('Сохранено на устройстве');return true;}
  catch(e){saveChain=Promise.resolve();for(const s of values)if(!pending.has(s.id))pending.set(s.id,s);if(schemes)schemesDirty=true;storageFailed=true;saveStatus('Не удалось сохранить');notify('Хранилище недоступно. Экспортируй данные, чтобы сохранить копию.');console.error(e);return false;}
}
async function createNew(preset={}){
  await flush();const s=freshSession();s.answers=preset;s.cursor=route(preset).steps.length-1;
  currentId=s.id;cursor=s.cursor;put(s);await repository.setMeta('currentId',currentId).catch(()=>{});
  view='new';location.hash='new';render();
}
function shell(content){
  return '<div class="layout"><aside class="sidebar"><div class="brand"><div class="brand-mark"><svg width="25" height="25" viewBox="0 0 28 28" fill="none"><path d="M4 21L11 13L17 17L24 6" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 6h6v6" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div><div class="brand-name">Точка входа</div><div class="brand-sub">Навигатор решений</div></div></div><div class="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div><nav class="nav" aria-label="Основная навигация">'+[['new','Разбор'],['journal','Журнал'],['stats','Статистика'],['schemes','Схемы'],['builder','Конструктор']].map(([id,t])=>'<button data-action="nav" data-view="'+id+'" class="'+(view===id?'active':'')+'">'+icon(id)+'<span>'+t+'</span></button>').join('')+'</nav><div class="side-note"><strong><i class="dot"></i>Локальное хранение</strong>Записи и скриншоты остаются в этом браузере.<br><button class="text-button" data-action="export" style="padding-left:0;color:#c0b5e4">Скачать резервную копию ↗</button></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">Рабочее пространство <span>/</span> <strong>Точка входа</strong></div><div class="top-actions"><span class="save-status" id="save-status">'+esc(saveLabel)+'</span><button class="secondary" data-action="export">Экспорт</button><button class="primary" data-action="new">＋ Новый разбор</button></div></header>'+(storageFailed?'<div class="info-banner">Сохранение в браузере недоступно. Скачай резервную копию текущих записей.</div>':'')+content+'</main></div>';
}
function heading(title,sub,extra=''){return '<div class="page-heading"><div><h1>'+title+'</h1><p class="subtitle">'+esc(sub)+'</p></div>'+extra+'</div>';}
function render(){
  app.innerHTML=shell(view==='new'?wizard():view==='journal'?journal():view==='stats'?statsPage():view==='builder'?builder.render():schemes());
}
function optionLabel(q,value){return q.options.find(o=>o.value===value)?.label||'Ещё не выбран';}
function rail(s){
  const r=routeFor(s);
  return '<aside class="rail"><div class="card route-card"><div class="route-top"><h3>Твой путь</h3><span class="route-count">'+r.steps.filter(q=>s.answers[q.key]).length+' ответов</span></div><div class="route-list">'+r.steps.map((q,i)=>'<button class="route-item '+(s.answers[q.key]?'done ':'')+(i===cursor?'current':'')+'" data-action="goto" data-index="'+i+'" '+(s.decisionSnapshot?'disabled':'')+'><span class="route-number">'+(s.answers[q.key]?'✓':i+1)+'</span><span><span class="route-title">'+esc(stepLabel(q))+'</span><span class="route-answer">'+esc(optionLabel(q,s.answers[q.key]))+'</span></span></button>').join('')+'</div><div class="route-bottom">'+(s.decisionSnapshot?'Путь зафиксирован. Исход добавляется отдельно.':'Ответы сохраняются автоматически. К любому пройденному шагу можно вернуться.')+'</div></div><div class="branch-card"><small>Текущий сценарий</small><p>'+esc(scenarioFor(s))+'</p></div></aside>';
}
function wizard(){
  const s=current();if(!s)return '';
  const r=routeFor(s);if(s.decisionSnapshot)cursor=r.steps.length;
  const end=r.complete&&cursor>=r.steps.length;
  cursor=Math.min(cursor,r.steps.length);
  return heading('Разбор ситуации',s.schemeSnapshot?s.schemeSnapshot.name+' · версия '+s.schemeSnapshot.revision:'Один вопрос за раз. Сначала контекст, затем условия и реакция цены.','<button class="secondary" data-action="nav" data-view="builder">Выбрать схему →</button>')+
  '<div class="workspace"><div>'+(!end?questionCard(s,r):resultCard(s))+(end?detailCard(s):'')+'</div>'+rail(s)+'</div>';
}
function questionCard(s,r){
  const q=r.steps[Math.min(cursor,r.steps.length-1)];
  const selected=s.answers[q.key];
  const phase=['global','wave','correction'].includes(q.key)?0:['local','pullback'].includes(q.key)?1:2;
  return '<section class="card question-card"><div class="context-line"><span class="symbol">'+esc(s.symbol)+'</span><span class="pill neutral">1 мин</span><span class="pill neutral">Экспирация 5 мин</span></div><div class="step-strip">'+(s.schemeSnapshot?['Вопросы','Решение','Запись']:['Контекст','Сценарий','Условия','Запись']).map((x,i)=>'<span class="'+(i===(s.schemeSnapshot?0:phase)?'active':'')+'">'+x+'</span>'+(i<3?'<i></i>':'')).join('')+'</div><div class="eyebrow">Шаг '+(cursor+1)+' · '+esc(q.eyebrow)+'</div><h2 class="question-title" id="question-title">'+esc(q.title)+'</h2><p class="question-hint">'+esc(q.hint)+'</p><div class="answers" role="radiogroup" aria-labelledby="question-title">'+q.options.map(o=>'<label class="answer '+(selected===o.value?'selected':'')+'"><span class="answer-icon">'+o.icon+'</span><span><span class="answer-title">'+esc(o.label)+'</span><span class="answer-detail">'+esc(o.detail)+'</span></span><input type="radio" name="answer" data-key="'+q.key+'" value="'+o.value+'" '+(selected===o.value?'checked':'')+'></label>').join('')+'</div>'+(!s.schemeSnapshot&&q.key==='level'?'<div class="small-grid"><label class="field">Зона или уровень<input data-field="zone" value="'+esc(s.zone)+'" placeholder="Например, 80 000–80 020"></label><label class="field">Значимость прежней реакции<select data-field="zoneStrength"><option value="unknown" '+(s.zoneStrength==='unknown'?'selected':'')+'>Не оценена</option><option value="strong" '+(s.zoneStrength==='strong'?'selected':'')+'>Сильная / продолжительная</option><option value="ordinary" '+(s.zoneStrength==='ordinary'?'selected':'')+'>Обычная</option></select></label></div>':'')+'<footer class="question-footer"><button class="secondary" data-action="back" '+(cursor===0?'disabled':'')+'>← Назад</button><button class="primary" data-action="next" '+(!selected?'disabled':'')+'>'+(cursor===r.steps.length-1&&r.complete?'Посмотреть итог':'Продолжить')+' →</button></footer><p class="footnote">Ответ «не уверен» — полноценный результат наблюдения.</p></section>';
}
function resultCard(s){
  const e=s.decisionSnapshot?.conclusion||evaluationFor(s);
  const r=routeFor(s);
  return '<section class="card question-card"><div class="context-line"><span class="symbol">'+esc(s.symbol)+'</span><span class="pill neutral">БО · 5 мин</span><span class="pill '+(e.kind==='matched'?'green':e.kind==='waiting'?'amber':'neutral')+'">'+(e.kind==='matched'?'Условия собраны':e.kind==='waiting'?'Ожидание':'Неясный участок')+'</span></div><div class="result-symbol '+e.kind+'">'+(e.kind==='matched'?'✓':e.kind==='waiting'?'Ⅱ':'?')+'</div><h2 class="result-title">'+esc(e.title)+'</h2><p class="result-reason">'+esc(e.reason)+'</p>'+(e.experimental?'<div class="info-banner" style="margin-top:16px">Ветка вверх — зеркальный черновик. Её результаты учитываются отдельно.</div>':'')+
  '<div class="decision-list">'+r.steps.filter(q=>s.answers[q.key]).map(q=>'<div><span>'+esc(stepLabel(q))+'</span><strong>'+esc(optionLabel(q,s.answers[q.key]))+'</strong></div>').join('')+'</div>'+
  (!s.decisionSnapshot?'<div class="result-buttons"><button class="primary" data-action="lock-trade">'+(e.kind==='matched'?'Зафиксировать сделку':'Сделка всё же состоялась')+'</button><button class="secondary" data-action="lock-observation">Сохранить без входа</button></div><p class="footnote">Фиксируем твои наблюдения. Приложение не определяет будущую цену.</p>':'<div class="result-buttons"><span class="pill '+(s.trade.executed?'green':'neutral')+'">'+(s.trade.executed?'Сделка записана':'Наблюдение без входа')+'</span><button class="text-button" data-action="nav" data-view="journal">Открыть журнал →</button></div>')+
  (!s.decisionSnapshot?'<div style="margin-top:20px"><button class="text-button" data-action="back">← Вернуться к вопросам</button></div>':'<p class="version-note">Путь зафиксирован '+fmtDate(s.decisionSnapshot.at)+' · версия '+esc(s.schemeSnapshot?.revision??s.decisionSnapshot.algorithmVersion)+'</p>')+'</section>';
}
function field(label,key,value,placeholder='',type='text',extra=''){return '<label class="field '+extra+'">'+label+'<input type="'+type+'" data-trade="'+key+'" value="'+esc(value)+'" placeholder="'+placeholder+'" '+(['stake','payout','entryPrice','exitPrice'].includes(key)?'inputmode="decimal"':'')+'></label>';}
function detailCard(s){
  const t=s.trade,p=profit(s);
  const fields=t.executed?'<div class="field-grid"><label class="field">Результат<select data-trade="outcome">'+Object.entries(outcomeLabels).map(([v,l])=>'<option value="'+v+'" '+(t.outcome===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>'+field('Время открытия · время браузера','entryTime',t.entryTime,'','datetime-local')+field('Цена открытия','entryPrice',t.entryPrice,'0,00')+field('Цена на экспирации','exitPrice',t.exitPrice,'0,00')+field('Сумма сделки, $','stake',t.stake,'0,00')+field('Полная выплата, $','payout',t.payout,'Включая возврат ставки')+'</div><div class="result-money"><span>Выплата минус ставка</span><strong>'+money(p)+'</strong></div>':'';
  return '<section class="card note-card"><h3>'+(t.executed?'Исход сделки':'Комментарий к наблюдению')+'</h3>'+fields+'<label class="field">Инструмент<input data-field="symbol" value="'+esc(s.symbol)+'" maxlength="100" placeholder="BTC/USDT"></label><label class="field" style="margin-top:16px">Что увидел и что ожидал<textarea data-field="notes" maxlength="50000" placeholder="Коротко: почему рассматривал вход, что оставалось неясным…">'+esc(s.notes)+'</textarea></label><div style="margin-top:17px"><label class="upload-label">＋ Прикрепить скриншоты<input id="screenshot-files" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple></label></div><div class="attachments">'+s.screenshots.map((im,i)=>'<div class="attachment"><img src="'+esc(im.data)+'" alt="'+esc(im.name)+'" data-action="image" data-index="'+i+'"><button class="remove-image" data-action="remove-image" data-index="'+i+'" aria-label="Убрать скриншот">×</button><span class="attachment-name">'+esc(im.name)+'</span></div>').join('')+'</div><div class="footer-actions"><button class="primary" data-action="save-result">'+(t.executed?'Сохранить результат':'Сохранить комментарий')+'</button><button class="text-button danger" data-action="delete" data-id="'+esc(s.id)+'">Удалить разбор</button></div><p class="version-note">До 4 скриншотов по 5 МБ. Записи остаются в этом браузере; резервная копия включает изображения.</p></section>';
}
function journal(){
  return heading('Журнал решений','Ход рассуждений сохраняется вместе со сделкой и её исходом.','<button class="secondary" data-action="import">Импорт JSON</button>')+
  '<div class="toolbar journal-toolbar"><label class="field journal-search-field">Поиск<input id="journal-search" type="search" value="'+esc(search)+'" placeholder="Инструмент, зона или комментарий" aria-label="Поиск в журнале"></label><label class="field journal-filter-field">Тип записи<select id="journal-filter" aria-label="Фильтр журнала"><option value="all">Все записи</option><option value="trade" '+(filter==='trade'?'selected':'')+'>Сделки</option><option value="observation" '+(filter==='observation'?'selected':'')+'>Без входа</option><option value="draft" '+(filter==='draft'?'selected':'')+'>Черновики</option><option value="pending" '+(filter==='pending'?'selected':'')+'>Ожидают исхода</option></select></label><button class="secondary" data-action="csv">CSV</button></div><div id="journal-list">'+journalRows()+'</div>';
}
function journalRows(){
  const list=sessions.filter(s=>{
    const text=[s.symbol,s.notes,s.zone,scenarioFor(s)].join(' ').toLowerCase();
    return text.includes(search.toLowerCase())&&(filter==='all'||filter==='pending'&&s.trade.executed&&s.trade.outcome==='pending'||filter===s.disposition);
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  if(!list.length)return '<div class="card empty"><div class="empty-icon">▤</div><h3>Здесь будут твои разборы</h3><p>Пройди вопросы, зафиксируй сделку или сохрани наблюдение без входа.</p><button class="primary" data-action="new">Начать разбор</button></div>';
  return '<div class="table-wrap"><table><thead><tr><th>Разбор</th><th>Ветка</th><th>Условия</th><th>Исход</th><th>Результат</th><th></th></tr></thead><tbody>'+list.map(s=>{
    const e=s.decisionSnapshot?.conclusion||evaluationFor(s),a=s.decisionSnapshot?.answers||s.answers,p=profit(s);
    const status=s.trade.executed?outcomeLabels[s.trade.outcome]:s.disposition==='observation'?'Без входа':'Черновик';
    return '<tr><td><strong>'+esc(s.symbol)+'</strong><small>'+fmtDate(s.createdAt)+'</small></td><td>'+esc(scenarioFor(s))+'<small>'+(s.schemeSnapshot?'Своя схема':a.local==='down'?'Локально вниз':a.local==='up'?'Локально вверх':'Направление не выбрано')+' · v'+esc(s.schemeSnapshot?.revision??s.algorithmVersion)+'</small></td><td><span class="pill '+(e.kind==='matched'?'green':e.kind==='waiting'?'amber':'neutral')+'">'+(e.kind==='matched'?'Отмечены':e.kind==='waiting'?'Ожидание':e.kind==='draft'?'В процессе':'Неясно')+'</span></td><td><span class="pill '+(s.trade.outcome==='win'?'green':s.trade.outcome==='loss'?'red':'neutral')+'">'+status+'</span></td><td>'+money(p)+'</td><td><button class="text-button" data-action="open" data-id="'+esc(s.id)+'">Открыть →</button></td></tr>';
  }).join('')+'</tbody></table></div>';
}
function statsPage(){
  const s=statistics(sessions);
  const groups=new Map();
  for(const session of sessions.filter(x=>x.trade.executed)){
    const a=session.decisionSnapshot?.answers||session.answers;
    const name=session.schemeSnapshot?session.schemeId+':'+session.schemeSnapshot.revision:scenarioFor(session)+' · '+(a.local==='down'?'вниз':'вверх')+' · '+(a.pullback==='pause'?'пауза':'откат')+' · v'+session.algorithmVersion;
    if(!groups.has(name))groups.set(name,[]);groups.get(name).push(session);
  }
  const followed=statistics(sessions.filter(x=>x.decisionSnapshot?.conclusion.kind==='matched'));
  const early=statistics(sessions.filter(x=>x.decisionSnapshot&&x.decisionSnapshot.conclusion.kind!=='matched'));
  const total=s.wins+s.losses+s.draws;
  const metric=(label,value,note)=>'<div class="card metric"><div class="metric-label">'+label+'</div><div class="metric-value">'+value+'</div><div class="metric-note">'+note+'</div></div>';
  return heading('Статистика','Сравниваем ветки и отмеченные условия, а не только общий винрейт.','<span class="pill">Личные записи</span>')+
  '<div class="metric-grid">'+metric('Винрейт',s.winrate===null?'—':s.winrate+'%','Плюсы / (плюсы + минусы)')+metric('Закрытые сделки',s.closed,s.pending+' ожидают исхода')+metric('Чистый результат',money(s.net),'По '+s.netCount+' записям с суммами')+metric('Наблюдения без входа',s.observations,'Сохраняем и пропущенные ситуации')+'</div>'+
  '<div class="stats-grid"><section class="card stats-card"><h3>Распределение исходов</h3><div class="distribution">'+(total?'<span class="win" style="width:'+s.wins/total*100+'%"></span><span class="loss" style="width:'+s.losses/total*100+'%"></span><span class="draw" style="width:'+s.draws/total*100+'%"></span>':'')+'</div><div class="legend"><span><i style="background:#68ae93"></i>Плюс · '+s.wins+'</span><span><i style="background:#d8929f"></i>Минус · '+s.losses+'</span><span><i style="background:#baaace"></i>Возврат · '+s.draws+'</span></div></section><section class="card stats-card"><h3>Условия в момент записи</h3><div class="small-stat"><span>Все условия отмечены</span><strong>'+followed.closed+' сделок · '+(followed.winrate===null?'—':followed.winrate+'%')+'</strong></div><div class="small-stat"><span>Ранняя реакция / неясный сценарий</span><strong>'+early.closed+' сделок · '+(early.winrate===null?'—':early.winrate+'%')+'</strong></div></section></div>'+
  '<section class="card stats-card"><h3>По сценариям</h3>'+(groups.size?'<div class="table-wrap"><table><thead><tr><th>Сценарий</th><th>Закрыто</th><th>Плюс / минус</th><th>Винрейт</th><th>Результат</th></tr></thead><tbody>'+[...groups].map(([name,records])=>{const x=statistics(records);return '<tr><td>'+esc(records[0].schemeSnapshot?scenarioFor(records[0])+' · v'+records[0].schemeSnapshot.revision:name)+'</td><td>'+x.closed+'</td><td>'+x.wins+' / '+x.losses+'</td><td>'+(x.winrate===null?'—':x.winrate+'%')+'</td><td>'+money(x.net)+'</td></tr>';}).join('')+'</tbody></table></div>':'<div class="empty" style="padding:35px"><h3>Статистика появится после первых сделок</h3><p>Исходы «ожидает» и наблюдения без входа не входят в винрейт.</p></div>')+'<p class="stats-footer">Возвраты исключены из знаменателя винрейта. Для денежного результата нужны ставка и полная выплата. Ветки вверх, паузы и версии алгоритма учитываются раздельно.</p></section>';
}
function svgBlock(id,x,y,w,h,lines,activeKeys,kind='normal'){
  const active=activeKeys.has(id),fill=kind==='matched'?'#e8f5ed':kind==='wait'?'#fff5e3':active?'#eee8ff':'#fff';
  return '<g><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="13" fill="'+fill+'" stroke="'+(active?'#a494d8':'#e0d8ea')+'" stroke-width="1.4"/>'+lines.map((t,i)=>'<text x="'+(x+w/2)+'" y="'+(y+h/2-(lines.length-1)*9+i*18+4)+'" text-anchor="middle" font-size="13" fill="#6c5b7e">'+t+'</text>').join('')+'</g>';
}
function diagram(type){
  const active=new Set(Object.keys(current()?.answers||{}));
  const edge=(d,label,x,y)=>'<path d="'+d+'" fill="none" stroke="#c8bed9" stroke-width="1.6" marker-end="url(#arrow-'+type+')"/>'+(label?'<text x="'+x+'" y="'+y+'" font-size="11" fill="#a391b5">'+label+'</text>':'');
  const b=(...a)=>svgBlock(...a,active);
  const defs='<defs><marker id="arrow-'+type+'" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#b8abc9" stroke-width="1.3"/></marker></defs>';
  if(type==='context')return '<svg class="diagram" viewBox="0 0 980 520" role="img" aria-label="Схема выбора ветки по глобальному тренду и текущей волне">'+defs+
    edge('M490 82V130','Есть',503,110)+edge('M360 51H85V455H360','Неясен',95,220)+
    edge('M490 200V420','По тренду',505,305)+edge('M360 165H260V455H360','Пауза',268,310)+
    edge('M620 165H810V250','Против тренда',680,152)+edge('M740 320V365H620V455','Да',685,352)+edge('M870 320V410','Нет / неясно',881,368)+
    b('global',360,20,260,62,['Есть глобальный тренд?'])+
    b('wave',360,130,260,70,['Куда идёт текущая волна?'])+
    b('correction',680,250,260,70,['Откат сменил направление?'])+
    b('local',360,420,260,70,['Проверка локальной структуры'])+
    svgBlock('wait',740,410,230,70,['Наблюдение / ожидание'],active,'wait')+'</svg>';
  const nodes=[['local',20,['Локальный тренд определён?']],['pullback',135,['Есть откат или пауза?']],['level',250,['Цена у отмеченной зоны?']],['stoch',365,['Stoch RSI в нужной зоне?']],['reaction',480,['Цена остановилась у зоны?']],['confirmation',595,['Нарушена структура отката?']]];
  let edges='',blocks='';
  for(let i=0;i<nodes.length;i++){
    const [id,y,text]=nodes[i];blocks+=b(id,220,y,340,65,text);
    if(i<nodes.length-1)edges+=edge('M390 '+(y+65)+'V'+nodes[i+1][1],'Да',405,y+94);
    edges+=edge('M560 '+(y+32)+'H640V405H700',i===nodes.length-1?'Нет / первый отклик':'Нет / неясно',573,y+22);
  }
  edges+=edge('M390 660V720','Да',405,692);
  return '<svg class="diagram" viewBox="0 0 980 815" role="img" aria-label="Схема группы один: локальный тренд, подготовка, уровень, индикатор и подтверждение">'+defs+edges+blocks+svgBlock('waiting',700,365,235,80,['Сохранить наблюдение','или фактическую сделку'],active,'wait')+svgBlock('matched',220,720,340,65,['Условия отмечены → запись'],active,'matched')+'</svg>';
}
function schemes(){
  return heading('Схемы решений','Две части одного маршрута: выбор ситуации и проверка условий.','<span class="pill">Алгоритм '+ALGORITHM_VERSION+'</span>')+
    '<section class="card scheme-card"><div class="scheme-header"><div><h2>01 · Выбор ветки</h2><p>Неясный глобальный фон не блокирует проверку локального тренда.</p></div><button class="secondary" data-action="nav" data-view="new">К разбору →</button></div><div class="scheme-scroll">'+diagram('context')+'</div><div class="inline-row"><button class="text-button" data-action="preset" data-preset="with">Попробовать волну по тренду →</button><button class="text-button" data-action="preset" data-preset="against">Попробовать ветку отката →</button></div></section>'+
    '<section class="card scheme-card"><div class="scheme-header"><div><h2>02 · Продолжение локального тренда</h2><p>Уровень и индикатор — условия поиска. Реакция и структура проверяются отдельно.</p></div><span class="pill">Группа 1</span></div><div class="scheme-scroll">'+diagram('entry')+'</div></section>';
}
async function openRecord(id){
  await flush();currentId=id;const s=current();cursor=s.decisionSnapshot?routeFor(s).steps.length:(s.cursor??routeFor(s).steps.length-1);
  await repository.setMeta('currentId',id).catch(()=>{});view='new';location.hash='new';render();window.scrollTo({top:0});
}
function download(filename,data,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
async function exportAll(asCsv=false){await flush();download('entry-navigator-'+new Date().toLocaleDateString('sv-SE')+(asCsv?'.csv':'.json'),asCsv?csv(sessions):JSON.stringify({format:FORMAT,exportedAt:new Date().toISOString(),sessions,schemes:customSchemes},null,2),asCsv?'text/csv;charset=utf-8':'application/json');notify('Резервная копия подготовлена');}
app.addEventListener('click',async event=>{
  const builderButton=event.target.closest('[data-builder-action]');if(builderButton){try{await builder.handleClick(builderButton);}catch(e){notify(e.message);console.error(e);}return;}
  const b=event.target.closest('[data-action]');if(!b||b.disabled)return;
  const s=current(),action=b.dataset.action;
  try{
    if(action==='nav'){await flush();view=b.dataset.view;location.hash=view;render();}
    else if(action==='new')await createNew();
    else if(action==='next'){cursor++;s.cursor=cursor;put(s);render();}
    else if(action==='back'){cursor=Math.max(0,cursor-1);s.cursor=cursor;put(s);render();}
    else if(action==='goto'){cursor=Number(b.dataset.index);s.cursor=cursor;put(s);render();}
    else if(action==='preset')await createNew({global:'down',wave:b.dataset.preset});
    else if(action==='open')await openRecord(b.dataset.id);
    else if(action==='lock-trade'||action==='lock-observation'){const updated=lockDecision(s,action==='lock-trade'?'trade':'observation');put(updated);if(!await flush()){render();throw new Error('Запись пока только в памяти. Скачай резервную копию.');}render();notify(action==='lock-trade'?'Путь сохранён. Исход можно добавить позже.':'Наблюдение сохранено');}
    else if(action==='save-result'){
      for(const key of ['stake','payout','entryPrice','exitPrice']){const value=s.trade[key];if(value!==''&&(decimal(value)===null||decimal(value)<0))throw new Error('Проверь числовые поля');}
      if(s.trade.stake!==''&&decimal(s.trade.stake)<=0)throw new Error('Сумма сделки должна быть больше нуля');
      put(s);if(!await flush())throw new Error('Не удалось сохранить запись в браузере');render();notify('Запись сохранена');
    }
    else if(action==='export')await exportAll();
    else if(action==='csv')await exportAll(true);
    else if(action==='import')document.querySelector('#import-file').click();
    else if(action==='image'){const dialog=document.querySelector('#image-dialog');dialog.querySelector('img').src=s.screenshots[Number(b.dataset.index)].data;dialog.showModal();}
    else if(action==='remove-image'){s.screenshots.splice(Number(b.dataset.index),1);put(s);render();}
    else if(action==='delete'){
      if(!confirm('Удалить этот разбор и его скриншоты?'))return;
      const id=b.dataset.id;pending.delete(id);await flush();await repository.remove(id);sessions=sessions.filter(x=>x.id!==id);
      if(currentId===id){currentId=null;await createNew();}else render();notify('Разбор удалён');
    }
  }catch(e){notify(e.message||'Не удалось выполнить действие');console.error(e);}
});
app.addEventListener('change',async event=>{
  const el=event.target;if(el.dataset.builderField||el.dataset.nodeField||el.dataset.optionField){if(el.tagName==='SELECT')builder.handleInput(el);return;}const s=current();if(!s)return;
  if(el.name==='answer'){
    if(s.answers[el.dataset.key]!==el.value){const updated=answerFor(s,el.dataset.key,el.value);updated.cursor=cursor;put(updated);}
    render();
  }else if(el.dataset.field){s[el.dataset.field]=el.value;put(s);}
  else if(el.dataset.trade){s.trade[el.dataset.trade]=el.value;put(s);}
  else if(el.id==='journal-filter'){filter=el.value;document.querySelector('#journal-list').innerHTML=journalRows();}
  else if(el.id==='screenshot-files'){
    try{
      const files=[...el.files];if(files.length+s.screenshots.length>4)throw new Error('Можно прикрепить до четырёх скриншотов');
      for(const file of files){if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>5*1024*1024)throw new Error('Нужен PNG, JPEG, WebP или GIF до 5 МБ');}
      for(const file of files){const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});s.screenshots.push({name:file.name,data});}
      put(s);await flush();render();
    }catch(e){notify(e.message||'Не удалось прочитать изображение');}
  }
});
app.addEventListener('input',event=>{
  const el=event.target,s=current();
  if(el.dataset.builderField||el.dataset.nodeField||el.dataset.optionField){if(el.tagName!=='SELECT')builder.handleInput(el);return;}
  if(el.id==='journal-search'){search=el.value;document.querySelector('#journal-list').innerHTML=journalRows();return;}
  if(!s)return;
  if(el.dataset.field){s[el.dataset.field]=el.value;put(s);}
  if(el.dataset.trade){s.trade[el.dataset.trade]=el.value;put(s);}
});
document.querySelector('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>100*1024*1024)throw new Error('Файл больше 100 МБ');
    const data=JSON.parse(await file.text()),incoming=validateImport(data),incomingSchemes=validateSchemes(data.schemes);await flush();
    let added=0,duplicates=0;const ids=new Set(sessions.map(s=>s.id));
    for(const s of incoming){if(ids.has(s.id)){duplicates++;continue;}await repository.put(s);sessions.push(s);ids.add(s.id);added++;}
    let schemesAdded=0;const schemeIds=new Set(customSchemes.map(s=>s.id));for(const scheme of incomingSchemes)if(!schemeIds.has(scheme.id)){customSchemes.push(scheme);schemeIds.add(scheme.id);schemesAdded++;}
    if(schemesAdded){schemesDirty=true;if(!await flush())throw new Error('Не удалось сохранить схемы');}render();notify('Добавлено записей: '+added+'. Схем: '+schemesAdded+'. Дубликатов записей пропущено: '+duplicates+'.');
  }catch(e){notify(e.message||'Не удалось импортировать файл');}
  event.target.value='';
});
document.querySelector('#close-image').addEventListener('click',()=>document.querySelector('#image-dialog').close());
document.querySelector('#image-dialog').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.close();});
app.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('.builder-map-node')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});

document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(['new','journal','stats','schemes','builder'].includes(next)&&next!==view){view=next;render();}});
try{
  sessions=await repository.all();customSchemes=validateSchemes(await repository.meta('schemes'));currentId=await repository.meta('currentId');
  if(!sessions.some(s=>s.id===currentId)){const s=freshSession();sessions.unshift(s);currentId=s.id;await repository.put(s);await repository.setMeta('currentId',currentId);}
  const s=current();cursor=s.decisionSnapshot?routeFor(s).steps.length:s.cursor??Math.max(0,routeFor(s).steps.length-1);
}catch(e){storageFailed=true;const s=freshSession();sessions=[s];currentId=s.id;console.error(e);}
render();
