from pathlib import Path
import gzip, json, re
from collections import Counter, defaultdict
root=Path('/home/ubuntu/creozentic')
final=root/'docs/graphify-final'
raw=final/'graph.json'
source=raw if raw.exists() else final/'graph.json.gz'
with (source.open(encoding='utf-8') if source.suffix=='.json' else gzip.open(source,'rt',encoding='utf-8')) as f: g=json.load(f)
nodes={str(n.get('id')):n for n in g.get('nodes',[])}
links=g.get('links',g.get('edges',[]))
repo=Counter(); types=Counter(); cross=Counter(); terms=Counter()
for n in nodes.values():
    r=n.get('repo') or n.get('source_group') or n.get('group') or 'unknown'; repo[r]+=1
    text=' '.join(str(n.get(k,'')) for k in ('id','label','name','path','file','source')) .lower()
    for t in ('editor','upload','transcript','whisper','scene','opencv','ocr','diar','broll','comfyui','vimax','openshorts','cutscript','funclip','approval','ffmpeg','render','image','video'):
        if t in text: terms[t]+=1
for e in links:
    types[e.get('type') or e.get('label') or e.get('relation') or 'unknown']+=1
    a=nodes.get(str(e.get('source')),{}); b=nodes.get(str(e.get('target')), {})
    ar=a.get('repo') or a.get('source_group') or a.get('group') or 'unknown'; br=b.get('repo') or b.get('source_group') or b.get('group') or 'unknown'
    if ar!=br: cross[tuple(sorted((ar,br)))]+=1
out={'node_count':len(nodes),'edge_count':len(links),'repository_node_counts':repo.most_common(),'edge_type_counts':types.most_common(),'cross_repository_edges':[(list(k),v) for k,v in cross.most_common(100)],'workflow_term_node_counts':terms,'source':str(source)}
(root/'docs/GRAPH_WORKFLOW_AUDIT.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
print(json.dumps(out,indent=2))
