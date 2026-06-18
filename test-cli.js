#!/usr/bin/env node
/**
 * Quick test of CLI package
 * Run with: npm test
 */

const { spawnSync } = require('child_process');
const path = require('path');

function runTest(name, command, args) {
  console.log(`\n🧪 ${name}`);
  console.log(`   Command: ${command} ${args.join(' ')}`);
  
  const result = spawnSync(command, args, {
    cwd: __dirname,
    stdio: 'pipe',
    encoding: 'utf-8'
  });

  if (result.error) {
    console.log(`❌ Error: ${result.error.message}`);
    return false;
  }

  if (result.status === 0) {
    console.log(`✅ Passed`);
    if (result.stdout) {
      const lines = result.stdout.trim().split('\n').slice(0, 3);
      lines.forEach(line => console.log(`   ${line}`));
      if (result.stdout.split('\n').length > 3) {
        console.log(`   ... (${result.stdout.split('\n').length - 3} more lines)`);
      }
    }
    return true;
  } else {
    console.log(`❌ Failed with exit code ${result.status}`);
    if (result.stderr) {
      console.log(`   Error: ${result.stderr.split('\n')[0]}`);
    }
    return false;
  }
}

async function main() {
  console.log('HTTP Forge CLI Tests\n');
  
  const tests = [
    ['Show help', 'node', ['dist/cli.js', '--help']],
    ['Show help (short)', 'node', ['dist/cli.js', '-h']],
    ['No command shows help', 'node', ['dist/cli.js']],
  ];

  let passed = 0;
  let failed = 0;

  for (const [name, cmd, args] of tests) {
    if (runTest(name, cmd, args)) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

main();
