import fs from 'fs';
import path from 'path';
import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'Arc', symbol: 'ARC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.io'] }
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.testnet.arc.io' }
  }
});

const USDC = '0x3600000000000000000000000000000000000000';

async function main() {
  const envContent = fs.readFileSync('.env', 'utf8');
  const match = envContent.match(/DEPLOYER_PRIVATE_KEY=(0x[a-fA-F0-9]+|[a-fA-F0-9]+)/);
  if (!match) {
    throw new Error('DEPLOYER_PRIVATE_KEY not found in .env');
  }

  const rawKey = match[1].startsWith('0x') ? match[1] : `0x${match[1]}`;
  const account = privateKeyToAccount(rawKey);

  console.log('====================================');
  console.log('   ANS CONTRACT DEPLOYMENT (ARC)   ');
  console.log('====================================');
  console.log('Deployer Wallet:', account.address);

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http('https://rpc.testnet.arc.io')
  });

  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http('https://rpc.testnet.arc.io')
  });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log('Native balance :', balance.toString(), 'wei');

  // Load compiled artifacts
  const repArtifact = JSON.parse(
    fs.readFileSync(path.resolve('contracts/out/ANSReputation.sol/ANSReputation.json'), 'utf8')
  );
  const ansArtifact = JSON.parse(
    fs.readFileSync(path.resolve('contracts/out/ArcNameService.sol/ArcNameService.json'), 'utf8')
  );

  // 1. Deploy ANSReputation
  console.log('\n[1/3] Deploying ANSReputation...');
  const repDeployHash = await walletClient.deployContract({
    abi: repArtifact.abi,
    bytecode: repArtifact.bytecode.object.startsWith('0x')
      ? repArtifact.bytecode.object
      : `0x${repArtifact.bytecode.object}`,
    args: [account.address]
  });
  console.log('  Tx hash:', repDeployHash);
  const repReceipt = await publicClient.waitForTransactionReceipt({ hash: repDeployHash });
  const repAddress = repReceipt.contractAddress;
  console.log('  ANSReputation deployed at:', repAddress);

  // 2. Deploy ArcNameService
  console.log('\n[2/3] Deploying ArcNameService (10 names per wallet limit)...');
  const ansDeployHash = await walletClient.deployContract({
    abi: ansArtifact.abi,
    bytecode: ansArtifact.bytecode.object.startsWith('0x')
      ? ansArtifact.bytecode.object
      : `0x${ansArtifact.bytecode.object}`,
    args: [USDC, repAddress, account.address]
  });
  console.log('  Tx hash:', ansDeployHash);
  const ansReceipt = await publicClient.waitForTransactionReceipt({ hash: ansDeployHash });
  const ansAddress = ansReceipt.contractAddress;
  console.log('  ArcNameService deployed at:', ansAddress);

  // 3. Wire ANSReputation -> ArcNameService
  console.log('\n[3/3] Calling ANSReputation.setAnsContract()...');
  const wireHash = await walletClient.writeContract({
    address: repAddress,
    abi: repArtifact.abi,
    functionName: 'setAnsContract',
    args: [ansAddress]
  });
  console.log('  Tx hash:', wireHash);
  await publicClient.waitForTransactionReceipt({ hash: wireHash });
  console.log('  Wired successfully! Contracts are linked on-chain.');

  // Verify on-chain constant
  const maxActive = await publicClient.readContract({
    address: ansAddress,
    abi: ansArtifact.abi,
    functionName: 'MAX_ACTIVE_NAMES_PER_USER'
  });
  console.log('\nVerified on-chain MAX_ACTIVE_NAMES_PER_USER:', maxActive.toString());

  console.log('\n====================================');
  console.log('       DEPLOYMENT SUMMARY          ');
  console.log('====================================');
  console.log('ANSReputation  :', repAddress);
  console.log('ArcNameService :', ansAddress);
  console.log('Owner          :', account.address);
  console.log('USDC           :', USDC);
  console.log('Explorer Links:');
  console.log(`  https://explorer.testnet.arc.io/address/${repAddress}`);
  console.log(`  https://explorer.testnet.arc.io/address/${ansAddress}`);

  // Save deployed addresses locally
  fs.writeFileSync(
    'deployed_addresses.json',
    JSON.stringify(
      {
        reputation: repAddress,
        ans: ansAddress,
        owner: account.address,
        network: 'Arc Testnet',
        chainId: 5042002,
        maxNamesPerWallet: 10,
        deployedAt: new Date().toISOString()
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
