import { fromAvro, type AvroSchema } from '@afcms/avro-zod';
import type z from 'zod';

export const MyTopicAvro = {
  type: 'record',
  name: 'Event',
  namespace: 'demo',
  fields: [
    { name: 'id', type: 'long' },
    { name: 'status', type: { type: 'enum', name: 'Status', symbols: ['NEW', 'DONE'] } },
    { name: 'note', type: ['null', 'string'], default: null },
    { name: 'timestamp', type: { type: 'long', logicalType: 'timestamp-millis' }, default: 0 },
  ],
} as const satisfies AvroSchema;

export const MyTopicSchema = fromAvro(MyTopicAvro);

export type MyTopic = z.output<typeof MyTopicSchema>;
