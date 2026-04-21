import { resolve4, resolve6 } from 'node:dns/promises';
import { connect } from 'node:net';

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
  npm run backend:check-domain -- --domain api.example.com
  npm run backend:check-domain -- --domain api.example.com --expected-ip 203.0.113.10
  npm run backend:check-domain -- --domain api.example.com --require-health

Options:
  --domain <domain>        Public backend domain to check.
  --expected-ip <ip>       Optional IPv4/IPv6 address that DNS must include.
  --timeout-ms <number>    Network timeout. Defaults to 5000.
  --skip-ports             Skip TCP checks for 80 and 443.
  --require-ports          Fail if 80 or 443 is not reachable.
  --skip-health            Skip https://domain/api/health check.
  --require-health         Fail if health check is not reachable and ok.
`.trim();
}

function fail(message) {
  console.error(`[domain-check] ${message}`);
  console.error('');
  console.error(usage());
  process.exit(1);
}

function normalizeDomain(value) {
  const normalized = value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  if (!/^(?=.{1,253}$)(?!-)(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,63}$/.test(normalized)) {
    fail('domain must be a valid public hostname.');
  }

  return normalized;
}

function unique(values) {
  return Array.from(new Set(values));
}

async function resolveAddresses(domain) {
  const results = await Promise.allSettled([resolve4(domain), resolve6(domain)]);
  const ipv4 = results[0].status === 'fulfilled' ? results[0].value : [];
  const ipv6 = results[1].status === 'fulfilled' ? results[1].value : [];

  return {
    ipv4: unique(ipv4),
    ipv6: unique(ipv6),
    errors: results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason?.message ?? 'unknown DNS error'),
  };
}

async function checkTcp(domain, port, timeoutMs) {
  return await new Promise((resolveCheck) => {
    const socket = connect({ host: domain, port });
    let settled = false;

    function finish(result) {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolveCheck(result);
    }

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ ok: true }));
    socket.once('timeout', () => finish({ ok: false, message: 'timeout' }));
    socket.once('error', (error) => finish({ ok: false, message: error.message }));
  });
}

async function checkHealth(domain, timeoutMs) {
  const healthUrl = `https://${domain}/api/health`;

  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(timeoutMs) });
    const payload = await response.json();

    return {
      ok: response.ok && payload.status === 'ok',
      statusCode: response.status,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message,
    };
  }
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(usage());
    return;
  }

  const domain = normalizeDomain(readArgValue('--domain'));
  const expectedIp = readArgValue('--expected-ip');
  const timeoutMs = Number.parseInt(readArgValue('--timeout-ms') || '5000', 10);
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
  const requirePorts = hasFlag('--require-ports');
  const requireHealth = hasFlag('--require-health');

  console.log(`[domain-check] domain: ${domain}`);
  console.log('[domain-check] resolving DNS...');

  const { ipv4, ipv6, errors } = await resolveAddresses(domain);
  const addresses = [...ipv4, ...ipv6];

  console.log(`[domain-check] A: ${ipv4.length > 0 ? ipv4.join(', ') : '(none)'}`);
  console.log(`[domain-check] AAAA: ${ipv6.length > 0 ? ipv6.join(', ') : '(none)'}`);

  if (addresses.length === 0) {
    fail(`DNS did not resolve. ${errors.join(' / ')}`);
  }

  if (expectedIp && !addresses.includes(expectedIp)) {
    fail(`DNS does not include expected IP ${expectedIp}.`);
  }

  if (!hasFlag('--skip-ports')) {
    console.log('[domain-check] checking TCP ports...');
    const portResults = await Promise.all([80, 443].map(async (port) => [port, await checkTcp(domain, port, safeTimeoutMs)]));

    for (const [port, result] of portResults) {
      const status = result.ok ? 'open' : `not reachable (${result.message})`;
      console.log(`[domain-check] port ${port}: ${status}`);

      if (requirePorts && !result.ok) {
        fail(`port ${port} is not reachable.`);
      }
    }
  }

  if (!hasFlag('--skip-health')) {
    console.log('[domain-check] checking public health...');
    const health = await checkHealth(domain, safeTimeoutMs);

    if (health.ok) {
      console.log(`[domain-check] health: ok (${health.payload.environment ?? 'unknown env'})`);
    } else {
      console.log(`[domain-check] health: not ready (${health.message ?? `status ${health.statusCode}`})`);

      if (requireHealth) {
        fail('health check failed.');
      }
    }
  }

  console.log('[domain-check] done');
}

main().catch((error) => {
  console.error(`[domain-check] ${error.message}`);
  process.exitCode = 1;
});
