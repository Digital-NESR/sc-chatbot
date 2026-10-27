/**
 * What splitAsking does to the line the orchestrator actually emits.
 *
 * The orchestrator is told to put the "Asking:" line on its own line and does
 * not: every orchestrated answer in the database runs the answer straight on
 * after the last specialist name. Splitting that on commas invented three
 * specialists out of the answer's punctuation and silently dropped the
 * sentence that answered the question.
 *
 * The logic below is a copy of src/lib/derivation.ts, because that file is
 * TypeScript and this runs under plain node. Change one, change the other.
 *
 *   node eval/asking_split_check.mjs
 */
const ASKING_MARKER = '**Asking:**';
const ASKING_RE = /^\*{0,2}Asking:\*{0,2}/;
const ASKING_FORMS = ['**Asking:**', 'Asking:'];
const SPECIALIST_NAMES = ['Track My Request', 'SourceGuide AI', 'SC Policy AI', 'Material AI'];

function splitAsking(content) {
  let body = content;
  const asking = [];
  for (let pass = 0; pass < 3; pass++) {
    const step = splitAskingOnce(body);
    if (!step.asking.length) {
      if (step.body === '' && body !== '') return { body: '', asking };
      break;
    }
    body = step.body;
    for (const name of step.asking) if (!asking.includes(name)) asking.push(name);
  }
  return { body, asking };
}

function splitAskingOnce(content) {
  const lines = content.split('\n');
  let first = 0;
  while (first < lines.length && !lines[first].trim()) first++;

  const line = lines[first]?.trimStart() ?? '';

  if (line.length > 0 && lines.length === first + 1
      && ASKING_FORMS.some((form) => form.startsWith(line))) {
    return { body: '', asking: [] };
  }
  const marker = line.match(ASKING_RE);
  if (!marker) return { body: content, asking: [] };

  let rest = line.slice(marker[0].length);
  const named = [];
  for (;;) {
    const ahead = rest.replace(/^[\s,]+/, '');
    const hit = SPECIALIST_NAMES.find(
      (name) => ahead.slice(0, name.length).toLowerCase() === name.toLowerCase(),
    );
    if (!hit) break;
    named.push(hit);
    rest = ahead.slice(hit.length);
  }
  if (!named.length) return { body: content, asking: [] };

  const tail = rest.replace(/^[\s,.;:]+/, '');
  return { body: [tail, ...lines.slice(first + 1)].join('\n').trim(), asking: named };
}

// Verbatim from the database, message cmvp58zjp000008jwrcms6jrx (26 Oct).
const real =
  '**Asking:** Track My Request**There are 722 purchase orders (2,233 lines) waiting for approval right now.**' +
  ' The longest-waiting items have been sitting for over 5 years, though most are under 3 months.\n\n' +
  "Here's who is holding the most:";

const cases = [
  ['marker half arrived', '**Asking', { asking: [], body: '' }],
  ['marker just arrived', '**Asking:**', { asking: [], body: '' }],
  ['names arriving', '**Asking:** Track My Request', { asking: ['Track My Request'], body: '' }],
  ['run-on, as sent', real, {
    asking: ['Track My Request'],
    body: '**There are 722 purchase orders (2,233 lines) waiting for approval right now.**'
      + ' The longest-waiting items have been sitting for over 5 years, though most are under 3 months.\n\n'
      + "Here's who is holding the most:",
  }],
  ['two names, run-on', '**Asking:** Material AI, SourceGuide AI**Both say the same.**', {
    asking: ['Material AI', 'SourceGuide AI'],
    body: '**Both say the same.**',
  }],
  ['properly formatted', '**Asking:** Track My Request\n\nThere are 722 purchase orders.', {
    asking: ['Track My Request'],
    body: 'There are 722 purchase orders.',
  }],
  // Verbatim from the orchestrator, 26 Oct, after the newline rule was added.
  ['written twice', '**Asking:** Track My Request**Asking:** Track My Request\n\nThe total value is $198.2m.', {
    asking: ['Track My Request'],
    body: 'The total value is $198.2m.',
  }],
  ['written twice, two names', '**Asking:** Material AI**Asking:** Material AI, SourceGuide AI\n\nBoth agree.', {
    asking: ['Material AI', 'SourceGuide AI'],
    body: 'Both agree.',
  }],
  // Verbatim from the orchestrator on Haiku 4.5, 27 Oct: no asterisks, and a
  // full stop closing the line before the answer runs straight on.
  ['haiku, unbolded and run-on', 'Asking: Track My Request.**$198.2 million** in capex.', {
    asking: ['Track My Request'],
    body: '**$198.2 million** in capex.',
  }],
  ['haiku, unbolded, own line', 'Asking: Material AI\n\nWe hold 412 of them.', {
    asking: ['Material AI'], body: 'We hold 412 of them.',
  }],
  ['haiku marker half arrived', 'Askin', { asking: [], body: '' }],
  ['no marker at all', 'There are 722 purchase orders.', {
    asking: [], body: 'There are 722 purchase orders.',
  }],
  ['marker, nobody named', '**Asking:** \n\nSomething.', {
    asking: [], body: '**Asking:** \n\nSomething.',
  }],
  ['an answer that starts bold', '**Bold opening** and the rest.', {
    asking: [], body: '**Bold opening** and the rest.',
  }],
];

let failed = 0;
for (const [label, input, want] of cases) {
  const got = splitAsking(input);
  const ok = JSON.stringify(got.asking) === JSON.stringify(want.asking) && got.body === want.body;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log('        want asking', JSON.stringify(want.asking), 'body', JSON.stringify(want.body));
    console.log('        got  asking', JSON.stringify(got.asking), 'body', JSON.stringify(got.body));
  }
}
console.log(failed ? `\n${failed} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
