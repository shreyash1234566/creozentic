from pathlib import Path
from collections import Counter, defaultdict
import json, os

root = Path('/home/ubuntu/creozentic/third_party')
model_ext = {'.safetensors','.ckpt','.pt','.pth','.bin','.onnx','.gguf','.ggml','.pkl','.joblib','.npy','.npz'}
cache_names = {'.git','node_modules','__pycache__','.venv','venv','env','.cache','dist','build','target','.mypy_cache','.pytest_cache','.next'}
model_terms = ('checkpoint','checkpoints','model','models','weights','pretrained','huggingface','hf_cache')
repo_rows=[]
for repo in sorted(p for p in root.iterdir() if p.is_dir()):
    total=0; files=0; ext=Counter(); cats=Counter(); largest=[]; model_files=[]
    for p in repo.rglob('*'):
        if not p.is_file(): continue
        try: size=p.stat().st_size
        except OSError: continue
        files += 1; total += size; ext[p.suffix.lower() or '<no extension>'] += 1
        parts={x.lower() for x in p.parts}
        if any(x in parts for x in cache_names): cats['cache_or_history'] += size
        elif p.suffix.lower() in model_ext or any(term in x.lower() for x in p.parts for term in model_terms):
            cats['model_or_model_named'] += size
            if p.suffix.lower() in model_ext or size >= 50*1024*1024: model_files.append((str(p.relative_to(repo)), size))
        elif any(x in parts for x in ('data','dataset','datasets','assets','examples','sample','samples')): cats['data_or_assets'] += size
        else: cats['source_and_other'] += size
        largest.append((size, str(p.relative_to(repo))))
    largest=sorted(largest, reverse=True)[:20]
    repo_rows.append({'repo':repo.name,'bytes':total,'files':files,'human_bytes':f'{total/1024**3:.2f} GiB','categories':dict(cats),'model_candidates':sorted([{'path':p,'bytes':s,'human_bytes':f'{s/1024**3:.2f} GiB'} for p,s in model_files], key=lambda x:x['bytes'], reverse=True)[:50],'largest_files':[{'path':p,'bytes':s,'human_bytes':f'{s/1024**3:.2f} GiB'} for s,p in largest]})
print(json.dumps({'root':str(root),'repositories':repo_rows}, indent=2))
