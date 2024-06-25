import { beforeAll, describe, expect, test } from '@jest/globals';
import MicroBatcher from "../src/MicroBatcher";
import {TSBatchError} from "../src/TSBatchError";

beforeAll(async () => {});

describe('constructor test', () => {
  test('MicroBatcher should be constructable', async () => {
  });
  test('TSBatchError must include stack trace and cause', async () => {
    try {
      throw new TSBatchError({ message: 'Test', cause: 'Test' });
    } catch (e){
      expect(e).toBeInstanceOf(TSBatchError);
      expect(e.message).toBe('Test');
      expect(e.cause).toBe('Test');
      expect(e.stack).toBeDefined();
      expect(e.name).toBe('TSBatchError');
    }
  });
});
