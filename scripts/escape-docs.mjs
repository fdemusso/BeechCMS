import fs from 'fs';
import path from 'path';

const docsDir = path.join(process.cwd(), 'docs');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'Sprints' && file !== '.vitepress' && file !== 'api') {
        processDir(fullPath);
      }
    } else if (fullPath.endsWith('.md')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('{{') || content.includes('}}')) {
        // Only escape if not already escaped
        content = content.replace(/(?<!\\)\{\{/g, '\\{\\{');
        content = content.replace(/(?<!\\)\}\}/g, '\\}\\}');
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Escaped braces in ${fullPath}`);
      }
    }
  }
}

processDir(docsDir);
