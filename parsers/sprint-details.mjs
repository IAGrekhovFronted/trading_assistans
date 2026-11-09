import {normalizeDecimal,localDateTimeParts,outcomeFromAmounts} from '../trade-data.mjs';
const labels=['Открытие','Закрытие','Сумма сделки','Выплата','Режим','№'];
const fieldLine=/^(Открытие|Закрытие|Сумма сделки|Выплата|Режим|№|Номер сделки)(?=\s|:|$)\s*:?\s*(.*)$/iu;
const normalized=text=>text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/[\u00a0\u202f\u2009]/g,' ');
function readFields(text){
  const fields=new Map();let pending;
  for(const line of normalized(text).split('\n').map(line=>line.trim()).filter(Boolean)){
    const match=line.match(fieldLine);
    if(match){
      if(pending)throw new Error('Нет значения поля «'+pending+'»');
      const key=match[1].toLocaleLowerCase('ru-RU'),label=labels.find(x=>x.toLocaleLowerCase('ru-RU')===key)||'№';
      if(fields.has(label))throw new Error('Повторяется поле «'+label+'». Вставь данные одной сделки.');
      fields.set(label,match[2]);if(!match[2])pending=label;
    }else if(pending){fields.set(pending,line);pending=undefined;}
    else throw new Error('Лишняя строка в карточке сделки: '+line.slice(0,80));
  }
  if(pending)throw new Error('Нет значения поля «'+pending+'»');
  for(const label of labels)if(!fields.has(label))throw new Error('Не найдено поле «'+label+'»');
  return fields;
}
function priceAndTime(value,label){
  const match=value.match(/^(.+?)\s*[·•]\s*(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if(!match)throw new Error('В поле «'+label+'» нужны цена и дата с временем до секунды');
  const time=match[4]+'-'+match[3]+'-'+match[2]+'T'+match[5]+':'+match[6]+':'+match[7];
  localDateTimeParts(time);
  return {price:normalizeDecimal(match[1]),time};
}
function amount(value,positive=false){
  const match=value.match(/^(?:\$\s*([\d., ]+)|([\d., ]+)\s*(?:\$|USD))$/i);
  if(!match)throw new Error('Суммы должны быть указаны в долларах, например $500 или $8,95');
  return normalizeDecimal(match[1]||match[2],{money:true,positive});
}
export const sprintDetailsParser={
  id:'sprint-details-v1',
  label:'Подробная карточка Sprint',
  canParse(text){const value=normalized(text);return /(?:^|\n)\s*Открытие(?=\s|:|$)/iu.test(value)&&/(?:^|\n)\s*Закрытие(?=\s|:|$)/iu.test(value)&&/(?:^|\n)\s*(?:Сумма сделки|Выплата)(?=\s|:|$)/iu.test(value);},
  parse(text){
    const values=readFields(text);
    if(values.get('Режим').toLowerCase()!=='sprint')throw new Error('Этот формат поддерживает режим Sprint');
    if(!/^\d{1,100}$/.test(values.get('№')))throw new Error('Номер сделки должен содержать только цифры');
    const entry=priceAndTime(values.get('Открытие'),'Открытие'),exit=priceAndTime(values.get('Закрытие'),'Закрытие');
    const stake=amount(values.get('Сумма сделки'),true),payout=amount(values.get('Выплата'));
    return {entryPrice:entry.price,entryTime:entry.time,exitPrice:exit.price,exitTime:exit.time,stake,payout,outcome:outcomeFromAmounts(stake,payout),mode:'Sprint',externalId:values.get('№')};
  }
};
