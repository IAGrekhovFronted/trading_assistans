import {sprintDetailsParser} from './parsers/sprint-details.mjs';
import {assertParsedTrade} from './trade-data.mjs';
export const MAX_TRADE_TEXT_LENGTH=20000;
export function createTradeParserFactory(definitions=[]){
  const parsers=new Map();
  for(const definition of definitions){
    if(!definition||!/^[a-z][a-z0-9-]{0,79}$/.test(definition.id)||typeof definition.label!=='string'||!definition.label||typeof definition.canParse!=='function'||typeof definition.parse!=='function'||parsers.has(definition.id))throw new Error('Некорректная регистрация парсера сделок');
    parsers.set(definition.id,{...definition});
  }
  function create(text,parserId='auto'){
    if(typeof text!=='string'||!text.trim())throw new Error('Вставь данные одной сделки');
    if(text.length>MAX_TRADE_TEXT_LENGTH)throw new Error('Текст сделки слишком длинный');
    if(parserId!=='auto'){
      if(!parsers.has(parserId))throw new Error('Неизвестный формат сделки');
      return parsers.get(parserId);
    }
    const matches=[...parsers.values()].filter(parser=>parser.canParse(text));
    if(!matches.length)throw new Error('Формат не распознан. Выбери формат или проверь скопированный текст.');
    if(matches.length>1)throw new Error('Подходит несколько форматов. Выбери нужный формат вручную.');
    return matches[0];
  }
  return {
    list:()=>[...parsers.values()].map(({id,label})=>({id,label})),
    create,
    parse(text,{parserId='auto'}={}){
      const parser=create(text,parserId),fields=parser.parse(text);
      assertParsedTrade(fields);
      return {parserId:parser.id,parserLabel:parser.label,fields:{...fields}};
    }
  };
}
export const tradeParserFactory=createTradeParserFactory([sprintDetailsParser]);
