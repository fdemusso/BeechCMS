import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  copyFileSync,
  mkdirSync,
  rmdirSync
} from 'node:fs';
import { join, basename } from 'node:path';

const STAGE_DIRS = [
  'stages/00_ideation',
  'stages/00_ideation/output',
  'stages/01_sprint_planning',
  'stages/01_sprint_planning/output',
  'stages/02_execution',
  'stages/02_execution/output',
  'stages/03_review',
  'stages/03_review/output',
  'docs/Sprints'
];

const PLANNING_OUTPUT = 'stages/01_sprint_planning/output';
const BACKLOG_DIR = join(PLANNING_OUTPUT, 'backlog');
const EXECUTION_OUTPUT = 'stages/02_execution/output';
const REVIEW_OUTPUT = 'stages/03_review/output';
const FEATURE_BRIEF = 'stages/00_ideation/output/feature_brief.md';
// Non-plan files that may live at the planning output root
const NON_PLAN_FILES = new Set(['rejections.md']);

function cwdPath(rel) {
  return join(process.cwd(), rel);
}

function listFiles(relDir) {
  const abs = cwdPath(relDir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).filter((f) => statSync(join(abs, f)).isFile());
}

function moveFile(srcAbs, destAbs) {
  copyFileSync(srcAbs, destAbs);
  unlinkSync(srcAbs);
}

function verifyDirs(s) {
  s.start('Verifying that required directories exist...');
  const missing = STAGE_DIRS.filter((d) => !existsSync(cwdPath(d)));
  if (missing.length > 0) {
    s.stop(pc.red('Verification failed!'));
    p.log.error(`Missing required directories:\n${missing.map((d) => ` - ${d}`).join('\n')}`);
    process.exit(1);
  }
  s.stop('All directories verified successfully.');
}

function findPlanFile() {
  const candidates = listFiles(PLANNING_OUTPUT).filter(
    (f) => f.endsWith('.md') && !NON_PLAN_FILES.has(f)
  );
  if (candidates.length === 1) return candidates[0];
  return null; // zero or ambiguous
}

function timestampName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `sprint_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * Archives the current sprint artifacts (plan, execution logs, review report,
 * rejections) into docs/Sprints/<sprintName>/. Never deletes history.
 * Returns the destination folder name.
 */
function archiveSprint(s) {
  const planFile = findPlanFile();
  const sprintName = planFile ? basename(planFile, '.md') : timestampName();
  const destRel = join('docs/Sprints', sprintName);
  mkdirSync(cwdPath(destRel), { recursive: true });

  s.start(`Archiving sprint artifacts to ${destRel}/ ...`);
  let moved = 0;

  // Sprint plan + rejections from planning output root
  for (const file of listFiles(PLANNING_OUTPUT)) {
    moveFile(join(cwdPath(PLANNING_OUTPUT), file), join(cwdPath(destRel), file));
    p.log.step(`Moved ${pc.cyan(join(PLANNING_OUTPUT, file))}`);
    moved++;
  }

  // Execution logs and review report (keep everything: this IS the history)
  for (const [dir, prefix] of [
    [EXECUTION_OUTPUT, ''],
    [REVIEW_OUTPUT, '']
  ]) {
    for (const file of listFiles(dir)) {
      moveFile(join(cwdPath(dir), file), join(cwdPath(destRel), prefix + file));
      p.log.step(`Moved ${pc.cyan(join(dir, file))}`);
      moved++;
    }
  }

  if (moved === 0) {
    s.stop(pc.yellow('No sprint artifacts found to archive.'));
  } else {
    s.stop(`Archived ${moved} file(s) to ${pc.green(destRel + '/')}`);
  }
  return { sprintName, destRel };
}

function cmdNext(s) {
  p.intro(pc.bgCyan(pc.black(' AI Pipeline — Next Sprint ')));
  verifyDirs(s);

  if (!existsSync(cwdPath(join(BACKLOG_DIR, 'ROADMAP.md')))) {
    p.log.warn(
      'No backlog/ROADMAP.md found: this looks like a single-sprint feature. Use `pnpm pipeline reset` to close it instead.'
    );
  }

  archiveSprint(s);

  p.outro(
    pc.green('Sprint archived. Feature brief and ROADMAP kept.\n') +
      pc.dim('   Next step: re-run stage 01_sprint_planning to plan the next roadmap sprint.')
  );
}

function cmdReset(s) {
  p.intro(pc.bgCyan(pc.black(' AI Pipeline — Feature Reset ')));
  verifyDirs(s);

  const { destRel } = archiveSprint(s);

  // Archive the roadmap/backlog (feature is closing)
  s.start('Archiving backlog/ROADMAP...');
  let backlogMoved = 0;
  for (const file of listFiles(BACKLOG_DIR)) {
    moveFile(join(cwdPath(BACKLOG_DIR), file), join(cwdPath(destRel), file));
    p.log.step(`Moved ${pc.cyan(join(BACKLOG_DIR, file))}`);
    backlogMoved++;
  }
  if (existsSync(cwdPath(BACKLOG_DIR)) && listFiles(BACKLOG_DIR).length === 0) {
    try {
      rmdirSync(cwdPath(BACKLOG_DIR));
    } catch {
      /* non-empty or locked: leave it */
    }
  }
  s.stop(backlogMoved > 0 ? `Archived ${backlogMoved} backlog file(s).` : pc.yellow('No backlog to archive.'));

  // Preserve the feature brief in the archive, then empty it
  s.start('Archiving and emptying feature brief...');
  try {
    const briefAbs = cwdPath(FEATURE_BRIEF);
    if (existsSync(briefAbs) && readFileSync(briefAbs, 'utf8').trim().length > 0) {
      copyFileSync(briefAbs, join(cwdPath(destRel), 'feature_brief.md'));
      p.log.step(`Copied ${pc.cyan(FEATURE_BRIEF)} to archive`);
    }
    writeFileSync(briefAbs, '');
    s.stop(`Emptied ${pc.cyan(FEATURE_BRIEF)}`);
  } catch (err) {
    s.stop(pc.red('Failed to archive/empty feature brief.'));
    p.log.error(err.message);
    process.exit(1);
  }

  p.outro(pc.green('Pipeline reset completed. Full sprint history preserved in ' + destRel + '/'));
}

async function main() {
  const command = process.argv.slice(2)[0];
  const s = p.spinner();

  switch (command) {
    case 'reset':
      cmdReset(s);
      break;
    case 'next':
      cmdNext(s);
      break;
    default:
      p.intro(pc.bgCyan(pc.black(' AI Pipeline CLI ')));
      p.note(
        [
          'Usage:',
          '  pnpm pipeline next    Archive the current sprint of a multi-sprint feature',
          '                        (keeps feature_brief + backlog/ROADMAP.md, ready to plan the next sprint)',
          '  pnpm pipeline reset   Close the feature: archive everything (plan, logs, review,',
          '                        roadmap, brief) to docs/Sprints/<sprint>/ and empty the stages'
        ].join('\n'),
        'Help'
      );
      process.exit(command ? 1 : 0);
  }
}

main().catch(console.error);
