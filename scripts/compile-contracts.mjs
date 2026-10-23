import fs from 'fs';
import path from 'path';
import solc from 'solc';

function findImports(importPath) {
  if (importPath.startsWith('@openzeppelin/contracts/')) {
    const fullPath = path.resolve('node_modules', importPath);
    if (fs.existsSync(fullPath)) {
      return { contents: fs.readFileSync(fullPath, 'utf8') };
    }
  }
  const localContract = path.resolve('contracts', importPath);
  if (fs.existsSync(localContract)) {
    return { contents: fs.readFileSync(localContract, 'utf8') };
  }
  return { error: `File not found: ${importPath}` };
}

const input = {
  language: 'Solidity',
  sources: {
    'ANSReputation.sol': {
      content: fs.readFileSync(path.resolve('contracts/ANSReputation.sol'), 'utf8')
    },
    'ArcNameService.sol': {
      content: fs.readFileSync(path.resolve('contracts/ArcNameService.sol'), 'utf8')
    }
  },
  settings: {
    viaIR: true,
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode']
      }
    }
  }
};

console.log('Compiling contracts with solc 0.8.28...');
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

if (output.errors) {
  const fatal = output.errors.filter((e) => e.severity === 'error');
  if (fatal.length) {
    console.error('Compilation errors:', fatal);
    process.exit(1);
  }
  const warnings = output.errors.filter((e) => e.severity === 'warning');
  if (warnings.length) {
    console.log(`Compilation finished with ${warnings.length} warning(s).`);
  }
}

// Save ANSReputation
const repCompiled = output.contracts['ANSReputation.sol']['ANSReputation'];
const repDir = path.resolve('contracts/out/ANSReputation.sol');
fs.mkdirSync(repDir, { recursive: true });
fs.writeFileSync(
  path.join(repDir, 'ANSReputation.json'),
  JSON.stringify({
    abi: repCompiled.abi,
    bytecode: { object: repCompiled.evm.bytecode.object },
    deployedBytecode: { object: repCompiled.evm.bytecode.object }
  }, null, 2)
);
console.log('Saved ANSReputation.json');

// Save ArcNameService
const ansCompiled = output.contracts['ArcNameService.sol']['ArcNameService'];
const ansDir = path.resolve('contracts/out/ArcNameService.sol');
fs.mkdirSync(ansDir, { recursive: true });
fs.writeFileSync(
  path.join(ansDir, 'ArcNameService.json'),
  JSON.stringify({
    abi: ansCompiled.abi,
    bytecode: { object: ansCompiled.evm.bytecode.object },
    deployedBytecode: { object: ansCompiled.evm.bytecode.object }
  }, null, 2)
);
console.log('Saved ArcNameService.json (Bytecode bytes:', ansCompiled.evm.bytecode.object.length / 2, ')');

