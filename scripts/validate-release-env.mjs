import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const appJson = require('../app.json');
const {
  DEFAULT_EAS_PROJECT_ID,
  formatReleaseValidationReport,
  validateReleaseEnvironment,
} = require('../release-environment.cjs');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const fileContents = readFileSync(filePath, 'utf8');
  const lines = fileContents.split(/\r?\n/);

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

function readArgValue(flagName) {
  const index = process.argv.indexOf(flagName);

  if (index < 0 || index + 1 >= process.argv.length) {
    return '';
  }

  return process.argv[index + 1] ?? '';
}

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const envFile = resolve(projectRoot, readArgValue('--env-file') || '.env');
const variantOverride = readArgValue('--variant');

loadEnvFile(envFile);

if (variantOverride) {
  process.env.APP_VARIANT = variantOverride;
}

const validation = validateReleaseEnvironment(process.env, {
  defaultEasProjectId: DEFAULT_EAS_PROJECT_ID,
  defaultIosBundleId: appJson.expo?.ios?.bundleIdentifier,
  defaultAndroidPackage: appJson.expo?.ios?.bundleIdentifier,
});

console.log(formatReleaseValidationReport(validation));

if (!validation.ok) {
  process.exitCode = 1;
}
