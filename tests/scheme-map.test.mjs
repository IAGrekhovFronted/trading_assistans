import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutSchemeMap,renderSchemeMap,wrapMapText} from '../scheme-map.mjs';
const result=id=>({id,type:'result',title:id,description:'',kind:'waiting'});
const q=(id,targets)=>({id,type:'question',title:id,hint:'',options:targets.map((next,i)=>({id:id+'_'+i,label:i?'Нет':'Да',next}))});
const scheme=nodes=>({id:'scheme',name:'Map',startId:'start',nodes});
const center=p=>p.x+p.width/2;
const escapes=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function enters(points,r){
  for(let i=1;i<points.length;i++){const [a,b]=[points[i-1],points[i]];
    if(a[0]===b[0]&&a[0]>r.x&&a[0]<r.x+r.width&&Math.max(a[1],b[1])>r.y&&Math.min(a[1],b[1])<r.y+r.height)return true;
    if(a[1]===b[1]&&a[1]>r.y&&a[1]<r.y+r.height&&Math.max(a[0],b[0])>r.x&&Math.min(a[0],b[0])<r.x+r.width)return true;
  }return false;
}
test('simple decisions follow answer order rather than block creation order, removing crossed exits',()=>{
  const s=scheme([q('start',['wave','noTrend']),result('noTrend'),q('wave',['kind','counter']),result('counter'),q('kind',['yes','no']),result('yes'),result('no')]);
  const map=layoutSchemeMap(s);
  assert.ok(center(map.positions.get('wave'))<center(map.positions.get('noTrend')));
  assert.ok(center(map.positions.get('kind'))<center(map.positions.get('counter')));
  for(const source of ['start','wave']){
    const edges=map.edges.filter(e=>e.source===source).sort((a,b)=>center(map.positions.get(a.target))-center(map.positions.get(b.target)));
    assert.ok(edges[0].points[0][0]<edges[1].points[0][0]);
  }
  const reordered=layoutSchemeMap({...s,nodes:s.nodes.slice().reverse()});
  for(const n of s.nodes)assert.deepEqual(reordered.positions.get(n.id),map.positions.get(n.id));
});
test('shared destinations sit below every parent and skip-level edges go around intermediate blocks',()=>{
  const s=scheme([q('start',['mid','done']),q('mid',['last','done']),q('last',['done','done']),result('done')]);
  const map=layoutSchemeMap(s);
  for(const e of map.edges){
    assert.ok(map.positions.get(e.target).rank>map.positions.get(e.source).rank);
    for(const [id,rect]of map.positions)if(id!==e.source&&id!==e.target)assert.equal(enters(e.points,rect),false,'Edge enters '+id);
  }
  assert.equal(map.edges.find(e=>e.source==='start'&&e.target==='done').detour,true);
});
test('multiple answers to the same destination retain distinct labels, exits and entry ports',()=>{
  const s=scheme([q('start',['done','done','done']),result('done')]),map=layoutSchemeMap(s);
  assert.equal(map.edges.length,3);
  assert.equal(new Set(map.edges.map(e=>e.points[0][0])).size,3);
  assert.equal(new Set(map.edges.map(e=>e.points.at(-1)[0])).size,3);
});
test('layout is presentation only and does not reorder or rewrite saved scheme data',()=>{
  const s=scheme([q('start',['second','first']),result('first'),result('second')]),before=structuredClone(s);
  layoutSchemeMap(s);renderSchemeMap(s,{selectedId:'start',esc:escapes});
  assert.deepEqual(s,before);
});
test('incomplete, disconnected and cyclic drafts have finite, bounded maps without missing-target arrows',()=>{
  const s=scheme([q('start',['middle','missing']),q('middle',['start','middle']),result('unused')]);
  const map=layoutSchemeMap(s);assert.equal(map.positions.size,3);assert.equal(map.edges.length,3);
  for(const e of map.edges)for(const [x,y]of e.points){assert.ok(Number.isFinite(x)&&Number.isFinite(y));assert.ok(x>=0&&x<=map.width);assert.ok(y>=0&&y<=map.height);}
  assert.equal(layoutSchemeMap(scheme([])).positions.size,0);
});
test('long chains do not use recursive traversal',()=>{
  const nodes=Array.from({length:300},(_,i)=>q(i?'q'+i:'start',[i<299?'q'+(i+1):'done']));nodes.push(result('done'));
  const map=layoutSchemeMap(scheme(nodes));assert.equal(map.positions.size,301);assert.equal(map.positions.get('done').rank,300);
});
test('SVG escapes labels and names while preserving the full title and selectable node IDs',()=>{
  const s=scheme([q('start',['done']),result('done')]);s.name='<unsafe>';s.nodes[0].title='<img>';s.nodes[0].options[0].label='"><script>';
  const html=renderSchemeMap(s,{selectedId:'start',esc:escapes});
  assert.ok(html.includes('&lt;unsafe>'));assert.ok(html.includes('&lt;script>'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('data-id="start"'));
});

const measuredWidth=(text,size)=>Array.from(text).length*size*.6;
test('complete node and edge text wraps across every required line without ellipses',()=>{
  const s=scheme([q('start',['done','done']),result('done')]);
  s.nodes[0].title='Были признаки окончания локального тренда и подтверждение изменения его структуры перед следующим входом?';
  s.nodes[1].title='Продолжить наблюдение за развитием ситуации у отмеченной зоны сопротивления';
  s.nodes[0].options[0].label='Локальный умеренно-волатильный тренд с последовательными откатами к значимой зоне';
  const map=layoutSchemeMap(s,{measureText:measuredWidth}),node=map.positions.get('start'),edge=map.edges[0];
  assert.equal(node.titleLines.join(' '),s.nodes[0].title);
  assert.equal(edge.labelLines.join(' ').replace(/\s/g,''),s.nodes[0].options[0].label.replace(/\s/g,''));
  assert.ok(node.titleLines.length>2);assert.ok(edge.labelLines.length>2);
  assert.ok(node.height>76);
  assert.ok(node.titleLines.every(line=>measuredWidth(line,12)<=node.width-32));
  assert.ok(edge.labelLines.every(line=>measuredWidth(line,10)<=edge.labelWidth-16));
  const html=renderSchemeMap(s,{selectedId:'start',esc:escapes});
  assert.ok(!html.includes('…'));
  const visibleTitles=[...html.matchAll(/<text class="scheme-map-title"[^>]*>([\s\S]*?)<\/text>/g)].map(m=>m[1].replace(/<[^>]+>/g,'').replace(/\s/g,''));
  assert.equal(visibleTitles[0],s.nodes[0].title.replace(/\s/g,''));
});
test('rows and connectors reserve enough space for tall blocks and long answer labels',()=>{
  const s=scheme([q('start',['middle','done']),q('middle',['done','done']),result('done')]);
  s.nodes[0].title=('Длинное описание условий перед входом ').repeat(12);
  s.nodes[0].options[0].label=('Проверить локальный тренд и дождаться реакции цены ').repeat(6);
  const map=layoutSchemeMap(s,{measureText:measuredWidth});
  for(const p of map.positions.values()){
    assert.ok(p.y+48+(p.titleLines.length-1)*18<p.y+p.height);
    assert.ok(p.y+p.height<=map.height);
  }
  for(const e of map.edges){
    const top=e.labelY-e.labelHeight/2,bottom=top+e.labelHeight,source=map.positions.get(e.source),target=map.positions.get(e.target);
    assert.ok(top>source.y+source.height);assert.ok(bottom<target.y);
    assert.ok(bottom<e.points[1][1]); // The elbow must not cut through its own text.
    for(const [id,p]of map.positions)if(id!==e.source&&id!==e.target)assert.equal(enters(e.points,p),false);
  }
});
test('manual line breaks and long words preserve all characters and fit the available width',()=>{
  const text='Первая строка\nВторая строка\n\nhttps://example.com/'+('длинноеслово').repeat(10)+'🙂';
  const lines=wrapMapText(text,100,12,measuredWidth);
  assert.equal(lines.join('').replace(/\s/g,''),text.replace(/\s/g,''));
  assert.ok(lines.includes(''));assert.ok(lines.every(line=>measuredWidth(line,12)<=100));
  assert.deepEqual(wrapMapText('один\nдва',100,12,measuredWidth),['один','два']);
});
