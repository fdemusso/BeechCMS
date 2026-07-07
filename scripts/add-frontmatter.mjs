import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const docsFrontmatter = {
  // User & Builder Guide
  'docs/guide.md': {
    title: 'Building a Website',
    group: 'User & Builder Guide',
    category: 'Getting Started',
  },
  'docs/frontend-guide.md': {
    title: 'Frontend Integration Guide',
    group: 'User & Builder Guide',
    category: 'Frontend & APIs',
  },
  'docs/api-reference.md': {
    title: 'Core API Reference',
    group: 'User & Builder Guide',
    category: 'Frontend & APIs',
  },
  'docs/custom-widgets.md': {
    title: 'Creating Custom Widgets',
    group: 'User & Builder Guide',
    category: 'Extending',
  },
  'docs/automations.md': {
    title: 'Automations Engine',
    group: 'User & Builder Guide',
    category: 'Features',
  },
  'docs/email-module.md': {
    title: 'Email Module',
    group: 'User & Builder Guide',
    category: 'Features',
  },

  // Developer Guide
  'docs/development.md': {
    title: 'Development Setup',
    group: 'Developer Guide (Internals)',
    category: 'Setup',
  },
  'docs/architecture.md': {
    title: 'Architecture Overview',
    group: 'Developer Guide (Internals)',
    category: 'Core Concepts',
  },
  'docs/SYSTEM_MAP.md': {
    title: 'System Map',
    group: 'Developer Guide (Internals)',
    category: 'Core Concepts',
  },
  'docs/vertical-slice.md': {
    title: 'Creating a Vertical Slice',
    group: 'Developer Guide (Internals)',
    category: 'Development Guides',
  },
  'docs/background-queues.md': {
    title: 'Background Queues',
    group: 'Developer Guide (Internals)',
    category: 'Internals',
  },
  'docs/observability-and-notifications.md': {
    title: 'Observability & Notifications',
    group: 'Developer Guide (Internals)',
    category: 'Internals',
  },
  'docs/release.md': {
    title: 'Release Process',
    group: 'Developer Guide (Internals)',
    category: 'Operations',
  },
};

for (const [filePath, metadata] of Object.entries(docsFrontmatter)) {
  const fullPath = path.join(rootDir, filePath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`File not found: ${fullPath}`);
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  
  // Skip if it already has frontmatter
  if (content.startsWith('---')) {
    console.log(`Skipping ${filePath} - already has frontmatter`);
    continue;
  }

  const frontmatter = `---
title: ${metadata.title}
group: ${metadata.group}
category: ${metadata.category}
---

`;

  fs.writeFileSync(fullPath, frontmatter + content);
  console.log(`Added frontmatter to ${filePath}`);
}
