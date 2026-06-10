import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const cacheDir = path.join(rootDir, '.react-doctor', 'cache');
const scratchDir = path.join(rootDir, 'scratch');

// Ensure directories exist
fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(scratchDir, { recursive: true });

function runCmd(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...options });
  } catch (error) {
    return { error, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

async function fetchRulePrompt(plugin, rule) {
  const cachePath = path.join(cacheDir, plugin, `${rule}.md`);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf8');
  }

  const url = `https://www.react.doctor/prompts/rules/${plugin}/${rule}.md`;
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const text = await res.text();
    fs.writeFileSync(cachePath, text, 'utf8');
    return text;
  } catch (err) {
    // Return empty prompt on network issues or 404
    return '';
  }
}

// Parse command line arguments
const isFull = process.argv.includes('--full');
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const scopeFlag = isFull ? '' : '--diff';

console.log(`🚀 Avvio scansione React Doctor (${isFull ? 'Tutta la codebase' : 'Solo file modificati'})${isDryRun ? ' [MODALITÀ DRY-RUN]' : ''}...`);

const scanResult = runCmd(`npx react-doctor@latest --json ${scopeFlag}`);
let diagnostics = [];
let scanObj = null;

if (typeof scanResult === 'object' && scanResult.error) {
  // react-doctor returns a non-zero exit code if it finds issues; parse stdout anyway
  try {
    scanObj = JSON.parse(scanResult.stdout);
  } catch (e) {
    console.error('❌ Errore durante l\'esecuzione di react-doctor:', scanResult.stderr || scanResult.error.message);
    process.exit(1);
  }
} else {
  try {
    scanObj = JSON.parse(scanResult);
  } catch (e) {
    console.error('❌ Output JSON non valido da react-doctor:', scanResult);
    process.exit(1);
  }
}

if (scanObj) {
  diagnostics = scanObj.diagnostics || (Array.isArray(scanObj) ? scanObj : []);
}

if (!diagnostics || diagnostics.length === 0) {
  console.log('✅ Nessun problema rilevato da React Doctor! La codebase è pulita.');
  process.exit(0);
}

console.log(`🔍 Trovati ${diagnostics.length} problemi. Filtro dei falsi positivi...`);

// Filter false positives using .react-doctor/false-positives.md
const fpFile = path.join(rootDir, '.react-doctor', 'false-positives.md');
let fpContent = '';
if (fs.existsSync(fpFile)) {
  fpContent = fs.readFileSync(fpFile, 'utf8');
}

const activeDiagnostics = diagnostics.filter(d => {
  if (fpContent) {
    // Simple checks to ignore paths or rules listed in false-positives markdown
    if (fpContent.includes(d.rule) || fpContent.includes(d.filePath)) {
      console.log(`   🚫 Escluso falso positivo su ${d.filePath} (${d.rule})`);
      return false;
    }
  }
  return true;
});

if (activeDiagnostics.length === 0) {
  console.log('✅ Tutti i problemi trovati sono stati esclusi come falsi positivi.');
  process.exit(0);
}

// Group by file
const filesMap = {};
for (const d of activeDiagnostics) {
  if (!filesMap[d.filePath]) {
    filesMap[d.filePath] = [];
  }
  filesMap[d.filePath].push(d);
}

console.log(`📦 Trovati problemi da risolvere in ${Object.keys(filesMap).length} file.`);

for (const [filePath, fileDiag] of Object.entries(filesMap)) {
  console.log(`\n--------------------------------------------------`);
  console.log(`🛠️  Elaborazione file: ${filePath}`);
  console.log(`--------------------------------------------------`);

  const errors = fileDiag.filter(d => d.severity === 'error');
  const warnings = fileDiag.filter(d => d.severity === 'warning');
  console.log(`   - Errori: ${errors.length}, Warning: ${warnings.length}`);

  // Fetch instructions for rules
  const rulesInstructions = [];
  const uniqueRules = [...new Set(fileDiag.map(d => `${d.plugin}/${d.rule}`))];
  
  for (const ruleKey of uniqueRules) {
    const [plugin, ruleName] = ruleKey.split('/');
    const prompt = await fetchRulePrompt(plugin, ruleName);
    if (prompt) {
      rulesInstructions.push(`### Regola: ${ruleKey}\n${prompt}`);
    }
  }
  const diagDetails = fileDiag.map(d => `- Linea ${d.line}, Colonna ${d.column}: ${d.message} [Regola: ${d.plugin}/${d.rule}, Gravità: ${d.severity}]`).join('\n');
  const scratchPromptPath = path.join(scratchDir, 'claude_doctor_prompt.txt');

  const detailedInstructions = `Sei un assistente AI. Il tuo compito è risolvere i problemi di React Doctor segnalati per il file:
Percorso: ${filePath}

Problemi rilevati nel file:
${diagDetails}

Istruzioni di fix delle regole:
${rulesInstructions.join('\n\n')}

Task:
1. Leggi il file '${filePath}' con i tuoi strumenti.
2. Se devi capire come questo file si relaziona ad altri o trovare simboli collegati, usa lo strumento graphify (es. tramite 'graphify path' o 'graphify query') per navigare la codebase senza fare letture a vuoto o spiegazioni prolisse.
3. Applica le correzioni consigliate per i problemi elencati sopra modificando il file.
4. Fai SOLO le modifiche strettamente necessarie a sanare i diagnostici di React Doctor. Mantieni intatto tutto il resto del codice, commenti ed esportazioni.
5. Esegui la build del progetto ('npm run build') per assicurarti che tutto compili. Se riscontri errori di compilazione TypeScript o test derivanti dalle tue modifiche, correggili (anche in altri file se necessario per far compilare il tutto).
6. Se la build passa con successo, esegui il commit delle modifiche con un messaggio chiaro, ad esempio: git commit -am "chore(doctor): risolto ${path.basename(filePath)}"
7. Se la build continua a fallire o le modifiche compromettono la stabilità e non riesci a risolverle, esegui il rollback delle modifiche in sospeso con 'git checkout --' (o ripristina lo stato originale).
8. Evita spiegoni teorici o lunghi riassunti. Esegui la modifica e scrivi solo un riassunto telegrafico di cosa hai cambiato.
`;

  if (isDryRun) {
    console.log(`🔍 [DRY RUN] Avrei chiamato Claude Code CLI per questo file con ${fileDiag.length} diagnostici.`);
    console.log(`    - Prompt di fix pianificato in: scratch/claude_doctor_prompt_dryrun.txt`);
    const dryRunPromptPath = path.join(scratchDir, 'claude_doctor_prompt_dryrun.txt');
    fs.writeFileSync(dryRunPromptPath, detailedInstructions, 'utf8');
    continue;
  }

  fs.writeFileSync(scratchPromptPath, detailedInstructions, 'utf8');

  console.log(`🤖 Chiamo Claude Code CLI per risolvere i problemi di questo file...`);
  
  // Invoke claude using the scratch file to avoid escape characters bugs in Windows shells
  const claudeResult = runCmd(`claude --permission-mode acceptEdits --print "Esegui le istruzioni descritte nel file scratch/claude_doctor_prompt.txt"`);

  if (typeof claudeResult === 'object' && claudeResult.error) {
    console.error(`❌ Claude Code ha riscontrato un errore:`, claudeResult.stderr || claudeResult.error.message);
  } else {
    console.log(`📝 Output Claude Code:`);
    console.log(claudeResult.trim());
  }

  // Check git status to see if changes are committed, reverted, or still pending
  const gitStatus = runCmd(`git status --porcelain "${filePath}"`).trim();
  const lastCommitMsg = runCmd(`git log -1 --pretty=format:%s`).trim();
  
  if (!gitStatus) {
    // Git is clean for this file (either committed by Claude or reverted)
    if (lastCommitMsg.toLowerCase().includes('doctor') || lastCommitMsg.toLowerCase().includes(path.basename(filePath).toLowerCase())) {
      console.log(`✅ Successo! Modifiche compilate e committate da Claude con messaggio: "${lastCommitMsg}"`);
    } else {
      console.log(`⚠️  Il file è pulito ma non è stato rilevato un commit specifico del doctor (potrebbe essere stato annullato/revertato da Claude).`);
    }
  } else {
    // The file is still modified (Claude did edits but didn't commit, or couldn't fix build and left it dirty)
    console.log(`🔎 Rilevate modifiche non committate. Eseguo verifica build finale (npm run build)...`);
    const buildCheck = runCmd(`npm run build`);
    
    if (typeof buildCheck === 'object' && buildCheck.error) {
      console.log(`❌ La compilazione è fallita e Claude non l'ha ripristinata. Eseguo rollback di sicurezza su ${filePath}...`);
      runCmd(`git checkout -- "${filePath}"`);
      console.log(`✅ File ${filePath} ripristinato allo stato originale.`);
    } else {
      console.log(`✅ La build è riuscita! Le modifiche per ${filePath} sono valide ma non committate. Eseguo il commit ora...`);
      const commitMsg = `chore(doctor): risolti errori react-doctor in ${path.basename(filePath)}`;
      runCmd(`git add "${filePath}" && git commit -m "${commitMsg}"`);
      console.log(`✅ Committato con messaggio: "${commitMsg}"`);
    }
  }
}

// Clean up scratch file
try {
  const scratchPromptPath = path.join(scratchDir, 'claude_doctor_prompt.txt');
  if (fs.existsSync(scratchPromptPath)) {
    fs.unlinkSync(scratchPromptPath);
  }
} catch (e) {}

console.log(`\n🎉 Processo di auto-triage completato!`);
