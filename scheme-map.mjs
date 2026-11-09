// Pure presentation layout. Never mutates the graph or its answer order.
const MIN_NODE_HEIGHT=76,GAP=116,PADDING=28,COLUMN_GAP=72,LABEL_WIDTH=116;
const outgoing=n=>n.type==='question'?n.options:[];
const estimateWidth=(text,size)=>Array.from(text).reduce((sum,c)=>sum+(c===' '?0.35:/[MWШЩЖЮФ@%]/u.test(c)?0.9:0.66)*size,0);
// Wrap all content; only an overlong word may break inside itself, preferably after a hyphen.
export function wrapMapText(text,maxWidth,fontSize=12,measureText=estimateWidth){
  const lines=[];
  for(const paragraph of String(text).replace(/\r\n?|\u2028|\u2029/g,'\n').split('\n')){
    let line='';
    for(let word of paragraph.match(/\S+/g)||[]){
      if(line&&measureText(line+' '+word,fontSize)<=maxWidth){line+=' '+word;continue;}
      if(line){lines.push(line);line='';}
      let chars=Array.from(word);
      while(measureText(chars.join(''),fontSize)>maxWidth&&chars.length>1){
        let low=1,high=chars.length;
        while(low<high){const mid=Math.ceil((low+high)/2);if(measureText(chars.slice(0,mid).join(''),fontSize)<=maxWidth)low=mid;else high=mid-1;}
        let count=Math.max(1,low),hyphen=chars.slice(0,count).lastIndexOf('-');
        if(hyphen>0)count=hyphen+1;
        lines.push(chars.slice(0,count).join(''));chars=chars.slice(count);
      }
      line=chars.join('');
    }
    if(line||!paragraph.trim())lines.push(line);
  }
  return lines;
}
function browserTextMeasure(){
  if(typeof document==='undefined')return undefined;
  const context=document.createElement('canvas').getContext('2d');if(!context)return undefined;
  const cache=new Map();
  return (text,size)=>{
    const key=size+':'+text;if(cache.has(key))return cache.get(key);
    context.font=size+'px Inter,"Segoe UI",Arial,sans-serif';
    const width=context.measureText(text).width;cache.set(key,width);return width;
  };
}
export function layoutSchemeMap(scheme,{measureText=estimateWidth,schemeNames=new Map()}={}){
  const nodes=scheme.nodes,byId=new Map(nodes.map(n=>[n.id,n])),edges=[],out=new Map(),incoming=new Map();
  for(const n of nodes){out.set(n.id,[]);incoming.set(n.id,[]);}
  for(const n of nodes)outgoing(n).forEach((o,index)=>{
    if(!byId.has(o.next))return;
    const e={source:n.id,target:o.next,optionId:o.id,label:o.label,index};
    edges.push(e);out.get(n.id).push(e);incoming.get(o.next).push(e);
  });
  if(!nodes.length)return {width:720,height:120,positions:new Map(),edges:[]};
  // Discover children in answer order, independently of the stored nodes array.
  const rank=new Map(),order=[];
  function discover(root,base){
    if(!byId.has(root)||rank.has(root))return;
    const queue=[root];rank.set(root,base);
    for(let i=0;i<queue.length;i++){const id=queue[i];order.push(id);for(const e of out.get(id))if(!rank.has(e.target)){rank.set(e.target,rank.get(id)+1);queue.push(e.target);}}
  }
  discover(scheme.startId,0);
  for(const n of nodes)if(!rank.has(n.id))discover(n.id,rank.size?Math.max(...rank.values())+1:0);
  // Longest-path layering puts a shared destination below all its parents.
  // Cyclic drafts still get a finite layout; backward edges go round the outside.
  const degree=new Map(nodes.map(n=>[n.id,incoming.get(n.id).length])),queue=order.filter(id=>degree.get(id)===0);
  for(let i=0;i<queue.length;i++)for(const e of out.get(queue[i])){
    rank.set(e.target,Math.max(rank.get(e.target),rank.get(e.source)+1));
    degree.set(e.target,degree.get(e.target)-1);if(degree.get(e.target)===0)queue.push(e.target);
  }
  const rows=new Map();for(const id of order){const d=rank.get(id);if(!rows.has(d))rows.set(d,[]);rows.get(d).push(id);}
  const widths=new Map(nodes.map(n=>[n.id,Math.max(260,outgoing(n).length*130)]));
  const textMetrics=new Map(nodes.map(n=>{
    const titleLines=wrapMapText(n.title||'Без названия',widths.get(n.id)-32,12,measureText);
    const titleBottom=48+(titleLines.length-1)*18;
    const linkLines=n.type==='result'&&n.nextSchemeId?wrapMapText('→ '+(schemeNames.get(n.nextSchemeId)||'Схема недоступна'),widths.get(n.id)-32,11,measureText):[];
    return [n.id,{titleLines,linkLines,linkY:titleBottom+24,height:Math.max(MIN_NODE_HEIGHT,titleBottom+20+(linkLines.length?24+(linkLines.length-1)*16:0))}];
  }));
  const labelMetrics=new Map(edges.map(e=>{
    const lines=wrapMapText(e.label||'Ответ',LABEL_WIDTH-16,10,measureText);
    return [e,{lines,height:lines.length*14+12}];
  }));
  const rowWidth=row=>row.reduce((sum,id)=>sum+widths.get(id),0)+Math.max(0,row.length-1)*COLUMN_GAP;
  const contentWidth=Math.max(664,...[...rows.values()].map(rowWidth)),positions=new Map();
  const rowMetrics=new Map();let rowY=PADDING;
  // Sweep down using the parents' answer ports to keep sibling branches together.
  for(const [d,row]of [...rows].sort((a,b)=>a[0]-b[0])){
    const score=id=>{
      const parents=incoming.get(id).filter(e=>positions.has(e.source)&&rank.get(e.source)<d);
      return parents.length?parents.reduce((sum,e)=>{const p=positions.get(e.source);return sum+p.x+p.width*(e.index+.5)/Math.max(1,outgoing(byId.get(e.source)).length);},0)/parents.length:Infinity;
    };
    const scores=new Map(row.map(id=>[id,score(id)]));row.sort((a,b)=>scores.get(a)-scores.get(b));
    let x=PADDING+(contentWidth-rowWidth(row))/2;
    const height=Math.max(...row.map(id=>textMetrics.get(id).height));
    let labelHeight=0;for(const id of row)for(const e of out.get(id))labelHeight=Math.max(labelHeight,labelMetrics.get(e).height);
    const gap=Math.max(GAP,labelHeight+48);
    rowMetrics.set(d,{y:rowY,height,gap});
    for(const id of row){const metrics=textMetrics.get(id);positions.set(id,{x,y:rowY,width:widths.get(id),height:metrics.height,titleLines:metrics.titleLines,linkLines:metrics.linkLines,linkY:metrics.linkY,rank:d});x+=widths.get(id)+COLUMN_GAP;}
    rowY+=height+gap;
  }
  const center=id=>{const p=positions.get(id);return p.x+p.width/2;};
  // Assign ports in spatial order: a leftward branch must leave from the left.
  const sourcePorts=new Map(),targetPorts=new Map();
  for(const n of nodes){
    const exits=out.get(n.id).slice().sort((a,b)=>center(a.target)-center(b.target)||a.index-b.index);
    const entries=incoming.get(n.id).slice().sort((a,b)=>center(a.source)-center(b.source)||a.index-b.index);
    const p=positions.get(n.id);
    exits.forEach((e,i)=>sourcePorts.set(e,p.x+p.width*(i+.5)/exits.length));
    entries.forEach((e,i)=>targetPorts.set(e,p.x+p.width*(i+.5)/entries.length));
  }
  const detours=edges.filter(e=>rank.get(e.target)!==rank.get(e.source)+1);
  const left=[],right=[];
  for(const e of detours)(center(e.source)+center(e.target)<2*PADDING+contentWidth?left:right).push(e);
  const leftMargin=left.length*22,rightMargin=right.length*22,tracks=new Map();
  left.forEach((e,i)=>tracks.set(e,PADDING+leftMargin-16-i*22));right.forEach((e,i)=>tracks.set(e,PADDING+leftMargin+contentWidth+16+i*22));
  for(const p of positions.values())p.x+=leftMargin;
  const routed=edges.map(e=>{
    const a=positions.get(e.source),b=positions.get(e.target),sx=sourcePorts.get(e)+leftMargin,tx=targetPorts.get(e)+leftMargin,sy=a.y+a.height,ty=b.y;
    const row=rowMetrics.get(a.rank),label=labelMetrics.get(e);
    const points=[[sx,sy]],branchY=row.y+row.height+row.gap-32;
    if(b.rank===a.rank+1)points.push([sx,branchY],[tx,branchY],[tx,ty-4]);
    else{
      const side=tracks.get(e);
      points.push([sx,branchY],[side,branchY],[side,ty-22],[tx,ty-22],[tx,ty-4]);
    }
    return {...e,points,labelLines:label.lines,labelWidth:LABEL_WIDTH,labelHeight:label.height,labelX:sx,labelY:sy+12+label.height/2,detour:b.rank!==a.rank+1};
  });
  let height=0;for(const p of positions.values())height=Math.max(height,p.y+p.height+PADDING);
  for(const e of routed){for(const [,y]of e.points)height=Math.max(height,y+PADDING);height=Math.max(height,e.labelY+e.labelHeight/2+PADDING);}
  return {positions,edges:routed,width:contentWidth+PADDING*2+leftMargin+rightMargin,height};
}
export function renderSchemeMap(scheme,{selectedId,esc,schemeNames=new Map()}){
  if(!scheme.nodes.length)return '<p class="footnote">Здесь появится схема.</p>';
  const map=layoutSchemeMap(scheme,{measureText:browserTextMeasure(),schemeNames});
  const edges=map.edges.map(e=>{
    const lines=e.labelLines,height=e.labelHeight,active=e.source===selectedId||e.target===selectedId;
    return '<g class="scheme-map-edge'+(active?' connected':'')+'"><title>'+esc(e.label)+'</title><path d="'+e.points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ')+'" fill="none" stroke="'+(active?'#9679c8':'#bcb0d6')+'" stroke-width="1.7" stroke-linejoin="round" marker-end="url(#custom-arrow)"/><rect x="'+(e.labelX-e.labelWidth/2)+'" y="'+(e.labelY-height/2)+'" width="'+e.labelWidth+'" height="'+height+'" rx="6" fill="#faf8fd"/><text class="scheme-map-label" text-anchor="middle" fill="#857096" font-size="10">'+lines.map((line,i)=>'<tspan x="'+e.labelX+'" y="'+(e.labelY+(i-(lines.length-1)/2)*14+3)+'">'+esc(line)+'</tspan>').join('')+'</text></g>';
  }).join('');
  const blocks=scheme.nodes.map(n=>{
    const p=map.positions.get(n.id);
    return '<g data-builder-action="select-node" data-id="'+esc(n.id)+'" role="button" tabindex="0" aria-label="Изменить: '+esc(n.title)+'" class="builder-map-node"><title>'+esc(n.title)+'</title><rect x="'+p.x+'" y="'+p.y+'" width="'+p.width+'" height="'+p.height+'" rx="12" fill="'+(n.type==='result'?(n.kind==='matched'?'#e8f4ee':'#fff4df'):'#fff')+'" stroke="'+(n.id===selectedId?'#8069cd':'#dcd3e8')+'" stroke-width="'+(n.id===selectedId?2:1.4)+'"/><text x="'+(p.x+15)+'" y="'+(p.y+24)+'" font-size="9" fill="#9b8aaf">'+(n.id===scheme.startId?'СТАРТ · ':'')+(n.type==='result'?'ИТОГ'+(n.nextSchemeId?' · ПЕРЕХОД':''):'ВОПРОС')+'</text><text class="scheme-map-title" font-size="12" fill="#655472">'+p.titleLines.map((line,i)=>'<tspan x="'+(p.x+15)+'" y="'+(p.y+48+i*18)+'">'+esc(line)+'</tspan>').join('')+'</text>'+(p.linkLines.length?'<text class="scheme-map-link" font-size="11" fill="#8069b1">'+p.linkLines.map((line,i)=>'<tspan x="'+(p.x+15)+'" y="'+(p.y+p.linkY+i*16)+'">'+esc(line)+'</tspan>').join('')+'</text>':'')+'</g>';
  }).join('');
  return '<svg width="'+map.width+'" height="'+map.height+'" viewBox="0 0 '+map.width+' '+map.height+'" role="img" aria-label="Карта переходов схемы '+esc(scheme.name)+'"><defs><marker id="custom-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#a68fbe" stroke-width="1.4"/></marker></defs>'+edges+blocks+'</svg>';
}
