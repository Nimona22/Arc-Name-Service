import fs from 'node:fs';
const envFile = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const keyMatch = envFile.match(/^VITE_CLIENT_KEY\s*=\s*['"]?([^'"\r\n]+)/m) || envFile.match(/^TEST_CLIENT_KEY\s*=\s*['"]?([^'"\r\n]+)/m);
const rawKey = keyMatch ? keyMatch[1].trim() : '';
const clientKey = rawKey.startsWith('TEST_CLIENT_KEY:') ? rawKey : `TEST_CLIENT_KEY:${rawKey}`;
const urlMatch = envFile.match(/^VITE_CLIENT_URL\s*=\s*['"]?([^'"\r\n]+)/m);
const baseUrl = urlMatch ? urlMatch[1].trim() : 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl';
const clientUrl = `${baseUrl}/arcTestnet`;

async function testRawPaymaster() {
  const dummyAccount = '0x1234567890123456789012345678901234567890';
  const entryPoint = '0x0000000071727de22e5e9d8baf0edac6f37da032';

  const res = await fetch(clientUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${clientKey}`,
      'X-AppInfo': 'platform=web;version=1.0.16;uri=localhost',
      'Origin': 'http://localhost:5173'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
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
    })
  });

  console.log('HTTP Status:', res.status);
  const data = await res.json();
  console.log('JSON response:', JSON.stringify(data, null, 2));
}

testRawPaymaster();
