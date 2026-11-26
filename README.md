# Kafka relay playground

Small Angular Material cells backed by Avro-derived Zod schemas.

```sh
pnpm start
pnpm build
pnpm test --watch=false
pnpm typecheck
```

## Generate topic modules

Keep Avro sources in [src/app/kafka/defs](src/app/kafka/defs), for example [MyTopic.json](src/app/kafka/defs/MyTopic.json), and run:

```sh
pnpm generate:kafka
pnpm check:kafka
```

[scripts/generate_kafka.ts](scripts/generate_kafka.ts) recursively reads `.json` and `.avsc` files and generates matching `.ts` modules beside them. `MyTopic.json` exports `MyTopicAvro`, `MyTopicSchema`, the inferred `MyTopic` type, and `MyTopicGeneratedParameters`, even if the Avro record has a different name. Filenames must be valid TypeScript identifiers.

It also generates [registry.ts](src/app/kafka/defs/registry.ts) in the output directory, exporting `registry`, an object mapping topic filenames to their Zod schemas, such as `registry.MyTopic`. Each entry retains its precise schema type. The registry includes topics in nested folders and is regenerated in full; topic filenames must be unique across folders, and the root name `registry` is reserved. Removed schemas are excluded from the registry without deleting their handwritten topic modules.

New modules start with an empty `GeneratedParameters` map. Edit it by hand in the topic's TypeScript file to define factories for any schema fields:

```ts
export const MyTopicGeneratedParameters = {
  timestamp: () => BigInt(Date.now()),
} satisfies {
  [K in keyof MyTopic]?: () => MyTopic[K];
};
```

Field names and factory return types are checked against the inferred topic type. Keep `satisfies` so TypeScript also remembers exactly which fields are generated. Spread the map into the cell's defaults as shown below; generated fields are refreshed on every send and omitted from presets and editable fields.

On existing modules, regeneration replaces only the `MyTopicAvro` declaration. Factories, imports, helpers, comments, and all other code are preserved exactly. Modules created before this feature can add the typed map above by hand. Edit JSON to change the schema; if fields change, TypeScript will flag incompatible factories. The generator refuses to overwrite an existing module if it cannot locate a single matching Avro declaration.

The generator validates every input before writing, preserves literal types with `as const satisfies AvroSchema`, and leaves unchanged files untouched. `check:kafka` checks the schema declarations and registry without writing; manual edits elsewhere in topic modules do not make them outdated. Commit both the JSON sources and TypeScript modules.

To import schemas from another folder:

```sh
pnpm generate:kafka --input ./MyTopics --output ./src/app/kafka/defs
```

Generation also runs before start, build, watch, type checks, and tests. After changing schemas during a running development server, rerun `pnpm generate:kafka`. Handwritten presets and completion handlers in [MyTopicsConfig.ts](src/app/kafka/MyTopicsConfig.ts) are kept separate from generated modules.

Run generator tests independently with `pnpm test:scripts`. The full `pnpm test --watch=false` command runs them before the Angular tests. Scripts use Node's built-in TypeScript support and the project's Node 26 runtime.

## Configure a cell

[MyTopicsConfig.ts](src/app/kafka/MyTopicsConfig.ts) is the working example:

```ts
import { MyTopicGeneratedParameters, MyTopicSchema } from './defs/MyTopic';

export const eventCell = defineKafkaCell(MyTopicSchema, {
  title: 'Events',
  endpoint: '/api/kafka/events',
  defaults: {
    id: 1n,
    status: 'NEW',
    note: null,
    ...MyTopicGeneratedParameters,
  },
  fields: {
    id: true,
    note: { complete: (query) => findNotes(query) },
  },
  presets: {
    'Send DONE': { id: 1n, status: 'DONE', note: 'Processed' },
  },
});
```

Avro v2 produces Zod Core schemas. The shared adapter uses Core parsing and introspection, while continuing to accept Classic Zod objects. For direct validation, use `parse(MyTopicSchema, value)` from `zod/v4/core` rather than `MyTopicSchema.parse(value)`.

- Defaults are complete and typed from the schema. A function means a fresh value on every send.
- Presets are named complete payloads, excluding fields supplied by dynamic factories. Clicking a preset sends it immediately, independently of edits.
- Only keys in `fields` can be edited. Use `true` to infer the control and label from the schema. Omitted fields stay fixed.
- `fields` and `presets` are optional, so a cell can simply send its defaults.
- Enum fields automatically become selects. Optional `label` and `options` override their presentation.
- Text `complete(query)` handlers can return arrays, Promises, or RxJS Observables. Results retain the schema's string type. Lookups are debounced, stale results discarded, and lookup failures recover on the next query.
- The compact `null` toggle preserves the difference between null and an empty string.
- Nested or specialized values use `{ parse: (text) => value, format: (value) => text }`, with both directions typed against the field.

Import [KafkaCell](src/app/kafka/kafka-cell.ts) and bind the definition:

```html
<app-kafka-cell [definition]="eventCell" />
```

Add your cells to [KafkaWorkspace](src/app/kafka/kafka-workspace.ts) and its [template](src/app/kafka/kafka-workspace.html). Each instance has independent state and automatically generated input IDs.

## Connect the relay

Replace the example `/api/kafka/my-topic` route with your relay endpoint or configure a development proxy. No backend is included.

Requests use POST with JSON. The default serializer preserves `bigint` values as exact JSON integer tokens. Optional `headers` and a typed `serialize(payload)` callback support relay-specific envelopes, tagged unions, string longs, or byte encodings.

All outgoing payloads are validated before HTTP runs. Invalid submissions focus the first invalid field, duplicate sends are blocked while pending, and requests are canceled when their cell is destroyed.
