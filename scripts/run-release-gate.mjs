import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function hasFlag(flagName) {
  return process.argv.includes(flagName);
}

function readArgValue(flagName) {
  const index = process.argv.indexOf(flagName);

  if (index < 0 || index + 1 >= process.argv.length) {
    return '';
  }

  return process.argv[index + 1]?.trim() ?? '';
}

function usage() {
  return `
Usage:
  npm run release:gate:preview
  npm run release:gate:testflight -- --admin-token PREVIEW_ADMIN_TOKEN
  npm run release:gate:production -- --api-base-url https://api.example.com/api

Options:
  --mode <preview|testflight|production>  Release gate mode.
  --api-base-url <url>                    Forwarded to preview:smoke when that step runs.
  --admin-token <token>                   Forwarded to preview:smoke when that step runs.
  --username <value>                      Forwarded to preview:smoke when that step runs.
  --password <value>                      Forwarded to preview:smoke when that step runs.
  --timeout-ms <number>                   Forwarded to preview:smoke. Defaults to 20000 for release gates.
  --require-admin                         Require admin status in preview:smoke.
  --skip-smoke                            Skip preview:smoke even when the mode normally runs it.
  --json                                  Print machine-readable JSON output.
  --help                                  Show this message.
`.trim();
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function fail(message) {
  console.error(`[release-gate] ${message}`);
  process.exit(1);
}

function isJsonMode() {
  return hasFlag('--json');
}

function logStep(message) {
  if (!isJsonMode()) {
    console.log(`[release-gate] ${message}`);
  }
}

function getMode() {
  const mode = readArgValue('--mode') || 'preview';

  if (!['preview', 'testflight', 'production'].includes(mode)) {
    fail('mode must be one of preview, testflight, production.');
  }

  return mode;
}

function getProjectRoot() {
  return resolve(fileURLToPath(new URL('..', import.meta.url)));
}

function getNpmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function normalizePublicBaseUrl(value) {
  const trimmed = String(value ?? '').trim();

  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/\/api\/?$/, '').replace(/\/+$/, '');
}

function resolvePublicBaseUrl(mode) {
  if (mode === 'production') {
    return normalizePublicBaseUrl(
      readArgValue('--api-base-url') || process.env.BACKEND_PUBLIC_BASE_URL || '',
    );
  }

  return normalizePublicBaseUrl(
    readArgValue('--api-base-url') || process.env.EXPO_PUBLIC_API_BASE_URL || process.env.BACKEND_PUBLIC_BASE_URL || '',
  );
}

function createSmokeArgs() {
  const args = ['run', 'preview:smoke', '--'];

  for (const flagName of ['--api-base-url', '--admin-token', '--username', '--password', '--timeout-ms']) {
    const value = readArgValue(flagName);

    if (value) {
      args.push(flagName, value);
    }
  }

  if (!readArgValue('--timeout-ms')) {
    args.push('--timeout-ms', '20000');
  }

  if (hasFlag('--require-admin')) {
    args.push('--require-admin');
  }

  return args;
}

function buildSteps(mode) {
  const smokeArgs = createSmokeArgs();
  const shouldSkipSmoke = hasFlag('--skip-smoke');
  const productionHasSmokeTarget = Boolean(readArgValue('--api-base-url'));
  const publicBaseUrl = resolvePublicBaseUrl(mode);
  const backendEnvOverrides = {
    ...(publicBaseUrl && !process.env.BACKEND_PUBLIC_BASE_URL ? { BACKEND_PUBLIC_BASE_URL: publicBaseUrl } : {}),
    ...(readArgValue('--admin-token') && !process.env.BACKEND_ADMIN_TOKEN ? { BACKEND_ADMIN_TOKEN: readArgValue('--admin-token') } : {}),
  };
  const steps = [];

  if (mode === 'preview') {
    steps.push(
      { key: 'frontendEnv', label: 'frontend preview env', args: ['run', 'release:check:preview'] },
      { key: 'backendEnv', label: 'backend preview env', args: ['run', 'backend:release:check:preview'], envOverrides: backendEnvOverrides },
    );
  }

  if (mode === 'testflight') {
    steps.push(
      { key: 'frontendEnv', label: 'frontend testflight env', args: ['run', 'release:check:testflight'] },
      { key: 'backendEnv', label: 'backend preview env', args: ['run', 'backend:release:check:preview'], envOverrides: backendEnvOverrides },
    );
  }

  if (mode === 'production') {
    steps.push(
      { key: 'frontendEnv', label: 'frontend production env', args: ['run', 'release:check:production'] },
      { key: 'backendEnv', label: 'backend production env', args: ['run', 'backend:release:check:production'], envOverrides: backendEnvOverrides },
    );
  }

  if (!shouldSkipSmoke && (mode !== 'production' || productionHasSmokeTarget)) {
    steps.push({
      key: 'publicSmoke',
      label: mode === 'production' ? 'public api smoke' : 'preview public smoke',
      args: smokeArgs,
      retryCount: 1,
    });
  } else {
    steps.push({
      key: 'publicSmoke',
      label: mode === 'production' ? 'public api smoke' : 'preview public smoke',
      skipped: true,
      skipReason: shouldSkipSmoke
        ? 'skipped by --skip-smoke'
        : 'production mode needs --api-base-url to run smoke',
    });
  }

  return steps;
}

function runStep(projectRoot, step) {
  if (step.skipped) {
    return {
      ...step,
      ok: true,
      skipped: true,
      exitCode: 0,
      durationMs: 0,
      stdout: '',
      stderr: '',
    };
  }

  const maxAttempts = Math.max(1, Number(step.retryCount ?? 0) + 1);
  const env = {
    ...process.env,
    ...(step.envOverrides ?? {}),
  };
  let result = null;
  let durationMs = 0;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;
    const startedAt = Date.now();
    result = spawnSync(getNpmExecutable(), step.args, {
      cwd: projectRoot,
      encoding: 'utf8',
      env,
    });
    durationMs += Date.now() - startedAt;

    if (result.status === 0) {
      break;
    }
  }

  return {
    ...step,
    ok: result?.status === 0,
    skipped: false,
    exitCode: result?.status ?? 1,
    durationMs,
    attempts,
    stdout: String(result?.stdout ?? '').trim(),
    stderr: String(result?.stderr ?? '').trim(),
  };
}

function collectSectionMessages(text, sectionName) {
  if (!text) {
    return [];
  }

  const lines = String(text).split(/\r?\n/);
  const messages = [];
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (inSection) {
        break;
      }
      continue;
    }

    if (/^\[(release-check|backend-release-check)\]/.test(line) && !line.endsWith(`${sectionName}:`)) {
      if (inSection) {
        break;
      }
      continue;
    }

    if (line.endsWith(`${sectionName}:`) && /^\[(release-check|backend-release-check)\]/.test(line)) {
      inSection = true;
      continue;
    }

    if (inSection) {
      if (line.startsWith('- ')) {
        messages.push(line.slice(2).trim());
        continue;
      }

      break;
    }
  }

  return messages;
}

function collectStderrMessages(text) {
  if (!text) {
    return [];
  }

  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('Learn more:'))
    .filter((line) => !line.startsWith('To upgrade, run:'))
    .filter((line) => !line.startsWith('Proceeding with outdated version.'))
    .filter((line) => !line.startsWith('npm warn EBADENGINE'))
    .filter((line) => !line.startsWith('current: {'))
    .filter((line) => !line.startsWith('required: {'))
    .filter((line) => line !== '}');
}

function collectDiagnostics(results) {
  const blockers = [];
  const warnings = [];

  for (const result of results) {
    const stdoutErrors = collectSectionMessages(result.stdout, 'errors');
    const stdoutWarnings = collectSectionMessages(result.stdout, 'warnings');
    const stderrMessages = collectStderrMessages(result.stderr);

    if (!result.ok && !result.skipped && stdoutErrors.length === 0 && stderrMessages.length === 0) {
      blockers.push(`${result.label}: command failed without structured diagnostics`);
    }

    stdoutErrors.forEach((message) => {
      blockers.push(`${result.label}: ${message}`);
    });

    if (!result.ok && !result.skipped) {
      stderrMessages.forEach((message) => {
        blockers.push(`${result.label}: ${message}`);
      });
    } else {
      stdoutWarnings.forEach((message) => {
        warnings.push(`${result.label}: ${message}`);
      });

      stderrMessages.forEach((message) => {
        warnings.push(`${result.label}: ${message}`);
      });
    }

    if (result.skipped && result.skipReason) {
      warnings.push(`${result.label}: ${result.skipReason}`);
    }
  }

  return {
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
  };
}

function printTextSummary(summary) {
  logStep(`mode: ${summary.mode}`);

  for (const step of summary.steps) {
    if (step.skipped) {
      logStep(`${step.label}: SKIPPED (${step.skipReason})`);
      continue;
    }

    const attemptsSuffix = step.attempts > 1 ? `, attempts=${step.attempts}` : '';
    logStep(`${step.label}: ${step.ok ? 'PASS' : 'FAIL'} (${step.durationMs}ms${attemptsSuffix})`);
  }

  logStep(`overall: ${summary.ok ? 'PASS' : 'FAIL'}`);

  if (summary.blockers.length > 0) {
    logStep('blocking issues:');
    summary.blockers.forEach((message) => {
      logStep(`- ${message}`);
    });
  }

  if (summary.warnings.length > 0) {
    logStep('warnings:');
    summary.warnings.forEach((message) => {
      logStep(`- ${message}`);
    });
  }
}

function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(usage());
    return;
  }

  const mode = getMode();
  const projectRoot = getProjectRoot();
  loadEnvFile(resolve(projectRoot, '.env'));
  const steps = buildSteps(mode);
  const results = [];

  for (const step of steps) {
    const result = runStep(projectRoot, step);
    results.push(result);

    if (!result.ok && !result.skipped) {
      break;
    }
  }

  const diagnostics = collectDiagnostics(results);
  const summary = {
    ok: results.every((result) => result.ok),
    mode,
    generatedAt: new Date().toISOString(),
    blockers: diagnostics.blockers,
    warnings: diagnostics.warnings,
    steps: results.map((result) => ({
      key: result.key,
      label: result.label,
      ok: result.ok,
      skipped: result.skipped,
      skipReason: result.skipReason ?? '',
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      attempts: result.attempts ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
    })),
  };

  if (isJsonMode()) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printTextSummary(summary);
  }

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main();
