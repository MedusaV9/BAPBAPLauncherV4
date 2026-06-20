/**
 * Unified Playwright verification runner.
 * Executes all rebalance verification suites in sequence,
 * collects results, and produces a summary report.
 */

import { spawn, execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const TIMEOUT_MS = 240_000; // 240s per suite
const HARNESS_PORT = 4174;

const SUITES = [
  { script: 'playwright-rebalance-polish-verify.mjs', name: 'Polish Verify' },
  { script: 'playwright-responsive-verify.mjs', name: 'Responsive Verify' },
  { script: 'playwright-animation-verify.mjs', name: 'Animation Verify' },
  { script: 'playwright-rebalance-color-audit.mjs', name: 'Color Audit' },
  { script: 'playwright-a11y-verify.mjs', name: 'Accessibility' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function killOrphanedProcessesOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const pids = new Set(
        out
          .split('\n')
          .map((line) => line.trim().split(/\s+/).pop())
          .filter(Boolean)
      );
      for (const pid of pids) {
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
      }
    } else {
      execSync(`lsof -ti :${port} | xargs -r kill -9`, { stdio: 'ignore' });
    }
  } catch {
    // Nothing listening — that's fine
  }
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function runSuite(script) {
  const scriptPath = resolve(__dirname, script);
  return new Promise((resolveP) => {
    const start = Date.now();
    let stdout = '';
    let stderr = '';
    let killed = false;

    const child = spawn('node', [scriptPath], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, TIMEOUT_MS);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('exit', (code) => {
      clearTimeout(timer);
      const duration = Date.now() - start;
      let status;
      if (killed) {
        status = 'TIMEOUT';
      } else if (code === 0) {
        status = 'PASS';
      } else if (code === 2) {
        // Convention: exit 2 = warnings only (non-critical)
        status = 'WARN';
      } else {
        status = 'FAIL';
      }
      resolveP({ status, duration, stdout, stderr, code });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const duration = Date.now() - start;
      resolveP({ status: 'FAIL', duration, stdout, stderr: err.message, code: 1 });
    });
  });
}

// ─── Summary Table ──────────────────────────────────────────────────────────

function printSummary(results) {
  const nameCol = 25;
  const statusCol = 10;
  const durCol = 10;

  const icons = { PASS: '✓', FAIL: '✗', WARN: '⚠', TIMEOUT: '⏱' };
  const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));

  const hLine = `┌${'─'.repeat(nameCol)}┬${'─'.repeat(statusCol)}┬${'─'.repeat(durCol)}┐`;
  const mLine = `├${'─'.repeat(nameCol)}┼${'─'.repeat(statusCol)}┼${'─'.repeat(durCol)}┤`;
  const bLine = `└${'─'.repeat(nameCol)}┴${'─'.repeat(statusCol)}┴${'─'.repeat(durCol)}┘`;

  console.log('');
  console.log(hLine);
  console.log(`│${pad(' Suite', nameCol)}│${pad(' Status', statusCol)}│${pad(' Duration', durCol)}│`);
  console.log(mLine);

  for (const r of results) {
    const icon = icons[r.status] || '?';
    const statusStr = ` ${icon} ${r.status}`;
    const durStr = ` ${formatDuration(r.duration)}`;
    console.log(`│${pad(` ${r.name}`, nameCol)}│${pad(statusStr, statusCol)}│${pad(durStr, durCol)}│`);
  }

  console.log(bLine);
  console.log('');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Playwright Full Verification Suite        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  const results = [];

  for (const suite of SUITES) {
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`▶ Running: ${suite.name}`);
    console.log(`  Script:  scripts/${suite.script}`);
    console.log('═'.repeat(50));

    // Kill orphaned processes before each suite
    killOrphanedProcessesOnPort(HARNESS_PORT);

    const result = await runSuite(suite.script);
    results.push({ name: suite.name, script: suite.script, ...result });

    if (result.status === 'PASS') {
      console.log(`  ✓ ${suite.name} passed (${formatDuration(result.duration)})`);
    } else if (result.status === 'WARN') {
      console.log(`  ⚠ ${suite.name} completed with warnings (${formatDuration(result.duration)})`);
    } else if (result.status === 'TIMEOUT') {
      console.log(`  ⏱ ${suite.name} TIMED OUT after ${formatDuration(TIMEOUT_MS)}`);
      if (result.stdout) {
        console.log('  ── stdout ──');
        console.log(result.stdout.split('\n').slice(-15).map(l => `    ${l}`).join('\n'));
      }
      if (result.stderr) {
        console.log('  ── stderr ──');
        console.log(result.stderr.split('\n').slice(-15).map(l => `    ${l}`).join('\n'));
      }
    } else {
      console.log(`  ✗ ${suite.name} FAILED (exit ${result.code}, ${formatDuration(result.duration)})`);
      if (result.stdout) {
        console.log('  ── stdout ──');
        console.log(result.stdout.split('\n').slice(-15).map(l => `    ${l}`).join('\n'));
      }
      if (result.stderr) {
        console.log('  ── stderr ──');
        console.log(result.stderr.split('\n').slice(-15).map(l => `    ${l}`).join('\n'));
      }
    }
  }

  // Kill any leftover processes
  killOrphanedProcessesOnPort(HARNESS_PORT);

  // Print summary
  printSummary(results);

  // Save report
  const outputDir = resolve(ROOT, 'output', 'playwright');
  mkdirSync(outputDir, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
    suites: results.map(({ name, script, status, duration, code }) => ({
      name,
      script,
      status,
      duration,
      exitCode: code,
    })),
    overall: results.every((r) => r.status === 'PASS' || r.status === 'WARN') ? 'PASS' : 'FAIL',
  };

  const reportPath = resolve(outputDir, 'full-verify-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report saved: ${reportPath}`);

  // Exit code
  const hasCriticalFailure = results.some((r) => r.status === 'FAIL' || r.status === 'TIMEOUT');
  if (hasCriticalFailure) {
    console.log('\n✗ Full verification FAILED — see failures above.');
    process.exit(1);
  } else {
    console.log('\n✓ All verification suites passed.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error in full-verify runner:', err);
  process.exit(1);
});
