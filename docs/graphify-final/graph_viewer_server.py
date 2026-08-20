from __future__ import annotations

import gzip
import json
import mimetypes
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
GRAPH_PATH = ROOT / 'graph.json'
GRAPH_GZ_PATH = ROOT / 'graph.json.gz'
if GRAPH_PATH.exists():
    with GRAPH_PATH.open(encoding='utf-8') as f:
        GRAPH = json.load(f)
else:
    with gzip.open(GRAPH_GZ_PATH, 'rt', encoding='utf-8') as f:
        GRAPH = json.load(f)
NODES = {str(n['id']): n for n in GRAPH.get('nodes', [])}
OUT = defaultdict(list)
IN = defaultdict(list)
for edge in GRAPH.get('links', []):
    OUT[str(edge['source'])].append(edge)
    IN[str(edge['target'])].append(edge)
REPOS = sorted({str(n.get('repo') or 'unknown') for n in NODES.values()})

class Handler(BaseHTTPRequestHandler):
    def json(self, payload, status=200):
        body = json.dumps(payload, separators=(',', ':')).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        if path == '/api/stats':
            cross = 0
            for edge in GRAPH.get('links', []):
                a = NODES.get(str(edge['source']), {}).get('repo')
                b = NODES.get(str(edge['target']), {}).get('repo')
                if a and b and a != b:
                    cross += 1
            return self.json({'nodes': len(NODES), 'edges': len(GRAPH.get('links', [])), 'repos': REPOS, 'crossSourceEdges': cross})
        if path == '/api/overview':
            counts = {repo: {'nodes': 0, 'edges': 0} for repo in REPOS}
            pair_counts = defaultdict(int)
            for node in NODES.values():
                counts.setdefault(node.get('repo') or 'unknown', {'nodes': 0, 'edges': 0})['nodes'] += 1
            for edge in GRAPH.get('links', []):
                a = NODES.get(str(edge['source']), {}).get('repo') or 'unknown'
                b = NODES.get(str(edge['target']), {}).get('repo') or 'unknown'
                counts.setdefault(a, {'nodes': 0, 'edges': 0})['edges'] += 1
                if a != b:
                    pair_counts[tuple(sorted((a, b)))] += 1
            nodes = [{'id': 'repo::' + repo, 'label': repo, 'group': 'repo', 'repo': repo, **counts.get(repo, {'nodes': 0, 'edges': 0})} for repo in sorted(counts)]
            links = [{'from': 'repo::' + a, 'to': 'repo::' + b, 'value': value, 'label': str(value)} for (a, b), value in pair_counts.items()]
            return self.json({'nodes': nodes, 'links': links})
        if path == '/api/repo-graph':
            repo = query.get('repo', [''])[0]
            if repo not in REPOS:
                return self.json({'error': 'unknown repo', 'repos': REPOS}, 404)
            selected = {node_id: node for node_id, node in NODES.items() if node.get('repo') == repo}
            limit = min(max(int(query.get('limit', ['2500'])[0]), 100), 5000)
            chosen_ids = list(selected)[:limit]
            chosen = {node_id: selected[node_id] for node_id in chosen_ids}
            nodes = [{'id': n['id'], 'label': n.get('label') or n['id'], 'group': n.get('file_type') or 'node', 'source_file': n.get('source_file'), 'source_location': n.get('source_location')} for n in chosen.values()]
            links = []
            for edge in GRAPH.get('links', []):
                if str(edge['source']) in chosen and str(edge['target']) in chosen:
                    links.append({'from': edge['source'], 'to': edge['target'], 'label': edge.get('relation', ''), 'value': 1})
                    if len(links) >= 10000:
                        break
            return self.json({'repo': repo, 'nodes': nodes, 'links': links, 'totalNodes': len(selected), 'shownNodes': len(nodes), 'shownEdges': len(links)})
        if path == '/api/search':
            q = query.get('q', [''])[0].lower().strip()
            repo = query.get('repo', [''])[0]
            limit = min(max(int(query.get('limit', ['100'])[0]), 1), 500)
            results = []
            for node in NODES.values():
                if repo and node.get('repo') != repo:
                    continue
                hay = ' '.join(str(node.get(k, '')) for k in ('id','label','repo','source_file','source_location')).lower()
                if q and q not in hay:
                    continue
                results.append({k: node.get(k) for k in ('id','label','repo','source_file','source_location','file_type')})
                if len(results) >= limit:
                    break
            return self.json({'results': results})
        if path.startswith('/api/node/'):
            node_id = unquote(path[len('/api/node/'):])
            node = NODES.get(node_id)
            if not node:
                return self.json({'error': 'node not found'}, 404)
            def edge_view(edge, direction):
                other_id = str(edge['target'] if direction == 'outgoing' else edge['source'])
                other = NODES.get(other_id, {})
                return {'direction': direction, 'relation': edge.get('relation'), 'confidence': edge.get('confidence'), 'source_file': edge.get('source_file'), 'source_location': edge.get('source_location'), 'node': {k: other.get(k) for k in ('id','label','repo','source_file','source_location','file_type')}}
            edges = [edge_view(e, 'outgoing') for e in OUT.get(node_id, [])[:500]] + [edge_view(e, 'incoming') for e in IN.get(node_id, [])[:500]]
            return self.json({'node': node, 'edges': edges, 'outgoing': len(OUT.get(node_id, [])), 'incoming': len(IN.get(node_id, []))})
        if path in ('/', '/graph-api.html'):
            path = '/graph-api.html'
        file_path = (ROOT / path.lstrip('/')).resolve()
        if not str(file_path).startswith(str(ROOT)) or not file_path.is_file():
            self.send_error(404)
            return
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(str(file_path))[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass

if __name__ == '__main__':
    print('Graphify viewer API listening on http://0.0.0.0:8766', flush=True)
    ThreadingHTTPServer(('0.0.0.0', 8766), Handler).serve_forever()
