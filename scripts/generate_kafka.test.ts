import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import ts from 'typescript';
import * as core from 'zod/v4/core';
import { generateKafka } from './generate_kafka.ts';

const run = promisify(execFile);
const script = fileURLToPath(new URL('./generate_kafka.ts', import.meta.url));
const nodeModules = fileURLToPath(new URL('../node_modules', import.meta.url));
const temporary: string[] = [];
const schema = {
  type: 'record',
  name: 'Event',
  fields: [
    { name: 'id', type: 'long' },
    { name: 'status', type: { type: 'enum', name: 'Status', symbols: ['NEW', 'DONE'] } },
    { name: 'note', type: ['null', 'string'], default: null },
    { name: 'timestamp', type: { type: 'long', logicalType: 'timestamp-millis' } },
  ],
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kafka-topics-'));
  temporary.push(root);
  const input = join(root, 'input');
  const output = join(root, 'output');
  await mkdir(input);
  await writeFile(join(input, 'MyTopic.json'), JSON.stringify(schema));
  return { root, input, output };
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test('generates recursive JSON/Avro modules with real validators and literal payload types', async () => {
  const { root, input, output } = await fixture();
  await mkdir(join(input, 'nested'));
  await writeFile(
    join(input, 'nested', 'AnotherTopic.avsc'),
    JSON.stringify({
      type: 'record',
      name: 'Another',
      fields: [{ name: 'enabled', type: 'boolean' }],
    }),
  );
  await writeFile(join(input, 'notes.txt'), 'Not a schema');
  assert.deepEqual(await generateKafka({ input, output }), { total: 2, updated: 3 });
  // A temp package resolves the same dependencies as the real generated application modules.
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await symlink(nodeModules, join(root, 'node_modules'), 'junction');
  const generated = await import(pathToFileURL(join(output, 'MyTopic.ts')).href);
  assert.deepEqual(generated.MyTopicGeneratedParameters, {});
  const value = { id: 9223372036854775807n, status: 'DONE', note: null, timestamp: 123n };
  assert.deepEqual(core.parse(generated.MyTopicSchema, value), value);
  assert.equal(
    core.safeParse(generated.MyTopicSchema, { ...value, status: 'INVALID' }).success,
    false,
  );
  const another = await import(pathToFileURL(join(output, 'nested', 'AnotherTopic.ts')).href);
  assert.deepEqual(core.parse(another.AnotherTopicSchema, { enabled: true }), { enabled: true });
  assert.deepEqual(another.AnotherTopicGeneratedParameters, {});

  const typecheck = join(root, 'typecheck.ts');
  await writeFile(
    typecheck,
    `import type { MyTopic } from './output/MyTopic.js';
import { registry } from './output/registry.js';
import type { output } from 'zod/v4/core';
const good: MyTopic = { id: 1n, status: 'NEW', note: null, timestamp: 0n };
const registered: output<typeof registry.MyTopic> = good;
const nested: output<typeof registry.AnotherTopic> = { enabled: true };
// @ts-expect-error Registry keys must retain the topic names.
registry.Missing;
// @ts-expect-error Registry schemas must retain their inferred field types.
const invalidRegistered: output<typeof registry.MyTopic> = { id: 1, status: 'NEW', note: null, timestamp: 0n };
// @ts-expect-error Enum symbols must remain literal, not widen to string or unknown.
const badStatus: MyTopic = { id: 1n, status: 'INVALID', note: null, timestamp: 0n };
// @ts-expect-error Nullable fields must remain required.
const missing: MyTopic = { id: 1n, status: 'NEW', timestamp: 0n };
// @ts-expect-error Long values must remain bigint.
const badId: MyTopic = { id: 1, status: 'NEW', note: null, timestamp: 0n };
`,
  );
  const program = ts.createProgram([typecheck], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    outDir: join(root, 'compiled'),
    skipLibCheck: true,
    types: [],
  });
  assert.deepEqual(
    ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    [],
  );
  assert.equal(program.emit().emitSkipped, false);
  const { registry } = await import(
    pathToFileURL(join(root, 'compiled', 'output', 'registry.js')).href
  );
  assert.deepEqual(Object.keys(registry).sort(), ['AnotherTopic', 'MyTopic']);
  assert.deepEqual(core.parse(registry.MyTopic, value), value);
  assert.deepEqual(core.parse(registry.AnotherTopic, { enabled: true }), { enabled: true });
});

test('generated parameters check field names, factory types, and return values', async () => {
  const { root, input, output } = await fixture();
  await generateKafka({ input, output });
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await symlink(nodeModules, join(root, 'node_modules'), 'junction');
  const original = await readFile(join(output, 'MyTopic.ts'), 'utf8');
  const cases = [
    ['Valid', "{ timestamp: () => 123n, status: () => 'DONE', note: () => null }", undefined],
    ['UnknownField', '{ missing: () => 123n }', /missing.*does not exist/],
    ['WrongReturn', '{ timestamp: () => 123 }', /number.*not assignable.*bigint/],
    ['NotAFactory', '{ timestamp: 123n }', /bigint.*not assignable.*=> bigint/],
    ['InvalidEnum', "{ status: () => 'INVALID' }", /INVALID.*not assignable/],
  ] as const;
  const paths: string[] = [];
  for (const [name, parameters] of cases) {
    const path = join(output, `${name}.ts`);
    paths.push(path);
    await writeFile(
      path,
      original.replace(
        'MyTopicGeneratedParameters = {}',
        `MyTopicGeneratedParameters = ${parameters}`,
      ),
    );
  }
  const typecheck = join(root, 'typecheck.ts');
  await writeFile(
    typecheck,
    `import { MyTopicGeneratedParameters } from './output/Valid.js';
const generatedField: keyof typeof MyTopicGeneratedParameters = 'timestamp';
// @ts-expect-error Only configured factories are generated; the map must not widen to all keys.
const staticField: keyof typeof MyTopicGeneratedParameters = 'id';
`,
  );
  const program = ts.createProgram([...paths, typecheck], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.file?.fileName === typecheck),
    [],
  );
  assert.ok(diagnostics.every((diagnostic) => paths.includes(diagnostic.file?.fileName ?? '')));
  for (const [index, [, , expected]] of cases.entries()) {
    const messages = diagnostics
      .filter((diagnostic) => diagnostic.file?.fileName === paths[index])
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    if (expected) assert.match(messages.join('\n'), expected);
    else assert.deepEqual(messages, []);
  }
});

test('generates beside sources by default and leaves unchanged output untouched', async () => {
  const { input } = await fixture();
  assert.deepEqual(await generateKafka({ input }), { total: 1, updated: 2 });
  const path = join(input, 'MyTopic.ts');
  const registryPath = join(input, 'registry.ts');
  const before = await stat(path);
  const registryBefore = await stat(registryPath);
  assert.deepEqual(await generateKafka({ input }), { total: 1, updated: 0 });
  assert.equal((await stat(path)).mtimeMs, before.mtimeMs);
  assert.equal((await stat(registryPath)).mtimeMs, registryBefore.mtimeMs);
  assert.deepEqual(await generateKafka({ input, check: true }), { total: 1, updated: 0 });
});

test('regenerates missing or edited registries and removes topics no longer in the input', async () => {
  const { input, output } = await fixture();
  await writeFile(join(input, 'OtherTopic.json'), JSON.stringify(schema));
  await generateKafka({ input, output });
  const path = join(output, 'registry.ts');
  const original = await readFile(path, 'utf8');
  assert.match(original, /OtherTopic: OtherTopicSchema/);
  for (const content of [undefined, '// Edited registry\n']) {
    if (content === undefined) await rm(path);
    else await writeFile(path, content);
    await assert.rejects(generateKafka({ input, output, check: true }), /registry.ts/);
    if (content === undefined) await assert.rejects(stat(path), { code: 'ENOENT' });
    else assert.equal(await readFile(path, 'utf8'), content);
    assert.deepEqual(await generateKafka({ input, output }), { total: 2, updated: 1 });
    assert.equal(await readFile(path, 'utf8'), original);
  }
  await rm(join(input, 'OtherTopic.json'));
  await assert.rejects(generateKafka({ input, output, check: true }), /registry.ts/);
  assert.deepEqual(await generateKafka({ input, output }), { total: 1, updated: 1 });
  const updated = await readFile(path, 'utf8');
  assert.doesNotMatch(updated, /OtherTopic/);
  assert.match(updated, /MyTopic: MyTopicSchema/);
  // A removed topic's handwritten module is retained; it is just excluded from the registry.
  await stat(join(output, 'OtherTopic.ts'));
  assert.deepEqual(await generateKafka({ input, output, check: true }), { total: 1, updated: 0 });
});

test('rejects duplicate topic names and a topic that would overwrite the registry', async () => {
  const { input, output } = await fixture();
  await generateKafka({ input, output });
  const original = await readFile(join(output, 'registry.ts'), 'utf8');
  await mkdir(join(input, 'nested'));
  await writeFile(join(input, 'nested', 'MyTopic.avsc'), JSON.stringify(schema));
  await assert.rejects(generateKafka({ input, output }), /duplicate topic name MyTopic/);
  await assert.rejects(stat(join(output, 'nested')), { code: 'ENOENT' });
  assert.equal(await readFile(join(output, 'registry.ts'), 'utf8'), original);
  await rm(join(input, 'nested', 'MyTopic.avsc'));
  await writeFile(join(input, 'registry.json'), JSON.stringify(schema));
  await assert.rejects(generateKafka({ input, output }), /registry.ts is reserved/);
  assert.equal(await readFile(join(output, 'registry.ts'), 'utf8'), original);
});

test('refreshes only the schema declaration and preserves hand-edited factories and helpers', async () => {
  const { input, output } = await fixture();
  await generateKafka({ input, output });
  const path = join(output, 'MyTopic.ts');
  const generated = await readFile(path, 'utf8');
  const prefix = "// Custom header\nimport type { UUID } from 'node:crypto';\n\n";
  const custom = generated.replace(
    'MyTopicGeneratedParameters = {}',
    'MyTopicGeneratedParameters = { timestamp: nextTimestamp }',
  );
  // Deliberately preserve custom whitespace, comments, and helpers without formatting them.
  const suffix =
    '\n// MyTopicAvro = do not replace this comment\nfunction nextTimestamp() {return 456n;}\n';
  const handEdited = prefix + custom + suffix;
  await writeFile(path, handEdited);
  assert.deepEqual(await generateKafka({ input, output, check: true }), { total: 1, updated: 0 });
  assert.deepEqual(await generateKafka({ input, output }), { total: 1, updated: 0 });
  assert.equal(await readFile(path, 'utf8'), handEdited);

  await writeFile(
    join(input, 'MyTopic.json'),
    JSON.stringify({
      ...schema,
      doc: 'Updated schema',
      fields: [...schema.fields, { name: 'enabled', type: 'boolean' }],
    }),
  );
  assert.deepEqual(await generateKafka({ input, output }), { total: 1, updated: 1 });
  const updated = await readFile(path, 'utf8');
  const schemaStart = handEdited.indexOf('export const MyTopicAvro');
  assert.equal(updated.slice(0, schemaStart), handEdited.slice(0, schemaStart));
  assert.equal(
    updated.slice(updated.indexOf('export const MyTopicSchema')),
    handEdited.slice(handEdited.indexOf('export const MyTopicSchema')),
  );
  assert.match(updated, /Updated schema/);
  assert.match(updated, /enabled/);
  assert.deepEqual(await generateKafka({ input, output, check: true }), { total: 1, updated: 0 });
});

test('updates legacy modules without adding or replacing handwritten sections', async () => {
  const { input, output } = await fixture();
  await generateKafka({ input, output });
  const path = join(output, 'MyTopic.ts');
  const generated = await readFile(path, 'utf8');
  const legacy = generated.slice(0, generated.indexOf('// Edit these factories'));
  await writeFile(path, legacy);
  await writeFile(join(input, 'MyTopic.json'), JSON.stringify({ ...schema, doc: 'Legacy update' }));
  await generateKafka({ input, output });
  const updated = await readFile(path, 'utf8');
  assert.match(updated, /Legacy update/);
  assert.doesNotMatch(updated, /GeneratedParameters/);
});

test('--check catches missing, edited, and stale output without writing', async () => {
  const { input, output } = await fixture();
  await assert.rejects(generateKafka({ input, output, check: true }), /missing or out of date/);
  await assert.rejects(stat(output), { code: 'ENOENT' });
  await generateKafka({ input, output });
  const path = join(output, 'MyTopic.ts');
  const original = await readFile(path, 'utf8');
  const edited = original.replace('Event', 'Edited');
  await writeFile(path, edited);
  await assert.rejects(generateKafka({ input, output, check: true }), /out of date/);
  assert.equal(await readFile(path, 'utf8'), edited);
  await writeFile(path, original);
  await writeFile(
    join(input, 'MyTopic.json'),
    JSON.stringify({ ...schema, doc: 'Updated schema' }),
  );
  await assert.rejects(generateKafka({ input, output, check: true }), /out of date/);
  assert.equal(await readFile(path, 'utf8'), original);
});

test('refuses unrecognized or ambiguous existing modules before changing any output', async () => {
  const { input, output } = await fixture();
  await generateKafka({ input, output });
  const path = join(output, 'MyTopic.ts');
  const original = await readFile(path, 'utf8');
  await writeFile(join(input, 'MyTopic.json'), JSON.stringify({ ...schema, doc: 'Not written' }));
  await writeFile(join(input, 'ZOther.json'), JSON.stringify(schema));
  const other = join(output, 'ZOther.ts');
  for (const custom of [
    '// Handwritten file without an Avro declaration\n',
    'export const ZOtherAvro = {}, helper = () => 1;\n',
    'export const ZOtherAvro = {};\nexport const ZOtherAvro = {};\n',
  ]) {
    await writeFile(other, custom);
    await assert.rejects(generateKafka({ input, output }), /ZOther.ts.*refusing to overwrite/);
    assert.equal(await readFile(other, 'utf8'), custom);
    assert.equal(await readFile(path, 'utf8'), original);
  }
});

for (const [name, content] of [
  ['malformed JSON', '{'],
  ['invalid Avro', JSON.stringify({ ...schema, fields: [...schema.fields, schema.fields[0]] })],
]) {
  test(`rejects ${name} before changing any output`, async () => {
    const { input, output } = await fixture();
    await generateKafka({ input, output });
    const path = join(output, 'MyTopic.ts');
    const original = await readFile(path, 'utf8');
    await writeFile(
      join(input, 'MyTopic.json'),
      JSON.stringify({ ...schema, doc: 'Should not be written' }),
    );
    await writeFile(join(input, 'ZBroken.json'), content);
    await assert.rejects(generateKafka({ input, output }), /ZBroken.json/);
    assert.equal(await readFile(path, 'utf8'), original);
    await assert.rejects(stat(join(output, 'ZBroken.ts')), { code: 'ENOENT' });
  });
}

test('rejects output collisions and invalid export names', async () => {
  const { input, output } = await fixture();
  await writeFile(join(input, 'MyTopic.avsc'), JSON.stringify(schema));
  await assert.rejects(generateKafka({ input, output }), /Multiple schemas/);
  await assert.rejects(stat(output), { code: 'ENOENT' });
  await rm(join(input, 'MyTopic.avsc'));
  await writeFile(join(input, 'bad-name.json'), JSON.stringify(schema));
  await assert.rejects(generateKafka({ input, output }), /TypeScript identifier/);
});

test('rejects an empty source directory instead of silently succeeding', async () => {
  const { input, output } = await fixture();
  await rm(join(input, 'MyTopic.json'));
  await assert.rejects(generateKafka({ input, output }), /No .json or .avsc schemas/);
});

test('the CLI supports external folders and returns failure status for stale files', async () => {
  const { root, input, output } = await fixture();
  const args = [script, '--input', input, '--output', output];
  const generated = await run(process.execPath, args, { cwd: root });
  assert.match(generated.stdout, /Generated 1 topic module/);
  const checked = await run(process.execPath, [...args, '--check'], { cwd: root });
  assert.match(checked.stdout, /Checked 1 topic module/);
  await writeFile(join(input, 'MyTopic.json'), JSON.stringify({ ...schema, doc: 'Stale output' }));
  await assert.rejects(run(process.execPath, [...args, '--check'], { cwd: root }), {
    code: 1,
    stderr: /missing or out of date/,
  });
});
