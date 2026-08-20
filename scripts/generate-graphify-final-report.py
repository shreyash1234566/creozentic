from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

root = Path('/home/ubuntu/creozentic')
graph_path = Path('/home/ubuntu/.graphify/global-graph.json')
out_dir = root / 'docs' / 'graphify-final'
out_dir.mkdir(parents=True, exist_ok=True)

with graph_path.open(encoding='utf-8') as handle:
    graph = json.load(handle)

nodes = graph.get('nodes', [])
links = graph.get('links', [])

def source(node: dict) -> str:
    value = str(node.get('source_file') or node.get('source') or 'unknown')
    parts = Path(value).parts
    if 'third_party' in parts:
        i = parts.index('third_party')
        return '/'.join(parts[i:i + 2])
    if 'temporal-modules' in parts:
        i = parts.index('temporal-modules')
        return '/'.join(parts[i:i + 2])
    if 'documentation' in parts:
        return 'graphify-batches/documentation'
    if 'application' in parts:
        return 'graphify-batches/application'
    return parts[0] if parts else 'unknown'

node_counts = Counter(source(node) for node in nodes)
node_by_id = {str(node.get('id')): source(node) for node in nodes}
cross_edges = 0
for link in links:
    a = node_by_id.get(str(link.get('source')))
    b = node_by_id.get(str(link.get('target')))
    if a and b and a != b:
        cross_edges += 1

lines = [
    '# Creozentic Graphify Architecture Audit',
    '',
    '> This report was generated from the merged Graphify graph built from the Creozentic application, documentation/configuration corpus, all available worker repositories, and split Temporal modules.',
    '',
    '## Coverage summary',
    '',
    '| Metric | Value |',
    '|---|---:|',
    f'| Graph nodes | {len(nodes):,} |',
    f'| Graph edges | {len(links):,} |',
    f'| Cross-source edges | {cross_edges:,} |',
    f'| Source groups | {len(node_counts):,} |',
    '',
    '## Source groups',
    '',
    '| Source group | Nodes |',
    '|---|---:|',
]
for name, count in sorted(node_counts.items(), key=lambda item: (-item[1], item[0])):
    lines.append(f'| `{name}` | {count:,} |')

lines += [
    '',
    '## Important interpretation',
    '',
    'Graphify maps relationships that exist in source files. A repository appearing in this table means its source was analyzed; it does not automatically mean that Creozentic executes that repository at runtime. Runtime activation must still be confirmed by the source-first status ledger and worker smoke tests.',
    '',
    'The Graphify code parser also reported some files with zero extracted nodes, unsupported file types, and one partially parsed Connectors.tsx file. Those warnings are preserved in the per-batch logs and must not be interpreted as proof that those files do not matter.',
    '',
    '## Artifacts',
    '',
    '- `graph.json`: merged machine-readable graph.',
    '- `graph.html`: merged call-flow visualization.',
    '- `GRAPH_REPORT.md`: this audit report.',
    '- `batch-manifest.json`: per-batch output and warning inventory.',
]

(out_dir / 'GRAPH_REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
(out_dir / 'graph.json').write_text(json.dumps(graph, indent=2) + '\n', encoding='utf-8')
print(f'Wrote {out_dir / "GRAPH_REPORT.md"}')
print(f'Wrote {out_dir / "graph.json"}')
print(f'nodes={len(nodes)} edges={len(links)} cross_source_edges={cross_edges}')
