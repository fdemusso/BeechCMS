import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync, readdirSync, writeFileSync, unlinkSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command !== 'reset') {
    p.intro(pc.bgCyan(pc.black(' AI Pipeline CLI ')));
    p.note(
      `Usage: pnpm pipeline reset\n\nResets the custom AI pipeline stages.`,
      'Help'
    );
    process.exit(command ? 1 : 0);
  }

  p.intro(pc.bgCyan(pc.black(' AI Pipeline Reset ')));

  // 1. Verify directories
  const s = p.spinner();
  s.start('Verifying that required directories exist...');

  const directories = [
    'stages/00_ideation',
    'stages/00_ideation/output',
    'stages/01_sprint_planning',
    'stages/01_sprint_planning/output',
    'stages/02_execution',
    'stages/02_execution/output',
    'docs/Sprints'
  ];

  const missingDirs = [];
  for (const dir of directories) {
    const fullPath = join(process.cwd(), dir);
    if (!existsSync(fullPath)) {
      missingDirs.push(dir);
    }
  }

  if (missingDirs.length > 0) {
    s.stop(pc.red('Verification failed!'));
    p.log.error(`Missing required directories:\n${missingDirs.map(d => ` - ${d}`).join('\n')}`);
    process.exit(1);
  }
  s.stop('All directories verified successfully.');

  // 2. Empty feature brief
  const featureBriefPath = join(process.cwd(), 'stages/00_ideation/output/feature_brief.md');
  s.start('Emptying feature brief file...');
  try {
    writeFileSync(featureBriefPath, '');
    s.stop(`Emptied ${pc.cyan('stages/00_ideation/output/feature_brief.md')}`);
  } catch (err) {
    s.stop(pc.red('Failed to empty feature brief file.'));
    p.log.error(err.message);
    process.exit(1);
  }

  // 3. Move files from stages/01_sprint_planning/output to docs/Sprints
  const planningOutputDir = join(process.cwd(), 'stages/01_sprint_planning/output');
  const sprintsDir = join(process.cwd(), 'docs/Sprints');
  s.start('Moving sprint plan file(s) to docs/Sprints...');
  try {
    const files = readdirSync(planningOutputDir);
    let movedCount = 0;
    for (const file of files) {
      const srcPath = join(planningOutputDir, file);
      const destPath = join(sprintsDir, file);
      // Move file by copying and unlinking (safe across mounts/devices)
      copyFileSync(srcPath, destPath);
      unlinkSync(srcPath);
      p.log.step(`Moved ${pc.cyan(file)} to ${pc.green('docs/Sprints/')}`);
      movedCount++;
    }
    if (movedCount === 0) {
      s.stop(pc.yellow('No files found in stages/01_sprint_planning/output to move.'));
    } else {
      s.stop(`Moved ${movedCount} file(s) successfully.`);
    }
  } catch (err) {
    s.stop(pc.red('Failed to move files.'));
    p.log.error(err.message);
    process.exit(1);
  }

  // 4. Delete execution log if present in stages/02_execution/output
  const executionOutputDir = join(process.cwd(), 'stages/02_execution/output');
  s.start('Checking for execution logs to delete...');
  try {
    let deletedCount = 0;
    if (existsSync(executionOutputDir)) {
      const files = readdirSync(executionOutputDir);
      for (const file of files) {
        if (file === 'execution_log.md' || file.endsWith('_log.md') || file.endsWith('.log')) {
          const filePath = join(executionOutputDir, file);
          unlinkSync(filePath);
          p.log.step(`Deleted log file: ${pc.red(file)}`);
          deletedCount++;
        }
      }
    }
    if (deletedCount === 0) {
      s.stop(pc.yellow('No log files found to delete in stages/02_execution/output.'));
    } else {
      s.stop(`Deleted ${deletedCount} log file(s) successfully.`);
    }
  } catch (err) {
    s.stop(pc.red('Failed to delete log file(s).'));
    p.log.error(err.message);
    process.exit(1);
  }

  p.outro(pc.green('Pipeline reset completed successfully!'));
}

main().catch(console.error);
