import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { MicroBatcher, MicroBatcherConfigParams, Status } from '../src/MicroBatcher';

describe('MicroBatcher methods unit tests', () => {
  let microBatcher: MicroBatcher<any>;

  beforeEach(() => {
    const microBatcherConfig: MicroBatcherConfigParams<any> = {
      maxBatchSize: 10,
      maxBatchTime: 1000,
      batchProcessFn: async (batch: any) => {},
      start: true,
    };
    microBatcher = new MicroBatcher(microBatcherConfig);
  });
  describe('add method', () => {
    test('add method should add message to the queue and return QUEUED', () => {
      const res = microBatcher.add('test');
      expect(microBatcher['queue']).toContain('test');
      expect(res.status).toBe(Status.QUEUED);
    });

    test('add method should reject null and undefined to the queue', () => {
      const nullRes = microBatcher.add(null);
      const undefRes = microBatcher.add(undefined);
      expect(microBatcher['queue'].length).toBe(0);
      expect(nullRes.status).toBe(Status.DECLINED);
      expect(undefRes.status).toBe(Status.DECLINED);
    });

    test('add method should process a batch when the maxBatchSize is Reached', () => {
      let res;
      for (let i = 0; i < 10; i++) {
        res = microBatcher.add(`test${i}`);
      }
      expect(microBatcher['queue'].length).toBe(0);
      expect(res?.status).toBe(Status.BATCHED);
    });

    test('Consecutive/async high speed adding should be supported without synchronicity issues', async () => {
      const maxBatchSize = 10;
      const microBatcherConfig: MicroBatcherConfigParams<any> = {
        maxBatchSize: maxBatchSize,
        maxBatchTime: 1000,
        batchProcessFn: async (batch: any) => {},
        allowDuplicates: true,
        start: true,
      };
      microBatcher = new MicroBatcher(microBatcherConfig);

      // runs adds 100 messages 10 times asynchronously
      async function addMessagesToMicroBatcher() {
        for (let i = 0; i < 100; i++) {
          microBatcher.add(`test${i}`);
        }
      }

      for (let i = 0; i < 10; i++) {
        addMessagesToMicroBatcher();
      }
      for (let i = 0; i < 10; i++) {
        expect(microBatcher['batches'][i]?.messages.length).toBe(maxBatchSize);
      }
    });
  });

  describe('start method', () => {
    test('start method should start the batch processor', () => {
      microBatcher.start();
      expect(microBatcher['config'].start).toBe(true);
      expect(microBatcher['intervalId']).toBeDefined();
    });
  });

  describe('stop method', () => {
    test('stop method should stop the batch processor', async () => {
      microBatcher.start();
      await microBatcher.stop();
      expect(microBatcher['config'].start).toBe(false);
    });

    test('stop method should stop the batch processor', async () => {
      microBatcher.start();
      await microBatcher.stop();
      const res = microBatcher.add('test');
      expect(res.status).toBe(Status.DECLINED);
    });

    test('stop method should process the remaining messages', async () => {
      microBatcher.add('test');
      microBatcher.start();
      await microBatcher.stop();
      expect(microBatcher['queue'].length).toBe(0);
    });

    test('stop method can be run asynchronously', async () => {
      microBatcher.start();
      microBatcher.add('test');
      microBatcher.stop();
      await new Promise((resolve) => setTimeout(resolve, microBatcher['config']['maxBatchTime']));
      expect(microBatcher['config'].start).toBe(false);
      expect(microBatcher['queue'].length).toBe(0);
    });
  });

  // see config for results caching tests
  describe('nextBatch method', () => {
    test('nextBatch method should return a batch of messages from the queue', () => {
      for (let i = 0; i < 5; i++) {
        microBatcher.add(`test${i}`);
      }
      const batch = microBatcher['nextBatch']();
      expect(batch?.messages.length).toBe(5);
      expect(microBatcher['queue'].length).toBe(0);
    });

    test('nextBatch should return undefined if there is nothing in the queue', () => {
      const batch = microBatcher['nextBatch']();
      expect(batch).toBe(undefined);
    });
  });

  describe('processBatch method', () => {
    test('processBatch method should process a batch of messages', async () => {
      const batchProcessFnMock = jest.fn(async (batch) => {});
      const microBatcherConfig: MicroBatcherConfigParams<any> = {
        maxBatchSize: 10,
        maxBatchTime: 1000,
        batchProcessFn: batchProcessFnMock,
        start: true,
      };
      const microBatcher = new MicroBatcher(microBatcherConfig);
      microBatcher.add('test');
      const batch = microBatcher['nextBatch']();
      if (!batch) {
        throw new Error(`batch was ${batch}`);
      }
      await microBatcher['processBatch'](batch);
      expect(batchProcessFnMock).toHaveBeenCalledWith(['test']);
    });

    test('processBatch method should update the batch status with RESOLVED if completed successfully', async () => {
      microBatcher.add('test');

      const batch = microBatcher['nextBatch']();
      if (!batch) {
        throw new Error(`batch was ${batch}`);
      }
      await microBatcher['processBatch'](batch);
      const x = microBatcher['batches'][0];
      expect(microBatcher['batches'][0]?.status).toBe(Status.RESOLVED);
    });

    test('processBatch method should update the batch status with REJECTED if errored', async () => {
      const errorBatcher = new MicroBatcher<any>({
        maxBatchSize: 1,
        batchProcessFn: async (batch) => {
          throw new Error();
        },
      });
      errorBatcher.add('test');
      // wait for processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(errorBatcher['batches'][0]?.status).toBe(Status.REJECTED);
    });
  });

  describe('status method', () => {
    test('status can correctly get status after queued (exist in queue not cache)', () => {
      microBatcher.add('test1');
      const { batchId, status } = microBatcher['status']('test1');
      expect(status).toBe(Status.QUEUED);
      expect(batchId).toBeDefined();
    });

    test('status can correctly get status after batch (exist in cache not queue)', async () => {
      const microBatcherConfig: MicroBatcherConfigParams<any> = {
        maxBatchTime: 100,
        batchProcessFn: async (batch: any) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        },
        start: true,
      };
      const microBatcher = new MicroBatcher(microBatcherConfig);
      for (let i = 0; i < 10; i++) {
        microBatcher.add(`test${i}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      const { batchId, status } = microBatcher['status']('test1');
      expect(status).toBe(Status.BATCHED);
      expect(batchId).toBeDefined();
    });

    test('status function can correctly get status after processing (exist in cache not queue)', async () => {
      const microBatcherConfig: MicroBatcherConfigParams<any> = {
        maxBatchTime: 100,
        batchProcessFn: async (batch: any) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        },
        start: true,
      };
      const microBatcher = new MicroBatcher(microBatcherConfig);
      for (let i = 0; i < 10; i++) {
        microBatcher.add(`test${i}`);
      }
      const { batchId, status } = microBatcher['status']('test1');
      expect(status).toBe(Status.BATCHED);
      expect(batchId).toBeDefined();
    });

    test('status cannot return cacheLifespan expired batch', async () => {
      const microBatcherConfig: MicroBatcherConfigParams<any> = {
        maxBatchSize: 10,
        cacheLifespan: 10,
        batchProcessFn: async (batch: any) => {},
        start: true,
      };
      const microBatcher = new MicroBatcher(microBatcherConfig);
      let firstMessage: string = '';
      for (let i = 0; i < 120; i++) {
        const res = microBatcher.add(`test${i}`);
        if (i === 0) {
          firstMessage = `test${i}`;
        }
      }
      const batch = microBatcher.status(firstMessage);
      expect(batch.status).toBe(Status.NOTFOUND);
      expect(batch.batchId).toBeNull();
    });
  });

  describe('batchStatus method', () => {
    test('should return NOTFOUND status for non-existent batchId', () => {
      const status = microBatcher.batchStatus('non-existent-batch-id');
      expect(status?.status).toBe(Status.NOTFOUND);
      expect(status?.batchId).toBeNull();
    });

    test('batchStatus cannot return expired cacheLifespan batch', async () => {
      const microBatcherConfig: MicroBatcherConfigParams<any> = {
        maxBatchSize: 10,
        cacheLifespan: 10,
        batchProcessFn: async (batch: any) => {},
        start: true,
      };
      const microBatcher = new MicroBatcher(microBatcherConfig);
      let firstMessage: string = '';
      for (let i = 0; i < 50; i++) {
        const res = microBatcher.add(`test${i}`);
        if (i === 0) {
          firstMessage = `test${i}`;
        }
      }
      const batch = microBatcher.status(firstMessage);
      expect(batch.batchId).not.toBeNull();
      for (let i = 50; i < 120; i++) {
        microBatcher.add(`test${i}`);
      }
      const batchStatus = microBatcher.batchStatus(batch.batchId as string);
      expect(batchStatus?.status).toBe(Status.NOTFOUND);
      expect(batchStatus?.batchId).toBeNull();
    });

    test('should return correct status for existing batchId', () => {
      const message = 'test-message';
      for (let i = 0; i < 10; i++) {
        microBatcher.add(message + i);
      }
      const status = microBatcher.status('test-message1');
      const batchStatus = microBatcher.batchStatus(status.batchId as string);
      expect(batchStatus?.status).toBe(Status.BATCHED);
      expect(batchStatus?.batchId).toBe(status.batchId);
    });
  });

  describe('messageToKey method', () => {
    test('messageToKey method should convert an object to a string', () => {
      const message = { test: 'test' };
      const stringMessage = microBatcher['messageToKey'](message);
      expect(stringMessage).toBe(JSON.stringify(message));
    });

    // an obsolete test as javascript classes are objects and can be JSON.stringified
    // if a class instance is not stringifiable => expect(stringMessage).toBe(message.toString());

    test('messageToKey method should convert a class instance to a string', () => {
      const input = 'test';

      class TestClass {
        constructor(public test: string) {}

        public toString() {
          return this.test;
        }
      }

      const message = new TestClass(input);
      const stringMessage = microBatcher['messageToKey'](message);
      expect(stringMessage).toBe(JSON.stringify(message));
    });
  });
});
