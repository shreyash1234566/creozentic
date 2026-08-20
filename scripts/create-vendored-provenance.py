from pathlib import Path
import json, subprocess
root = Path('/home/ubuntu/creozentic')
rows=[]
for repo in sorted((root/'third_party').iterdir()):
    if not repo.is_dir(): continue
    def run(args):
        try: return subprocess.check_output(args, cwd=repo, stderr=subprocess.DEVNULL, text=True).strip()
        except Exception: return None
    rows.append({'directory':repo.name,'origin':run(['git','config','--get','remote.origin.url']),'commit':run(['git','rev-parse','HEAD']),'source_path':str(repo.relative_to(root))})
out={'generated_from':'third_party checkout before vendoring cleanup','repositories':rows,'note':'FFmpeg is the sixteenth ledger capability but is a system dependency, not a third_party repository.'}
(root/'docs').mkdir(exist_ok=True)
(root/'docs/VENDORED_REPOSITORY_PROVENANCE.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
print(json.dumps(out,indent=2))
