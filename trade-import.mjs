import {tradeParserFactory,MAX_TRADE_TEXT_LENGTH} from './trade-parsers.mjs';
import {applyParsedTrade,netFromAmounts} from './trade-data.mjs';
const labels={entryTime:'Время открытия',exitTime:'Время закрытия',entryPrice:'Цена открытия',exitPrice:'Цена на экспирации',stake:'Сумма сделки',payout:'Полная выплата',outcome:'Результат',mode:'Режим',externalId:'Номер сделки'};
const outcomeLabels={win:'Плюс',loss:'Минус',draw:'Возврат',pending:'Ожидает исхода'};
const formatValue=(key,value)=>['entryTime','exitTime'].includes(key)&&/^\d{4}-\d{2}-\d{2}T/.test(value)?value.slice(8,10)+'.'+value.slice(5,7)+'.'+value.slice(0,4)+' '+value.slice(11):key==='outcome'?outcomeLabels[value]||value:['stake','payout'].includes(key)?'$'+value:value;
export function createTradeImport({getCurrent,save,persist,render,notify,esc,factory=tradeParserFactory}){
  const drafts=new Map(),applying=new Set();
  function draftFor(id){if(!drafts.has(id))drafts.set(id,{text:'',parserId:'auto',result:null,error:'',open:false,applied:false});return drafts.get(id);}
  function preview(session,draft){
    if(draft.error)return '<p class="trade-parse-error" role="alert">'+esc(draft.error)+'</p>';
    if(!draft.result)return '';
    const {fields,parserLabel}=draft.result,changed=Object.entries(fields).filter(([key,value])=>session.trade[key]!==undefined&&session.trade[key]!==''&&session.trade[key]!==value&&!(key==='outcome'&&session.trade[key]==='pending')).length;
    return '<div class="trade-parse-preview"><h4 tabindex="-1">Распознано: '+esc(parserLabel)+'</h4><dl>'+Object.entries(labels).filter(([key])=>fields[key]!==undefined).map(([key,label])=>'<div><dt>'+label+'</dt><dd>'+esc(formatValue(key,fields[key]))+'</dd></div>').join('')+'</dl>'+
    (fields.stake&&fields.payout?'<p class="trade-parse-net">Выплата минус ставка <strong>$'+esc(netFromAmounts(fields.stake,fields.payout))+'</strong></p><p class="version-note">Результат определён по выплате относительно ставки.</p>':'')+
    (changed?'<p class="trade-parse-replace">Заполненные поля будут заменены данными из текста.</p>':'')+
    '<button class="primary" data-action="apply-trade-import" data-session-id="'+esc(session.id)+'">Заполнить поля</button></div>';
  }
  function panel(session){
    if(!session.trade.executed)return '';
    const d=draftFor(session.id);
    return '<details class="trade-import" data-trade-import data-session-id="'+esc(session.id)+'" '+(d.open?'open':'')+'><summary>Заполнить из текста'+(d.applied?' <span>Данные перенесены</span>':'')+'</summary><div class="trade-import-body"><p>Вставь скопированные данные одной сделки и проверь распознанные поля.</p><label class="field">Формат<select data-trade-import-field="parserId" aria-label="Формат данных сделки"><option value="auto" '+(d.parserId==='auto'?'selected':'')+'>Автоопределение</option>'+factory.list().map(p=>'<option value="'+esc(p.id)+'" '+(d.parserId===p.id?'selected':'')+'>'+esc(p.label)+'</option>').join('')+'</select></label><label class="field">Текст сделки<textarea data-trade-import-field="text" maxlength="'+MAX_TRADE_TEXT_LENGTH+'" placeholder="Открытие, закрытие, сумма сделки, выплата, режим и номер">'+esc(d.text)+'</textarea></label><div class="trade-import-actions"><button class="secondary" data-action="parse-trade-import" data-session-id="'+esc(session.id)+'">Распознать</button><button class="text-button" data-action="clear-trade-import" data-session-id="'+esc(session.id)+'">Очистить текст</button></div><p class="version-note">Время переносится как в исходном тексте, без смены часового пояса.</p><div class="trade-import-preview" aria-live="polite">'+preview(session,d)+'</div></div></details>';
  }
  function handleInput(el){
    const field=el.dataset.tradeImportField;if(!field)return false;
    const panel=el.closest('[data-trade-import]'),session=getCurrent();if(!panel||panel.dataset.sessionId!==session?.id)return true;
    const d=draftFor(session.id);if(d[field]===el.value)return true;d[field]=el.value;d.result=null;d.error='';d.applied=false;d.open=true;
    panel.querySelector('.trade-import-preview').innerHTML='';
    return true;
  }
  async function handleAction(button){
    const action=button.dataset.action;
    if(!['parse-trade-import','clear-trade-import','apply-trade-import'].includes(action))return false;
    const session=getCurrent();if(!session||session.id!==button.dataset.sessionId||!session.trade.executed)return true;
    const d=draftFor(session.id);
    if(action==='parse-trade-import'){
      d.open=true;d.applied=false;
      try{d.result=factory.parse(d.text,{parserId:d.parserId});d.error='';}
      catch(error){d.result=null;d.error=error.message;}
      render();return true;
    }
    if(action==='clear-trade-import'){drafts.delete(session.id);const next=draftFor(session.id);next.open=true;render();return true;}
    if(applying.has(session.id)||!d.result)return true;
    applying.add(session.id);const result=d.result;
    try{
      const updated=applyParsedTrade(session,result);save(updated);
      if(await persist()===false)throw new Error('Поля заполнены в памяти. Не удалось сохранить: скачай резервную копию.');
      if(d.result===result){d.applied=true;d.open=false;}
      if(getCurrent()?.id===session.id)render();
      notify('Данные сделки перенесены и сохранены');
    }finally{applying.delete(session.id);}
    return true;
  }
  return {panel,handleInput,handleAction,forget:id=>drafts.delete(id)};
}
