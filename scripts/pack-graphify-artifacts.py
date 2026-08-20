from pathlib import Path
from collections import defaultdict
import gzip, json, shutil
root=Path('/home/ubuntu/creozentic')
final=root/'docs/graphify-final'
raw=final/'graph.json'
if not raw.exists(): raise SystemExit('missing raw graph.json; generate it before packing')
compressed=final/'graph.json.gz'
with raw.open('rb') as source, gzip.open(compressed,'wb',compresslevel=9) as target:
    shutil.copyfileobj(source,target)
with raw.open(encoding='utf-8') as f: graph=json.load(f)
nodes={str(n['id']):n for n in graph.get('nodes',[])}
counts=defaultdict(lambda:{'nodes':0,'edges':0})
pairs=defaultdict(int)
for n in nodes.values(): counts[n.get('repo') or 'unknown']['nodes']+=1
for e in graph.get('links',[]):
    a=nodes.get(str(e['source']),{}).get('repo') or 'unknown'; b=nodes.get(str(e['target']),{}).get('repo') or 'unknown'
    counts[a]['edges']+=1
    if a!=b: pairs[tuple(sorted((a,b)))]+=1
overview={'nodes':[{'id':'repo::'+r,'label':r,'repo':r,**v} for r,v in sorted(counts.items())], 'links':[{'from':'repo::'+a,'to':'repo::'+b,'value':v,'label':str(v)} for (a,b),v in sorted(pairs.items())], 'source_graph_counts':{'nodes':len(nodes),'edges':len(graph.get('links',[]))}}
(final/'graph-overview.json').write_text(json.dumps(overview,indent=2)+'\n',encoding='utf-8')
print('raw_bytes',raw.stat().st_size)
print('compressed_bytes',compressed.stat().st_size)
print('overview_bytes',(final/'graph-overview.json').stat().st_size)
