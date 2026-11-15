# Kafka relay playground

Small Angular Material cells backed by Avro-derived Zod schemas.

```sh
pnpm start
pnpm build
pnpm test --watch=false
pnpm exec tsc -p tsconfig.spec.json --noEmit
```

## Configure a cell

[MyTopicsConfig.ts](src/app/kafka/MyTopicsConfig.ts) is the working example:

```ts
export const eventCell = defineKafkaCell(MyTopicSchema, {
  title: 'Events',
  endpoint: '/api/kafka/events',
  defaults: {
    id: 1n,
    status: 'NEW',
    note: null,
    timestamp: () => BigInt(Date.now()),
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
