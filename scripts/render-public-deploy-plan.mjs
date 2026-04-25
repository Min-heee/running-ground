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
  node ./scripts/render-public-deploy-plan.mjs \\
    --root-domain runningground.com \\
    --preview-ip 203.0.113.10 \\
    --production-ip 203.0.113.11

Options:
  --root-domain <domain>         Root domain such as runningground.com.
  --preview-ip <ip>              Public IPv4 for preview-api.<domain>.
  --production-ip <ip>           Public IPv4 for api.<domain>.
  --ops-email <email>            Optional ACME email. Defaults to ops@<domain>.
  --ssh-user <user>              Optional SSH user for cloud-init. Defaults to deploy.
  --preview-hostname <name>      Optional preview server hostname.
  --production-hostname <name>   Optional production server hostname.
  --help                         Show this help.
`.trim();
}

function fail(message) {
  console.error(`[deploy-plan] ${message}`);
  console.error('');
  console.error(usage());
  process.exit(1);
}

function normalizeDomain(value) {
  const normalized = value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  if (!/^(?=.{1,253}$)(?!-)(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,63}$/.test(normalized)) {
    fail('root-domain must be a valid public hostname.');
  }

  return normalized.toLowerCase();
}

function normalizeIpv4(value, flagName) {
  const normalized = value.trim();

  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(normalized)) {
    fail(`${flagName} must be a valid IPv4 address.`);
  }

  const segments = normalized.split('.').map(Number);

  if (segments.some((segment) => segment < 0 || segment > 255)) {
    fail(`${flagName} must be a valid IPv4 address.`);
  }

  return normalized;
}

function normalizeOptionalHostname(value, fallbackValue) {
  const normalized = value.trim();

  if (!normalized) {
    return fallbackValue;
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/.test(normalized)) {
    fail('hostname must contain only letters, numbers, or hyphens.');
  }

  return normalized;
}

function normalizeOptionalUser(value, fallbackValue) {
  const normalized = value.trim();

  if (!normalized) {
    return fallbackValue;
  }

  if (!/^[a-z_][a-z0-9_-]{0,31}$/i.test(normalized)) {
    fail('ssh-user must look like a valid Linux username.');
  }

  return normalized;
}

function markdownCodeBlock(command) {
  return `\`\`\`bash\n${command}\n\`\`\``;
}

function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(usage());
    return;
  }

  const rootDomain = normalizeDomain(readArgValue('--root-domain'));
  const previewIp = normalizeIpv4(readArgValue('--preview-ip'), '--preview-ip');
  const productionIp = normalizeIpv4(readArgValue('--production-ip'), '--production-ip');
  const opsEmail = readArgValue('--ops-email') || `ops@${rootDomain}`;
  const sshUser = normalizeOptionalUser(readArgValue('--ssh-user'), 'deploy');
  const previewHostname = normalizeOptionalHostname(readArgValue('--preview-hostname'), 'runningground-preview');
  const productionHostname = normalizeOptionalHostname(readArgValue('--production-hostname'), 'runningground-production');

  const previewDomain = `preview-api.${rootDomain}`;
  const productionDomain = `api.${rootDomain}`;
  const sameServer = previewIp === productionIp;

  const lines = [
    '# RunningGround Public Deploy Plan',
    '',
    '## Inputs',
    '',
    `- root domain: \`${rootDomain}\``,
    `- preview domain: \`${previewDomain}\``,
    `- production domain: \`${productionDomain}\``,
    `- preview server IP: \`${previewIp}\``,
    `- production server IP: \`${productionIp}\``,
    `- ops email: \`${opsEmail}\``,
    `- ssh user: \`${sshUser}\``,
    '',
    '## 1. Cloudflare DNS',
    '',
    '| Type | Name | Value |',
    '| --- | --- | --- |',
    `| A | preview-api | ${previewIp} |`,
    `| A | api | ${productionIp} |`,
    '',
    sameServer
      ? '> Note: preview와 production IP가 같아요. 현재 공개 템플릿은 Caddy가 80/443을 직접 쓰므로, 같은 서버 동시 public 운영은 추천하지 않습니다. 가능하면 서버를 분리하세요.'
      : '> Good: preview와 production 서버가 분리돼 있어 현재 템플릿과 잘 맞습니다.',
    '',
    '## 2. Create Droplets',
    '',
    '- Region: `Singapore (SGP1)`',
    '- Image: `Ubuntu 24.04 LTS`',
    '- Size: `2 GB RAM`',
    '- Auth: `SSH key`',
    '',
    '### Preview User Data',
    '',
    markdownCodeBlock(`npm run server:render:cloud-init -- --hostname ${previewHostname} --ssh-user ${sshUser}`),
    '',
    '### Production User Data',
    '',
    markdownCodeBlock(`npm run server:render:cloud-init -- --hostname ${productionHostname} --ssh-user ${sshUser}`),
    '',
    '## 3. After First SSH Login',
    '',
    'Run on each server after cloning the repo:',
    '',
    markdownCodeBlock(`npm run server:check:readiness`),
    '',
    '## 4. Preview Deploy',
    '',
    markdownCodeBlock(
      [
        `npm run backend:check-domain -- --domain ${previewDomain} --expected-ip ${previewIp} --skip-health`,
        `npm run backend:deploy:public -- --env preview --domain ${previewDomain} --email ${opsEmail} --expected-ip ${previewIp} --sync-eas-preview`,
        `npm run backend:migrate:public:postgres -- --env preview`,
      ].join('\n'),
    ),
    '',
    '## 5. Production Deploy',
    '',
    markdownCodeBlock(
      [
        `npm run backend:check-domain -- --domain ${productionDomain} --expected-ip ${productionIp} --skip-health`,
        `npm run backend:deploy:public -- --env production --domain ${productionDomain} --email ${opsEmail} --expected-ip ${productionIp}`,
        `npm run backend:migrate:public:postgres -- --env production`,
      ].join('\n'),
    ),
    '',
    '## 6. Post-Migration Next Step',
    '',
    '- Open `backend/.env.preview` or `backend/.env.production` on the server.',
    '- Enable the `BACKEND_POSTGRES_ENABLE_*` flags you want to roll out first.',
    '- Redeploy with `npm run backend:deploy:public ...` again.',
    '',
    '## 7. App Targets',
    '',
    `- TestFlight / preview should use \`https://${previewDomain}/api\``,
    `- Store production builds should use \`https://${productionDomain}/api\``,
  ];

  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
