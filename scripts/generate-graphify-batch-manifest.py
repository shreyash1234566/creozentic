from __future__ import annotations

import json
from pathlib import Path

root = Path('/home/ubuntu/creozentic')
output_root = root / 'docs' / 'graphify-batches' / 'outputs'
final_root = root / 'docs' / 'graphify-final'
final_root.mkdir(parents=True, exist_ok=True)

entries = []
for graph_path in sorted(output_root.glob('**/graphify-out/graph.json')):
    with graph_path.open(encoding='utf-8') as handle:
        graph = json.load(handle)
    rel = graph_path.relative_to(output_root).parts
    batch = '/'.join(rel[:-2])
    log_path = graph_path.parent.parent / 'run.log'
    log = log_path.read_text(encoding='utf-8', errors='replace') if log_path.exists() else ''
    entries.append({
        'batch': batch,
        'status': 'completed',
        'graphPath': str(graph_path.relative_to(root)),
        'nodes': len(graph.get('nodes', [])),
        'edges': len(graph.get('links', [])),
        'warnings': [line.strip() for line in log.splitlines() if 'warning:' in line.lower()],
    })

all_repos = ['openshorts','cutscript','videoclipper','ai-broll','funclip','ave','pixeltable','vimax','videoagent','videodb-director','comfyui','temporal','openchatcut','openmontage','twick','ffmpeg']
covered = {entry['batch'].split('/')[-1] for entry in entries}
manifest = {
    'project': 'creozentic',
    'graphifyVersion': '0.9.47',
    'globalGraph': '/home/ubuntu/.graphify/global-graph.json',
    'finalArtifacts': {
        'graph': 'docs/graphify-final/graph.json',
        'html': 'docs/graphify-final/graph.html',
        'report': 'docs/graphify-final/GRAPH_REPORT.md',
    },
    'repositoryCoverage': [
        {'repository': repo, 'coveredByBatch': repo in covered or repo == 'ffmpeg', 'note': 'FFmpeg is a system binary and is represented by application/configuration references, not a cloned source repository.' if repo == 'ffmpeg' else ''}
        for repo in all_repos
    ],
    'batches': entries,
    'knownUnparsedData': [
        'Graphify code-only mode does not parse every binary/media/model artifact.',
        'Some JSON/configuration files returned zero AST nodes and are listed in batch logs.',
        'Proto files in Temporal were preserved in the source corpus but Graphify reported them as unsupported in this installation.',
        'src/views/Connectors.tsx was partially parsed because Graphify reported a syntax error at line 388.',
        'Documentation semantic extraction used the configured OpenAI backend; six documentation/config files returned no semantic nodes and are listed in the documentation batch warning output.',
    ],
}
(final_root / 'batch-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'batches': len(entries), 'coveredRepositories': sum(1 for item in manifest['repositoryCoverage'] if item['coveredByBatch'])}, indent=2))
