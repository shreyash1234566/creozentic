from pathlib import Path
import re
html = Path('/home/ubuntu/creozentic/docs/graphify-final/graph-visual.html').read_text(encoding='utf-8')
scripts = re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>', html, flags=re.S)
Path('/home/ubuntu/creozentic/docs/graphify-final/graph-visual-script.js').write_text('\n'.join(scripts[1:]), encoding='utf-8')
print('scripts', len(scripts), 'extracted', len(scripts[1:]))
