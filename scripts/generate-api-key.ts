#!/usr/bin/env npx tsx
/**
 * Script to generate an API key for MCP Server
 * 
 * Usage:
 *   npx tsx scripts/generate-api-key.ts <user-email> [key-name]
 * 
 * Example:
 *   npx tsx scripts/generate-api-key.ts admin@example.com "MCP Server Key"
 */

import { createHash, randomBytes } from 'crypto';
import { PrismaClient } from '../lib/generated-client/index.js';

const prisma = new PrismaClient();

const API_KEY_PREFIX = 'nkg_';

function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const randomPart = randomBytes(32).toString('base64url');
  const rawKey = `${API_KEY_PREFIX}${randomPart}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = `${API_KEY_PREFIX}${randomPart.substring(0, 4)}...`;
  
  return { rawKey, keyHash, keyPrefix };
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: npx tsx scripts/generate-api-key.ts <user-email> [key-name]');
    console.error('Example: npx tsx scripts/generate-api-key.ts admin@example.com "MCP Server Key"');
    process.exit(1);
  }

  const email = args[0];
  const keyName = args[1] || 'MCP Server Key';

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    console.error(`Error: User with email "${email}" not found.`);
    console.error('\nAvailable users:');
    const users = await prisma.user.findMany({
      where: { isAnonymous: false },
      select: { email: true, name: true },
      take: 10,
    });
    users.forEach(u => console.error(`  - ${u.email} (${u.name || 'No name'})`));
    process.exit(1);
  }

  console.log(`\nGenerating API key for user: ${user.email} (${user.name || 'No name'})`);

  // Generate the key
  const { rawKey, keyHash, keyPrefix } = generateApiKey();

  // Save to database
  const apiKey = await prisma.apiKey.create({
    data: {
      userId: user.id,
      name: keyName,
      keyHash,
      keyPrefix,
    },
  });

  console.log('\n✅ API Key created successfully!\n');
  console.log('━'.repeat(60));
  console.log(`Key Name:   ${keyName}`);
  console.log(`Key ID:     ${apiKey.id}`);
  console.log(`Key Prefix: ${keyPrefix}`);
  console.log('━'.repeat(60));
  console.log(`\n🔑 Your API Key (save this - it won't be shown again!):\n`);
  console.log(`   ${rawKey}`);
  console.log('\n━'.repeat(60));
  console.log('\nTo use with MCP Server, set these environment variables:');
  console.log(`   NIHONGOGPT_API_URL=http://localhost:3000`);
  console.log(`   NIHONGOGPT_API_KEY=${rawKey}`);
  console.log('━'.repeat(60));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
