import { expectTypeOf } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { z } from 'zod';
import { MyTopicSchema, type MyTopic } from './MyTopic';
import {
  defineKafkaCell,
  type Defaults,
  type FieldEditor,
  type KafkaCellConfig,
  type KafkaCellDefinition,
} from './kafka-cell-definition';
import { completionObservable, serializeRelayJson } from './kafka-cell-utils';

const defaults = {
  id: 1n,
  status: 'NEW',
  note: null,
  timestamp: () => BigInt(Date.now()),
} satisfies Defaults<MyTopic>;
type Config = KafkaCellConfig<MyTopic, typeof defaults>;
const config: Config = {
  title: 'Test',
  endpoint: '/relay',
  defaults,
  presets: { Done: { id: 2n, status: 'DONE', note: 'Preset' } },
  fields: { id: true, note: true },
};

describe('Kafka cell definitions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('infers the payload while rejecting incomplete or mistyped configuration', () => {
    expectTypeOf(defineKafkaCell(MyTopicSchema, config)).toEqualTypeOf<
      KafkaCellDefinition<MyTopic>
    >();
    // @ts-expect-error Nullable fields must still be explicitly supplied.
    const missingDefault: Config['defaults'] = { id: 1n, status: 'NEW', timestamp: () => 0n };
    // @ts-expect-error A preset must provide every non-dynamic field.
    const missingPreset: NonNullable<Config['presets']>[string] = { status: 'NEW' };
    // @ts-expect-error Avro long values are bigint, not number.
    const badId: Config['defaults'] = { ...defaults, id: 1 };
    const badStatus: NonNullable<Config['presets']>[string] = {
      id: 1n,
      // @ts-expect-error Enum symbols come from the schema.
      status: 'INVALID',
      note: null,
    };
    const fullPayload: MyTopic = { id: 1n, status: 'NEW', note: null, timestamp: 0n };
    // @ts-expect-error Dynamic fields cannot be frozen into presets.
    const frozenTimestamp: NonNullable<Config['presets']>[string] = fullPayload;
    const dynamicEditor: Config['fields'] = {
      // @ts-expect-error Dynamic defaults cannot be edited.
      timestamp: true,
    };
    const badOption: FieldEditor<MyTopic['status']> = {
      // @ts-expect-error Options retain the schema's enum symbols.
      options: ['INVALID'],
    };
    const badCompletion: FieldEditor<MyTopic['status']> = {
      // @ts-expect-error Completion results retain the schema's enum symbols.
      complete: () => ['INVALID'],
    };
    const numericCompletion: FieldEditor<bigint> = {
      // @ts-expect-error Only strings support completion.
      complete: () => ['invalid'],
    };
    defineKafkaCell(MyTopicSchema, {
      title: 'Bad',
      endpoint: '/',
      // @ts-expect-error Dynamic factories must return the schema's field type.
      defaults: { ...defaults, timestamp: () => 123 },
    });
    defineKafkaCell(MyTopicSchema, {
      title: 'Bad',
      endpoint: '/',
      // @ts-expect-error Defaults cannot contain fields outside the schema.
      defaults: { ...defaults, extra: true },
    });
    void [
      missingDefault,
      missingPreset,
      badId,
      badStatus,
      frozenTimestamp,
      dynamicEditor,
      badOption,
      badCompletion,
      numericCompletion,
    ];
  });

  it('evaluates factories once per send, protects fixed fields, and keeps presets fixed', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const definition = defineKafkaCell(MyTopicSchema, config);
    expect(clock).not.toHaveBeenCalled();
    expect(
      definition.createPayload({ id: 99n, note: 'Edited', status: 'DONE', timestamp: 0n }),
    ).toEqual({ id: 99n, status: 'NEW', note: 'Edited', timestamp: 1000n });
    expect(clock).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(2000);
    expect(definition.presets[0].createPayload()).toEqual({
      id: 2n,
      status: 'DONE',
      note: 'Preset',
      timestamp: 2000n,
    });
    expect(clock).toHaveBeenCalledTimes(2);
    expect(defaults.id).toBe(1n);
  });

  it('infers controls and preserves null, empty strings, and the full signed long range', () => {
    const definition = defineKafkaCell(MyTopicSchema, config);
    const id = definition.fields[0];
    const note = definition.fields[1];
    expect(id.kind).toBe('bigint');
    expect(note.kind).toBe('text');
    expect(note.nullable).toBe(true);
    expect(id.parse('9223372036854775807')).toBe(9223372036854775807n);
    expect(id.parse('-9223372036854775808')).toBe(-9223372036854775808n);
    expect(() => id.parse('9223372036854775808')).toThrow();
    expect(() => id.parse('1.5')).toThrow('Enter a whole number.');
    expect(() => id.parse('')).toThrow();
    expect(note.parse(null)).toBeNull();
    expect(note.parse('')).toBe('');
    expect(() => definition.createPayload({ id: 'invalid' })).toThrow();
  });

  it('infers enum choices, numbers, and booleans and allows typed custom codecs', () => {
    const schema = z.object({
      count: z.number(),
      enabled: z.boolean(),
      status: z.enum(['A', 'B']),
      nested: z.object({ value: z.string() }),
    });
    const definition = defineKafkaCell(schema, {
      title: 'Other',
      endpoint: '/other',
      defaults: { count: 0, enabled: false, status: 'A', nested: { value: 'initial' } },
      fields: {
        count: true,
        enabled: true,
        status: true,
        nested: { parse: (text) => ({ value: text }), format: (value) => value.value },
      },
    });
    expect(definition.presets).toEqual([]);
    expect(definition.fields.map((field) => field.kind)).toEqual([
      'number',
      'boolean',
      'select',
      'custom',
    ]);
    expect(definition.fields[2].options).toEqual(['A', 'B']);
    expect(definition.fields[0].parse('0')).toBe(0);
    expect(() => definition.fields[0].parse('')).toThrow();
    expect(definition.fields[1].parse(false)).toBe(false);
    expect(definition.fields[2].parse('B')).toBe('B');
    expect(definition.fields[3].parse('updated')).toEqual({ value: 'updated' });
    expect(definition.fields[3].format({ value: 'formatted' })).toBe('formatted');
    defineKafkaCell(schema, {
      title: 'Bad',
      endpoint: '/',
      // @ts-expect-error Every field remains required when no defaults are dynamic.
      defaults: { count: 1 },
    });
  });

  it('supports preset-only cells and snapshots values without cloning factory functions', () => {
    const copy: Config = {
      ...config,
      defaults: { ...defaults },
      presets: { Done: { id: 2n, status: 'DONE', note: 'Preset' } },
    };
    const definition = defineKafkaCell(MyTopicSchema, copy);
    copy.defaults.id = 99n;
    copy.presets!['Done'].note = 'Changed later';
    expect(definition.createPayload().id).toBe(1n);
    expect(definition.presets[0].createPayload().note).toBe('Preset');
    const minimal = defineKafkaCell(MyTopicSchema, { title: 'Minimal', endpoint: '/', defaults });
    expect(minimal.fields).toEqual([]);
    expect(minimal.presets).toEqual([]);
    expect(minimal.createPayload().id).toBe(1n);
    const invalid = defineKafkaCell(MyTopicSchema, {
      ...config,
      defaults: { ...defaults, timestamp: () => 2n ** 63n },
    });
    expect(() => invalid.createPayload()).toThrow();
    expect(() => invalid.presets[0].createPayload()).toThrow();
  });

  it('serializes exact bigint tokens and rejects unsupported representations', () => {
    expect(
      serializeRelayJson({
        id: 9223372036854775807n,
        note: 'quote"',
        nested: [null, false, 0, -1n],
      }),
    ).toBe('{"id":9223372036854775807,"note":"quote\\\"","nested":[null,false,0,-1]}');
    expect(() => serializeRelayJson(NaN)).toThrow('custom relay serializer');
    expect(() => serializeRelayJson(new Uint8Array([1, 2]))).toThrow('custom relay serializer');
  });

  it('supports array, Promise, and Observable completion results', async () => {
    expect(await firstValueFrom(completionObservable(['sync']))).toEqual(['sync']);
    expect(await firstValueFrom(completionObservable(Promise.resolve(['promise'])))).toEqual([
      'promise',
    ]);
    expect(await firstValueFrom(completionObservable(of(['observable'])))).toEqual(['observable']);
  });
});
