---
name: graphify
description: Turn any folder of files into a navigable knowledge graph
---

# Workflow: graphify

Follow the graphify skill installed at ~/.agents/skills/graphify/SKILL.md to run the full pipeline.

If no path argument is given, use `.` (current directory).

### ⚠️ Critical Troubleshooting: Obsidian "Community None" Sync Gotcha

**Problem**: After running incremental scans (`graphify update .`), the underlying `graph.json` receives new nodes/communities, but `.graphify_analysis.json` is **not automatically resaved** by the watcher. As a result, subsequent calls to `graphify export obsidian` consume stale community mappings, assigning `#community/Community_None` to all new nodes and excluding them from color queries.

**Solution Flow**: Whenever updating the graph and regenerating the Obsidian vault, ensure the clustering analysis is resynchronized and labels are populated for all communities by running this sequence:

1. **Regenerate `.graphify_analysis.json`** from `graph.json`:
```bash
python3 -c "
import json
from pathlib import Path
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections

raw = json.loads(Path('graphify-out/graph.json').read_text(encoding='utf-8'))
directed = bool(raw.get('directed', False))
G = build_from_json(raw, directed=directed)
communities = cluster(G)
cohesion = score_all(G, communities)
gods = god_nodes(G)
surprises = surprising_connections(G, communities)

analysis = {
    'communities': {str(k): list(v) for k, v in communities.items()},
    'cohesion': {str(k): v for k, v in cohesion.items()},
    'gods': gods,
    'surprises': surprises,
    'tokens': {'input': 0, 'output': 0}
}
Path('graphify-out/.graphify_analysis.json').write_text(json.dumps(analysis, indent=2), encoding='utf-8')
print('Regenerated .graphify_analysis.json with all %d communities!' % len(communities))
"
```

2. **Auto-populate missing labels** in `.graphify_labels.json`:
```bash
python3 -c "
import json
from pathlib import Path
from collections import Counter

analysis = json.loads(Path('graphify-out/.graphify_analysis.json').read_text(encoding='utf-8'))
graph_data = json.loads(Path('graphify-out/graph.json').read_text(encoding='utf-8'))
id_to_node = {n['id']: n for n in graph_data['nodes']}

try:
    existing_labels = json.loads(Path('graphify-out/.graphify_labels.json').read_text(encoding='utf-8'))
except Exception:
    existing_labels = {}

new_labels = {}

for cid_str, members in analysis['communities'].items():
    cid = int(cid_str)
    files = []
    for m in members:
        sf = id_to_node.get(m, {}).get('source_file')
        if sf: files.append(sf)
            
    non_test_files = [f for f in files if '.test.' not in f and '.spec.' not in f and 'test/' not in f]
    target_files = non_test_files if non_test_files else files
    
    if target_files:
        best_file = Counter(target_files).most_common(1)[0][0]
        parts = best_file.split('/')
        context = ''
        if len(parts) > 2:
            if parts[0] == 'apps': context = parts[1].upper()
            elif parts[0] == 'packages': context = f'Pkg {parts[1].title()}'
            else: context = parts[0].title()
                
        name_part = parts[-1].replace('.tsx', '').replace('.ts', '').replace('.js', '').replace('.md', '')
        if name_part == 'index' and len(parts) > 1: name_part = parts[-2]
        name_part = name_part.replace('.', ' ').replace('-', ' ').replace('_', ' ').title()
        
        label = f'{context}: {name_part}'.strip(': ')
        new_labels[cid] = f'{label} (C{cid})'
    else:
        real = [id_to_node.get(m, {}).get('label', m) for m in members if len(id_to_node.get(m, {}).get('label', m)) > 2 and not id_to_node.get(m, {}).get('label', m).startswith('.')]
        if real:
            best = sorted(real, key=len)[0].replace('()', '').title()
            new_labels[cid] = f'Concept: {best} (C{cid})'
        else:
            new_labels[cid] = f'Community {cid}'

for k, v in existing_labels.items():
    if k.isdigit():
        cid = int(k)
        if cid in new_labels and cid <= 46 and not v.startswith('Module '):
            base = v.split(' (C')[0]
            new_labels[cid] = f'{base} (C{cid})'

out_map = {str(k): v for k, v in sorted(new_labels.items(), key=lambda x: int(x[0]))}
Path('graphify-out/.graphify_labels.json').write_text(json.dumps(out_map, indent=2), encoding='utf-8')
"
```

3. **Re-export to Obsidian**:
```bash
graphify export obsidian
```
