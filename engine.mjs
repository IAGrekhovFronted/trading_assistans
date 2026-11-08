import {customRoute,customAnswer,customEvaluation,inspectScheme} from './schemes.mjs';
export const ALGORITHM_VERSION = '0.1';
export const FORMAT = 'entry-navigator/v1';
const directions = [{value:'down',label:'Вниз',detail:'Понижаются вершины и минимумы',icon:'↘'},{value:'up',label:'Вверх',detail:'Повышаются вершины и минимумы',icon:'↗'},{value:'unclear',label:'Не могу определить',detail:'Смешанная структура или диапазон',icon:'≈'}];
const yn = [{value:'yes',label:'Да',detail:'Условие видно на графике',icon:'✓'},{value:'no',label:'Нет',detail:'Условие пока не выполнено',icon:'−'},{value:'unclear',label:'Не уверен',detail:'Нужны наблюдение или уточнение',icon:'?'}];
export function question(key, a = {}) {
  const down = a.local !== 'up';
  const common = {
    global:{title:'Какой сейчас глобальный тренд?',eyebrow:'Сначала — контекст',hint:'Выбери направление более крупного движения на своём рабочем масштабе.',options:directions},
    wave:{title:'Куда идёт текущая волна?',eyebrow:'Выбираем ветку',hint:'Сравни текущее движение с выбранным глобальным направлением.',options:[{value:'with',label:'По глобальному тренду',detail:'Рассматриваем продолжение локального движения',icon:'→'},{value:'against',label:'Против глобального тренда',detail:'Переходим к ветке отката',icon:'↩'},{value:'pause',label:'Пауза или диапазон',detail:'Локальную структуру проверим отдельно',icon:'Ⅱ'}]},
    correction:{title:'Откат уже сменил направление?',eyebrow:'Ветка отката',hint:'Здесь ждём перехода от движения против фона к локальному движению по фону.',options:[{value:'turned',label:'Да, локальная структура сменилась',detail:'Проверим новое локальное направление',icon:'↪'},{value:'continues',label:'Нет, откат ещё продолжается',detail:'Сохраним состояние ожидания',icon:'…'},{value:'unclear',label:'Не могу подтвердить',detail:'Не будем угадывать окончание',icon:'?'}]},
    local:{title:'Какое направление у локального тренда?',eyebrow:'Главное — локальная структура',hint:'Оцени последовательность сопоставимых вершин и минимумов. Глобальный фон сам по себе вход не определяет.',options:directions},
    pullback:{title:down?'Был откат вверх внутри локального снижения?':'Был откат вниз внутри локального роста?',eyebrow:'Группа 1 · продолжение локального тренда',hint:'Отмечаем подготовку к возможному продолжению движения.',options:[{value:'yes',label:'Да, был откат',detail:down?'Цена вернулась вверх':'Цена вернулась вниз',icon:'↩'},{value:'pause',label:'В основном была пауза',detail:'Сохраним как отдельный вариант сценария',icon:'Ⅱ'},{value:'no',label:'Нет, движение ещё продолжается',detail:'Откат или пауза пока не выделены',icon:'→'},{value:'unclear',label:'Неясно',detail:'Структура подготовки не определена',icon:'?'}]},
    level:{title:down?'Цена у заранее отмеченного сопротивления?':'Цена у заранее отмеченной поддержки?',eyebrow:'Место для наблюдения',hint:'При желании укажи зону и значимость. Сильная прежняя реакция остаётся характеристикой истории.',options:yn},
    stoch:{title:down?'Stoch RSI был в перекупленности на откате?':'Stoch RSI был в перепроданности на откате?',eyebrow:'Проверяем состояние индикатора',hint:down?'Отмечаем верхнюю зону во время отката. Самостоятельным сигналом она не считается.':'Это зеркальная гипотеза для входа вверх. Её статистика собирается отдельно.',options:yn},
    reaction:{title:'Цена остановилась у зоны?',eyebrow:'Поведение цены',hint:'Есть ли остановка продвижения против локального направления?',options:yn},
    confirmation:{title:'Что произошло после остановки?',eyebrow:'Отделяем отклик от подтверждения',hint:down?'Рабочая гипотеза: минутная свеча закрылась ниже промежуточного минимума отката.':'Зеркальная гипотеза: минутная свеча закрылась выше промежуточного максимума отката.',options:[{value:'structure',label:'Нарушена структура отката',detail:down?'Есть закрытие ниже промежуточного минимума':'Есть закрытие выше промежуточного максимума',icon:'✓'},{value:'first',label:'Пока только первый отклик',detail:'Цена качнулась по тренду, но пробоя ещё нет',icon:'↝'},{value:'continued',label:'Откат продолжился',detail:'Цена снова пошла против локального тренда',icon:'↩'},{value:'unclear',label:'Не могу определить',detail:'Момент подтверждения не установлен',icon:'?'}]}
  };
  return common[key] ? {key,...common[key]} : null;
}
function next(key,a) {
  if(key==='global') return a.global==='unclear'?'local':'wave';
  if(key==='wave') return a.wave==='against'?'correction':'local';
  if(key==='correction') return a.correction==='turned'?'local':a.correction==='continues'?'end:correction':'end:unclear';
  if(key==='local'){
    if(a.local==='unclear') return 'end:local';
    if((a.wave==='with'||a.correction==='turned') && a.global!=='unclear' && a.local!==a.global) return 'end:conflict';
    return 'pullback';
  }
  if(key==='pullback') return ['yes','pause'].includes(a.pullback)?'level':a.pullback==='no'?'end:pullback':'end:unclear';
  if(key==='level') return a.level==='yes'?'stoch':a.level==='no'?'end:level':'end:unclear';
  if(key==='stoch') return a.stoch==='yes'?'reaction':a.stoch==='no'?'end:stoch':'end:unclear';
  if(key==='reaction') return a.reaction==='yes'?'confirmation':a.reaction==='no'?'end:reaction':'end:unclear';
  if(key==='confirmation') return a.confirmation==='structure'?'end:matched':a.confirmation==='first'?'end:first':a.confirmation==='continued'?'end:continued':'end:unclear';
  throw new Error('Неизвестный шаг');
}
export function route(answers={}) {
  const steps=[]; let key='global';
  for(let i=0;i<20;i++){
    if(key.startsWith('end:')) return {steps,end:key.slice(4),complete:true};
    const q=question(key,answers); steps.push(q);
    if(!q.options.some(o=>o.value===answers[key])) return {steps,end:null,complete:false};
    key=next(key,answers);
  }
  throw new Error('Цикл в алгоритме');
}
export function answer(session,key,value) {
  const r=route(session.answers); const index=r.steps.findIndex(s=>s.key===key);
  const q=question(key,session.answers);
  if(index<0 || !q?.options.some(o=>o.value===value)) throw new Error('Недопустимый ответ');
  if(session.decisionSnapshot) throw new Error('Путь уже зафиксирован');
  const answers={};
  for(let i=0;i<index;i++){const k=r.steps[i].key; if(session.answers[k])answers[k]=session.answers[k];}
  answers[key]=value;
  return {...session,answers,updatedAt:new Date().toISOString()};
}
export function scenario(a={}) {
  if(a.global==='unclear')return 'Без ясного глобального фона';
  if(a.wave==='against')return 'Окончание отката';
  if(a.wave==='pause')return 'Пауза на глобальном фоне';
  if(a.wave==='with')return 'Волна по глобальному тренду';
  return 'Контекст не определён';
}
export function evaluation(answers={}) {
  const r=route(answers);
  if(!r.complete)return {kind:'draft',title:'Разбор в процессе',reason:'Ответь на следующий вопрос.',code:'draft'};
  const endings={
    matched:['matched','Условия отмечены','Выбранная последовательность условий собрана. Это рабочая гипотеза для дневника, а не прогноз результата.'],
    correction:['waiting','Откат ещё продолжается','В этой ветке смена локального направления пока не отмечена.'],
    local:['unclear','Локальная структура не определена','Выбрать направление для группы 1 пока не получилось.'],
    conflict:['unclear','Контекст нужно уточнить','Локальное направление расходится с ответом о волне. Проверь предыдущие шаги.'],
    pullback:['waiting','Подготовка ещё не сформировалась','Откат или пауза внутри локального движения пока не выделены.'],
    level:['waiting','Цена ещё не у зоны','Условие заранее отмеченного уровня не выполнено.'],
    stoch:['waiting','Условие Stoch RSI не отмечено','Сценарий пока не собран по выбранным условиям.'],
    reaction:['waiting','Реакции у зоны пока нет','Цена ещё не остановилась в выбранной области.'],
    first:['waiting','Есть только ранняя реакция','Первый отклик отмечен. Подтверждение по структуре отката пока не выбрано.'],
    continued:['waiting','Откат продолжился','Первая реакция не стала окончанием отката. Наблюдение можно сохранить.'],
    unclear:['unclear','Недостаточно определённости','Зафиксируй неясный участок и вернись к нему при разборе.']
  };
  const [kind,title,reason]=endings[r.end];
  return {kind,title,reason,code:r.end,experimental:answers.local==='up'};
}
export function freshSession() {
  const now=new Date().toISOString();
  return {id:crypto.randomUUID(),createdAt:now,updatedAt:now,algorithmVersion:ALGORITHM_VERSION,symbol:'BTC/USDT',expiryMinutes:5,answers:{},zone:'',zoneStrength:'unknown',notes:'',screenshots:[],disposition:'draft',trade:{executed:false,outcome:'pending',entryTime:'',entryPrice:'',exitPrice:'',stake:'',payout:''}};
}
export const routeFor=s=>s.schemeSnapshot?customRoute(s):route(s.answers);
export const evaluationFor=s=>s.schemeSnapshot?customEvaluation(s):evaluation(s.answers);
export const answerFor=(s,key,value)=>s.schemeSnapshot?customAnswer(s,key,value):answer(s,key,value);
export const scenarioFor=s=>s.schemeSnapshot?s.schemeSnapshot.name:scenario(s.decisionSnapshot?.answers||s.answers);
export function freshSchemeSession(scheme){
  const checked=inspectScheme(scheme);if(!checked.valid)throw new Error(checked.errors[0]);
  return {...freshSession(),algorithmVersion:'custom.'+scheme.revision,schemeId:scheme.id,schemeSnapshot:structuredClone(scheme)};
}
export function lockDecision(s,type) {
  const result=evaluationFor(s);
  if(result.kind==='draft')throw new Error('Сначала заверши путь вопросов');
  return {...s,disposition:type,updatedAt:new Date().toISOString(),decisionSnapshot:{answers:structuredClone(s.answers),algorithmVersion:s.algorithmVersion,conclusion:result,at:new Date().toISOString()},trade:{...s.trade,executed:type==='trade'}};
}
export function decimal(v) {
  if(v===''||v===null||v===undefined)return null;
  const n=Number(String(v).replace(/\s/g,'').replace(',','.'));
  return Number.isFinite(n)?n:null;
}
export function profit(s) {
  if(!s.trade.executed||!['win','loss','draw'].includes(s.trade.outcome))return null;
  const stake=decimal(s.trade.stake),payout=decimal(s.trade.payout);
  return stake!==null&&payout!==null&&stake>=0&&payout>=0?Math.round((payout-stake)*100)/100:null;
}
export function statistics(sessions) {
  const trades=sessions.filter(s=>s.trade?.executed);
  const wins=trades.filter(s=>s.trade.outcome==='win').length;
  const losses=trades.filter(s=>s.trade.outcome==='loss').length;
  const draws=trades.filter(s=>s.trade.outcome==='draw').length;
  const pnls=trades.map(profit).filter(v=>v!==null);
  return {wins,losses,draws,pending:trades.filter(s=>s.trade.outcome==='pending').length,closed:wins+losses+draws,winrate:wins+losses?Math.round(wins/(wins+losses)*1000)/10:null,net:pnls.length?Math.round(pnls.reduce((a,b)=>a+b,0)*100)/100:null,netCount:pnls.length,observations:sessions.filter(s=>s.disposition==='observation').length};
}
export function validateImport(value) {
  if(!value||value.format!==FORMAT||!Array.isArray(value.sessions)||value.sessions.length>10000)throw new Error('Неизвестный формат файла');
  const seen=new Set();
  return value.sessions.map(s=>{
    if(!s||typeof s.id!=='string'||s.id.length>100||seen.has(s.id))throw new Error('Неверные или повторяющиеся идентификаторы');
    seen.add(s.id);
    if(typeof s.createdAt!=='string'||!Number.isFinite(Date.parse(s.createdAt))||!s.answers||typeof s.answers!=='object'||Array.isArray(s.answers)||!s.trade||!['pending','win','loss','draw'].includes(s.trade.outcome)||typeof s.trade.executed!=='boolean')throw new Error('Повреждённая запись');
    if(s.schemeSnapshot){const v=inspectScheme(s.schemeSnapshot);if(!v.valid||s.schemeId!==s.schemeSnapshot.id||s.algorithmVersion!=='custom.'+s.schemeSnapshot.revision)throw new Error('Некорректная версия схемы в разборе');}
    else if(s.schemeId)throw new Error('В разборе отсутствует версия схемы');
    const r=routeFor(s);
    const reachable=new Set(r.steps.map(q=>q.key));
    for(const [key,val] of Object.entries(s.answers))if(!reachable.has(key)||!r.steps.find(q=>q.key===key)?.options.some(o=>o.value===val))throw new Error('Недопустимый путь ответов');
    if(!['draft','trade','observation'].includes(s.disposition))throw new Error('Неизвестный тип записи');
    if(typeof s.notes!=='string'||s.notes.length>50000||typeof s.symbol!=='string'||s.symbol.length>100||typeof s.zone!=='string'||s.zone.length>500)throw new Error('Некорректный текст');
    const screenshots=Array.isArray(s.screenshots)?s.screenshots:[];
    if(screenshots.length>4||screenshots.some(x=>typeof x.data!=='string'||x.data.length>8000000||!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(x.data)))throw new Error('Некорректное изображение');
    for(const k of ['stake','payout','entryPrice','exitPrice'])if(s.trade[k]!==''&&(decimal(s.trade[k])===null||decimal(s.trade[k])<0))throw new Error('Некорректное число');
    if(typeof s.algorithmVersion!=='string'||s.algorithmVersion.length>30)throw new Error('Неверная версия алгоритма');
    if(s.cursor!==undefined&&(!Number.isInteger(s.cursor)||s.cursor<0||s.cursor>r.steps.length))throw new Error('Неверный шаг');
    if(s.disposition==='draft'&&(s.decisionSnapshot||s.trade.executed))throw new Error('Несогласованное состояние черновика');
    if(s.disposition==='trade'&&!s.trade.executed||s.disposition==='observation'&&s.trade.executed)throw new Error('Несогласованный тип записи');
    if(s.disposition!=='draft'){
      const snap=s.decisionSnapshot;
      if(!snap||!r.complete||typeof snap.at!=='string'||!Number.isFinite(Date.parse(snap.at))||!snap.conclusion||!['matched','waiting','unclear'].includes(snap.conclusion.kind)||!snap.answers||JSON.stringify(snap.answers)!==JSON.stringify(s.answers)||snap.algorithmVersion!==s.algorithmVersion)throw new Error('Нет корректного зафиксированного пути');
      if(s.schemeSnapshot&&JSON.stringify(snap.conclusion)!==JSON.stringify(evaluationFor(s)))throw new Error('Итог не совпадает с сохранённой схемой');
    }
    return {...s,screenshots};
  });
}
export function csv(sessions) {
  const cell=v=>{const raw=String(v??'');const safe=typeof v==='string'&&/^[=+@\-\t\r]/.test(v)?"'"+raw:raw;return '"'+safe.replaceAll('"','""')+'"';};
  const rows=[['ID','Создано','Версия алгоритма','Ветка','Направление','Подготовка','Условия','Сделка','Исход','Вход','Закрытие','Ставка','Выплата','Прибыль','Зона','Комментарий','ID схемы','Версия схемы']];
  for(const s of sessions){const a=s.decisionSnapshot?.answers||s.answers;rows.push([s.id,s.createdAt,s.algorithmVersion,scenarioFor(s),a.local||'',a.pullback||'',s.decisionSnapshot?.conclusion?.kind||evaluationFor(s).kind,s.trade.executed?'да':'нет',s.trade.outcome,s.trade.entryPrice,s.trade.exitPrice,s.trade.stake,s.trade.payout,profit(s),s.zone,s.notes,s.schemeId||'',s.schemeSnapshot?.revision||'']);}
  return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
}
