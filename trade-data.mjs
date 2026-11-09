export const TRADE_IMPORT_KEYS=['entryTime','exitTime','entryPrice','exitPrice','stake','payout','outcome','mode','externalId'];
const datePattern=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
export function localDateTimeParts(value){
  const m=typeof value==='string'&&value.match(datePattern);
  if(!m)throw new Error('Некорректная дата и время сделки');
  const [year,month,day,hour,minute,second]=m.slice(1,7).map((v,i)=>v===undefined&&i===5?0:Number(v));
  const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(year<1000||month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59)throw new Error('Некорректная дата и время сделки');
  return {year,month,day,hour,minute,second,millisecond:Number((m[7]||'').padEnd(3,'0'))};
}
function dateOrder(value){const p=localDateTimeParts(value);return [p.year,p.month,p.day,p.hour,p.minute,p.second].map((v,i)=>String(v).padStart(i?2:4,'0')).join('')+String(p.millisecond).padStart(3,'0');}
export function assertTradeMetadata(trade){
  if(trade.exitTime!==undefined&&trade.exitTime!==''){
    localDateTimeParts(trade.exitTime);
    if(trade.entryTime&&dateOrder(trade.exitTime)<=dateOrder(trade.entryTime))throw new Error('Время закрытия должно быть позже открытия');
  }
  for(const key of ['mode','externalId'])if(trade[key]!==undefined&&(typeof trade[key]!=='string'||trade[key].length>100||/[\u0000-\u001f\u007f]/.test(trade[key])))throw new Error('Некорректные дополнительные данные сделки');
  if(trade.sourceParser!==undefined&&(typeof trade.sourceParser!=='string'||trade.sourceParser!==''&&!/^[a-z][a-z0-9-]{0,79}$/.test(trade.sourceParser)))throw new Error('Некорректный формат источника сделки');
}
export function normalizeDecimal(raw,{money=false,positive=false}={}){
  let text=String(raw).trim().replace(/[\u00a0\u202f\u2009]/g,' ');
  const spaced=/^\d{1,3}(?: \d{3})+(?:[.,]\d+)?$/;
  if(text.includes(' ')){if(!spaced.test(text))throw new Error('Некорректное число: '+raw);text=text.replaceAll(' ','');}
  if(text.includes('.')&&text.includes(',')){
    const point=text.lastIndexOf('.')>text.lastIndexOf(',')?'.':',',thousands=point==='.'?',':'.';
    const [whole,fraction,...extra]=text.split(point);
    const escaped=thousands==='.'?'\\.':',';
    if(extra.length||!new RegExp('^\\d{1,3}(?:'+escaped+'\\d{3})+$').test(whole)||!/^\d+$/.test(fraction))throw new Error('Некорректное число: '+raw);
    text=whole.replaceAll(thousands,'')+'.'+fraction;
  }else text=text.replace(',','.');
  if(!/^\d+(?:\.\d+)?$/.test(text)||text.length>40||!Number.isFinite(Number(text))||Number(text)>Number.MAX_SAFE_INTEGER)throw new Error('Некорректное число: '+raw);
  let [whole,fraction='']=text.split('.');
  if(money&&fraction.length>2)throw new Error('В сумме допускается не больше двух знаков после разделителя');
  whole=whole.replace(/^0+(?=\d)/,'');fraction=fraction.replace(/0+$/,'');
  const value=whole+(fraction?'.'+fraction:'');
  if(positive&&Number(value)<=0)throw new Error('Сумма сделки должна быть больше нуля');
  return value;
}
const cents=value=>{const [whole,fraction='']=value.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));};
export function outcomeFromAmounts(stake,payout){const difference=cents(payout)-cents(stake);return difference>0n?'win':difference<0n?'loss':'draw';}
export function netFromAmounts(stake,payout){
  let net=cents(payout)-cents(stake);const sign=net<0n?'-':'';if(net<0n)net=-net;
  return sign+String(net/100n)+'.'+String(net%100n).padStart(2,'0');
}
export function assertParsedTrade(fields){
  if(!fields||typeof fields!=='object'||Array.isArray(fields)||!Object.keys(fields).length)throw new Error('Парсер не вернул данные сделки');
  for(const key of Object.keys(fields)){
    if(!TRADE_IMPORT_KEYS.includes(key)||typeof fields[key]!=='string'||!fields[key])throw new Error('Парсер вернул недопустимое поле сделки');
    if(['entryPrice','exitPrice','stake','payout'].includes(key)&&normalizeDecimal(fields[key],{money:key==='stake'||key==='payout',positive:key==='stake'})!==fields[key])throw new Error('Парсер вернул некорректное число');
  }
  if(fields.entryTime)localDateTimeParts(fields.entryTime);
  assertTradeMetadata(fields);
  if(fields.outcome&&!['win','loss','draw','pending'].includes(fields.outcome))throw new Error('Парсер вернул неизвестный исход');
  if(fields.stake&&fields.payout&&fields.outcome&&outcomeFromAmounts(fields.stake,fields.payout)!==fields.outcome)throw new Error('Исход не совпадает с суммами сделки');
  return fields;
}
export function applyParsedTrade(session,parsed){
  if(!session?.trade?.executed||session.disposition!=='trade'||!session.decisionSnapshot)throw new Error('Сначала зафиксируй сделку в разборе');
  if(!parsed||typeof parsed.parserId!=='string'||!/^[a-z][a-z0-9-]{0,79}$/.test(parsed.parserId))throw new Error('Неизвестный источник данных');
  assertParsedTrade(parsed.fields);
  const trade={...session.trade,...parsed.fields,sourceParser:parsed.parserId};
  assertTradeMetadata(trade);
  return {...session,trade,updatedAt:new Date().toISOString()};
}
