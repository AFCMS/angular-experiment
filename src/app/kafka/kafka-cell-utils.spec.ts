import { fromAvro } from '@afcms/avro-zod';
import { z } from 'zod';
import * as core from 'zod/v4/core';
import { errorMessage } from './kafka-cell-utils';

describe('validation error messages', () => {
  it('shows the first issue from Avro v2 Core schemas', () => {
    const result = core.safeParse(fromAvro('long'), 1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorMessage(result.error)).toBe(result.error.issues[0].message);
    }
  });

  it('continues to handle Classic schemas and ordinary errors', () => {
    const result = z.string().safeParse(1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(errorMessage(result.error)).toBe(result.error.issues[0].message);
    }
    expect(errorMessage(new Error('Request failed'))).toBe('Request failed');
    expect(errorMessage(null)).toBe('An unexpected error occurred.');
  });
});
