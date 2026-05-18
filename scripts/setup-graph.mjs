import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  p.intro(pc.bgCyan(pc.black(' Graphify Automation Setup ')));

  const venvPath = join(process.cwd(), 'venv');
  const pythonPath = process.platform === 'win32' 
    ? join(venvPath, 'Scripts', 'python.exe') 
    : join(venvPath, 'bin', 'python');
  const graphifyPath = process.platform === 'win32' 
    ? join(venvPath, 'Scripts', 'graphify.exe') 
    : join(venvPath, 'bin', 'graphify');

  // 1. Check/Create VENV
  if (!existsSync(venvPath)) {
    const s = p.spinner();
    s.start('Creating virtual environment (venv)...');
    try {
      execSync('python -m venv venv');
      s.stop('Virtual environment created');
    } catch (e) {
      s.stop('Failed to create venv. Make sure Python is installed and accessible via "python" command.');
      process.exit(1);
    }
  }

  // 2. Install Graphify
  const s = p.spinner();
  s.start('Checking/Installing Graphify (graphifyy)...');
  try {
    // We use the package name found in pip list: graphifyy
    execSync(`"${pythonPath}" -m pip install graphifyy --upgrade`);
    s.stop('Graphify is ready');
  } catch (e) {
    s.stop('Failed to install Graphify');
    console.error(e);
    process.exit(1);
  }

  // 3. Install Hooks
  s.start('Installing Git Hooks...');
  try {
    // Run hook install via the venv executable
    execSync(`"${graphifyPath}" hook install`);
    s.stop('Git Hooks installed successfully (post-commit, post-checkout)');
  } catch (e) {
    s.stop('Failed to install Git Hooks. Make sure you are in a Git repository.');
    process.exit(1);
  }

  p.note(
    'Graphify aggiornerà ora automaticamente il tuo grafo ad ogni commit o cambio di branch.\nNon devi fare nulla, lavora normalmente!', 
    'Automazione Invisibile Attiva'
  );
  p.outro(pc.green('Setup completato con successo!'));
}

main().catch(console.error);
