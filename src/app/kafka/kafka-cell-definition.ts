import type { Observable } from 'rxjs';
import { z } from 'zod';
import { serializeRelayJson } from './kafka-cell-utils';

export type CompletionResult<T extends string = string> =
  readonly T[] | Promise<readonly T[]> | Observable<readonly T[]>;
type Choice = string | number | bigint | boolean;
export type EditorValue = Choice | null;
export type Defaults<T> = { [K in keyof T]: T[K] | (() => T[K]) };

type DynamicKeys<D> = { [K in keyof D]: D[K] extends () => unknown ? K : never }[keyof D];
type Preset<T, D> = Omit<T, DynamicKeys<D>> & { [K in DynamicKeys<D>]?: never };

/** true uses the inferred control; an object adds completion, choices, or a custom codec. */
export type FieldEditor<T> =
  | ([NonNullable<T>] extends [never]
      ? never
      : NonNullable<T> extends Choice
        ? | true
          | {
              label?: string;
              options?: readonly NonNullable<T>[];
              complete?: NonNullable<T> extends string
                ? (query: string) => CompletionResult<NonNullable<T>>
                : never;
            }
        : never)
  | { label?: string; parse: (text: string) => T; format: (value: T) => string };

export interface KafkaCellConfig<T, D extends Defaults<T>> {
  title: string;
  endpoint: string;
  defaults: D & Record<Exclude<keyof D, keyof T>, never>;
  presets?: Readonly<Record<string, Preset<T, NoInfer<D>>>>;
  fields?: { [K in Exclude<keyof T, DynamicKeys<NoInfer<D>>>]?: FieldEditor<T[K]> };
  headers?: Readonly<Record<string, string>>;
  serialize?: (payload: T) => string;
}

/** Internal form adapter. Consumers configure cells through KafkaCellConfig. */
export interface CellField {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'bigint' | 'boolean' | 'select' | 'custom';
  nullable: boolean;
  options: readonly Choice[];
  complete?: (query: string) => CompletionResult;
  parse: (value: EditorValue) => unknown;
  format: (value: unknown) => EditorValue;
}

export interface KafkaCellDefinition<T extends Record<string, unknown>> {
  title: string;
  endpoint: string;
  headers: Readonly<Record<string, string>>;
  initialValues: Readonly<Record<string, unknown>>;
  fields: readonly CellField[];
  presets: readonly { label: string; createPayload: () => T }[];
  createPayload: (edits?: Readonly<Record<string, unknown>>) => T;
  serialize: (payload: T) => string;
}

type RuntimeEditor = {
  label?: string;
  options?: readonly Choice[];
  complete?: (query: string) => CompletionResult;
  parse?: (text: string) => unknown;
  format?: (value: unknown) => string;
};

export function defineKafkaCell<S extends z.ZodObject, const D extends Defaults<z.output<S>>>(
  schema: S,
  config: KafkaCellConfig<z.output<NoInfer<S>>, D>,
): KafkaCellDefinition<z.output<S>> {
  const entries = Object.entries(config.defaults);
  const initialValues = structuredClone(
    Object.fromEntries(entries.filter(([, value]) => typeof value !== 'function')),
  );
  const dynamic = entries.filter(([, value]) => typeof value === 'function');
  const createPayload = (base: Readonly<Record<string, unknown>>, edits = {}): z.output<S> =>
    schema.parse({
      ...structuredClone(base),
      ...edits,
      ...Object.fromEntries(dynamic.map(([key, factory]) => [key, (factory as () => unknown)()])),
    });

  // Field types are erased only at this boundary between typed config and generic form controls.
  const fields = (Object.entries(config.fields ?? {}) as [string, true | RuntimeEditor][]).map(
    ([key, setting]): CellField => {
      const editor = setting === true ? {} : setting;
      const validator = schema.shape[key] as z.ZodType;
      if (!validator || dynamic.some(([name]) => name === key))
        throw new Error(`Cannot edit field "${key}".`);
      const scalar = unwrapNullable(validator);
      const options = editor.options ?? (scalar instanceof z.ZodEnum ? scalar.options : undefined);
      const kind = editor.parse
        ? 'custom'
        : options
          ? 'select'
          : scalar instanceof z.ZodBigInt
            ? 'bigint'
            : scalar instanceof z.ZodNumber
              ? 'number'
              : scalar instanceof z.ZodBoolean
                ? 'boolean'
                : 'text';
      return {
        key,
        label: editor.label ?? key.charAt(0).toUpperCase() + key.slice(1),
        kind,
        nullable: validator.safeParse(null).success,
        options: options ?? [],
        complete: editor.complete,
        parse: (value) => {
          let parsed: unknown = value;
          if (value !== null) {
            if (kind === 'custom') parsed = editor.parse!(String(value));
            if (kind === 'bigint') {
              if (!/^-?\d+$/.test(String(value))) throw new Error('Enter a whole number.');
              parsed = BigInt(value);
            }
            if (kind === 'number') {
              if (String(value).trim() === '' || !Number.isFinite(Number(value)))
                throw new Error('Enter a finite number.');
              parsed = Number(value);
            }
          }
          return validator.parse(parsed);
        },
        format: (value) =>
          value === null
            ? null
            : kind === 'custom'
              ? editor.format!(value)
              : kind === 'boolean' || kind === 'select'
                ? (value as Choice)
                : String(value),
      };
    },
  );

  return {
    title: config.title,
    endpoint: config.endpoint,
    headers: { 'Content-Type': 'application/json', ...config.headers },
    initialValues,
    fields,
    createPayload: (edits = {}) =>
      createPayload(
        initialValues,
        Object.fromEntries(
          fields
            .filter((field) => Object.hasOwn(edits, field.key))
            .map((field) => [field.key, edits[field.key]]),
        ),
      ),
    presets: Object.entries(config.presets ?? {}).map(([label, value]) => {
      const payload = structuredClone(value);
      return { label, createPayload: () => createPayload(payload) };
    }),
    serialize: config.serialize ?? serializeRelayJson,
  };
}

function unwrapNullable(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodNullable) return unwrapNullable(schema.unwrap() as z.ZodType);
  if (schema instanceof z.ZodUnion) {
    const options = schema.options.filter((option) => !(option instanceof z.ZodNull));
    if (options.length === 1) return unwrapNullable(options[0] as z.ZodType);
  }
  return schema;
}
