global.window = {
  location: {
    hostname: 'localhost',
  },
};

import { toModularTransport } from '@circle-fin/modular-wallets-core';
import { arcTestnet } from 'viem/chains';

import fs from 'node:fs';
const envFile = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const keyMatch = envFile.match(/^VITE_CLIENT_KEY\s*=\s*['"]?([^'"\r\n]+)/m) || envFile.match(/^TEST_CLIENT_KEY\s*=\s*['"]?([^'"\r\n]+)/m);
const rawKey = keyMatch ? keyMatch[1].trim() : '';
const clientKey = rawKey.startsWith('TEST_CLIENT_KEY:') ? rawKey : `TEST_CLIENT_KEY:${rawKey}`;
const urlMatch = envFile.match(/^VITE_CLIENT_URL\s*=\s*['"]?([^'"\r\n]+)/m);
const clientUrl = urlMatch ? urlMatch[1].trim() : 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl';

const transport = toModularTransport(`${clientUrl}/arcTestnet`, clientKey);
const req = transport({ chain: arcTestnet }).request;

async function testMethod(name, payload) {
  try {
    const res = await req(payload);
    console.log(`[SUCCESS] ${name}:`, res);
  } catch (err) {
    console.log(`[FAILED] ${name}:`, err.message || err.details || err);
  }
}

async function run() {
  await testMethod('eth_supportedEntryPoints', { method: 'eth_supportedEntryPoints' });
  await testMethod('circle_getUserOperationGasPrice', { method: 'circle_getUserOperationGasPrice' });
  await testMethod('eth_blockNumber', { method: 'eth_blockNumber' });
  await testMethod('eth_gasPrice', { method: 'eth_gasPrice' });
}

run();
