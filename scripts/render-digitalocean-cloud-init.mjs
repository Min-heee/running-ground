import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(currentFilePath), '..');
const bootstrapScriptPath = resolve(projectRoot, 'scripts', 'bootstrap-ubuntu-server.sh');

function readArgValue(flagName) {
  const index = process.argv.indexOf(flagName);

  if (index < 0 || index + 1 >= process.argv.length) {
    return '';
  }

  return process.argv[index + 1]?.trim() ?? '';
}

function hasFlag(flagName) {
  return process.argv.includes(flagName);
}

function usage() {
  return `
Usage:
  node ./scripts/render-digitalocean-cloud-init.mjs --hostname runningground-preview --ssh-user deploy

Options:
  --hostname <name>      Optional server hostname. Defaults to runningground-server.
  --ssh-user <name>      SSH user to add into docker group after bootstrap. Defaults to root.
  --timezone <tz>        Optional timezone. Defaults to Asia/Seoul.
  --disable-ufw          Skip UFW configuration in bootstrap.
  --help                 Show this help.
`.trim();
}

function fail(message) {
  console.error(`[cloud-init-render] ${message}`);
  console.error('');
  console.error(usage());
  process.exit(1);
}

function yamlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function indentBlock(value, spaces) {
  const indent = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');
}

function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(usage());
    return;
  }

  const hostname = readArgValue('--hostname') || 'runningground-server';
  const sshUser = readArgValue('--ssh-user') || 'root';
  const timezone = readArgValue('--timezone') || 'Asia/Seoul';
  const enableUfw = !hasFlag('--disable-ufw');

  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/.test(hostname)) {
    fail('hostname must contain only letters, numbers, or hyphens.');
  }

  if (!/^[a-z_][a-z0-9_-]{0,31}$/i.test(sshUser)) {
    fail('ssh-user must look like a valid Linux username.');
  }

  const bootstrapScript = readFileSync(bootstrapScriptPath, 'utf8').trimEnd();

  const cloudInit = `#cloud-config
hostname: ${hostname}
timezone: ${yamlQuote(timezone)}
package_update: true
package_upgrade: true
write_files:
  - path: /root/bootstrap-ubuntu-server.sh
    permissions: '0755'
    owner: root:root
    content: |
${indentBlock(bootstrapScript, 6)}
runcmd:
  - [bash, -lc, ${yamlQuote(`BOOTSTRAP_USER=${sshUser} ENABLE_UFW=${enableUfw ? 'true' : 'false'} /root/bootstrap-ubuntu-server.sh`)}]
final_message: "RunningGround bootstrap finished. Reconnect SSH to pick up docker group changes."
`;

  process.stdout.write(cloudInit);
}

main();
