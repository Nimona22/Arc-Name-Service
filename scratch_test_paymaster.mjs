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

async function testPaymaster() {
  const dummyAccount = '0x1234567890123456789012345678901234567890';
  const entryPoint = '0x0000000071727de22e5e9d8baf0edac6f37da032';
  
  try {
    const res = await req({
      method: 'pm_getPaymasterStubData',
      params: [
        {
          sender: dummyAccount,
          nonce: '0x0',
          initCode: '0x',
          callData: '0x',
          callGasLimit: '0x10000',
          verificationGasLimit: '0x10000',
          preVerificationGas: '0x10000',
          maxFeePerGas: '0x1000000',
          maxPriorityFeePerGas: '0x1000000',
        },
        entryPoint,
        '0x4cef52',
        {}
      ]
    });
    console.log('[SUCCESS] pm_getPaymasterStubData:', res);
  } catch (err) {
    console.log('[FAILED] pm_getPaymasterStubData:');
    console.log('Error message:', err.message);
    console.log('Error details:', err.details);
  }
}

testPaymaster();
