/**
 * Runs the guardrails over messages that predate them, and records what they find.
 *
 * The console is empty on the day it ships, which is the worst moment to be
 * judging whether a rule is worth enforcing. Every question and answer already
 * in the database is real traffic, and the rules are pure functions, so there
 * is nothing stopping them being scored now.
 *
 * Two things this is careful about, because a history that lies is worse than
 * no history:
 *
 *   createdAt is the MESSAGE's, not the scan's. An event about a question
 *   asked in September reads as September, so the queue is in the order things
 *   actually happened.
 *
 *   backfilled is true on every row. Nothing here was caught as it happened -
 *   the guardrails were not running - and without the flag a reader a month
 *   from now would reasonably conclude they were.
 *
 *   node eval/guardrail_backfill.mjs          # report only, writes nothing
 *   node eval/guardrail_backfill.mjs --write  # insert the rows
 *   node eval/guardrail_backfill.mjs --undo   # remove every backfilled row
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { RULES, connectionStringFromEnvFile } from './guardrail_rules.mjs';

const WRITE = process.argv.includes('--write');
const UNDO = process.argv.includes('--undo');

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: connectionStringFromEnvFile(readFileSync) })),
});

if (UNDO) {
  const { count } = await prisma.guardrailEvent.deleteMany({ where: { backfilled: true } });
  console.log(`removed ${count} backfilled event(s)`);
  await prisma.$disconnect();
  process.exit(0);
}

const existing = await prisma.guardrailEvent.count({ where: { backfilled: true } });
if (existing > 0) {
  console.log(`${existing} backfilled event(s) already present.`);
  console.log('Run with --undo first if you want to redo it; this would otherwise double them.');
  await prisma.$disconnect();
  process.exit(1);
}

const messages = await prisma.message.findMany({
  select: {
    id: true, role: true, content: true, createdAt: true, sessionId: true,
    session: { select: { userEmail: true, botId: true } },
  },
  orderBy: { createdAt: 'asc' },
});

console.log(`Scanning ${messages.length} messages…\n`);

const rows = [];
const perRule = new Map();

for (const m of messages) {
  const surface = m.role === 'user' ? 'input' : m.role === 'assistant' ? 'output' : null;
  if (!surface) continue;

  for (const rule of RULES) {
    if (rule.surface !== surface) continue;
    let excerpt = null;
    try {
      excerpt = rule.test(m.content);
    } catch {
      continue;
    }
    if (!excerpt) continue;

    perRule.set(rule.id, (perRule.get(rule.id) ?? 0) + 1);
    rows.push({
      createdAt: m.createdAt,
      userEmail: m.session?.userEmail ?? null,
      sessionId: m.sessionId,
      botId: m.session?.botId ?? null,
      surface,
      ruleId: rule.id,
      severity: rule.severity,
      // Nothing was blocked, because nothing was running. Saying otherwise
      // would be inventing an enforcement history.
      verdict: 'flag',
      enforced: false,
      backfilled: true,
      excerpt: String(excerpt).slice(0, 2000),
      question: surface === 'input' ? m.content.slice(0, 2000) : null,
    });
  }
}

console.log('WOULD RECORD');
console.log('─'.repeat(52));
if (!perRule.size) {
  console.log('  nothing matched');
} else {
  for (const [id, n] of [...perRule.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id.padEnd(24)} ${String(n).padStart(4)}`);
  }
}
console.log('─'.repeat(52));
console.log(`  ${String(rows.length).padStart(29)} rows total`);

if (!WRITE) {
  console.log('\nNothing written. Re-run with --write to insert them.');
  await prisma.$disconnect();
  process.exit(0);
}

for (let i = 0; i < rows.length; i += 500) {
  await prisma.guardrailEvent.createMany({ data: rows.slice(i, i + 500) });
}
const written = await prisma.guardrailEvent.count({ where: { backfilled: true } });
console.log(`\nwrote ${written} event(s), each dated to the message that produced it`);

await prisma.$disconnect();
