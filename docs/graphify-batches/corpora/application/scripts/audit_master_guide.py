from __future__ import annotations
import json, re
from pathlib import Path

ROOT = Path('/home/ubuntu/creozentic')
GUIDE = Path('/home/ubuntu/upload/MASTER_GUIDE.md')
EXCLUDE = {'node_modules', '.git', '.next', '.vendor'}
TEXT_EXTS = {'.ts','.tsx','.js','.mjs','.json','.md','.prisma','.sql','.yaml','.yml','.toml','.tf','.py','.sh','.css'}

files = []
for p in ROOT.rglob('*'):
    if not p.is_file() or any(part in EXCLUDE for part in p.parts) or p.suffix.lower() not in TEXT_EXTS:
        continue
    try:
        text = p.read_text(errors='ignore')
    except Exception:
        continue
    files.append((str(p.relative_to(ROOT)), text))

head_re = re.compile(r'^(#{1,3})\s+((?:\d+(?:\.\d+)?|10A|10B)(?:\.|\s|$).*)$', re.M)
sections = []
for m in head_re.finditer(GUIDE.read_text(errors='ignore')):
    raw = m.group(2).strip()
    num = raw.split()[0].rstrip('.')
    title = raw[len(raw.split()[0]):].strip(' .—–-')
    sections.append({'number': num, 'title': title, 'line': GUIDE.read_text(errors='ignore')[:m.start()].count('\n')+1})

# deduplicate headings by number, preserving the first numbered section heading.
seen = set(); unique=[]
for s in sections:
    if s['number'] not in seen:
        seen.add(s['number']); unique.append(s)
sections=unique

stop = {'the','and','for','with','from','into','that','this','must','only','use','your','section','architecture','system','rules','model','implementation','required','initial','production','editor','video','ai','content','platform','data','api','of','to','a','an','in','on','is','as','by','or','at','be','it','all','every','where','how','why','phase','first','second','third','fourth','fifth','sixth'}

def tokens(title):
    vals = re.findall(r'[A-Za-z][A-Za-z0-9_-]{3,}', title.lower())
    return [v for v in vals if v not in stop]

def evidence_for(title):
    ts=tokens(title)
    hits=[]
    for rel,text in files:
        low=text.lower()
        score=sum(1 for t in ts if t in low)
        if score:
            hits.append({'file':rel,'score':score})
    return sorted(hits,key=lambda x:(-x['score'],x['file']))[:12]

for s in sections:
    s['tokens']=tokens(s['title'])
    s['evidence']=evidence_for(s['title'])

out=ROOT/'audit_master_guide_raw.json'
out.write_text(json.dumps({'guide':str(GUIDE),'section_count':len(sections),'sections':sections},indent=2))
print(f'numbered_sections={len(sections)}')
for s in sections:
    print(f"{s['number']:>5} | {s['title'][:64]:64} | {', '.join(x['file'] for x in s['evidence'][:4])}")
