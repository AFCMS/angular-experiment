import { MyTopicSchema } from './MyTopic';
import { defineKafkaCell } from './kafka-cell-definition';

const notes = ['Created from the relay', 'Ready for processing', 'Processed successfully'];

export const MyTopicConfig = defineKafkaCell(MyTopicSchema, {
  title: 'My topic',
  endpoint: '/api/kafka/my-topic',
  defaults: { id: 1n, status: 'NEW', note: null, timestamp: () => BigInt(Date.now()) },
  fields: {
    id: true,
    note: {
      complete: (query) => notes.filter((note) => note.toLowerCase().includes(query.toLowerCase())),
    },
  },
  presets: {
    'Send NEW': { id: 1n, status: 'NEW', note: null },
    'Send DONE': { id: 1n, status: 'DONE', note: 'Processed successfully' },
  },
});
