import { describe, expect, jest, test } from '@jest/globals';
import { MicroBatcher } from '../src/MicroBatcher';
import { uuidv4 } from '../src/util';

describe('MicroBatcher configuration', () => {
  test('maxBatchSize limits the batch size', async () => {
    const batchProcessFnMock = jest.fn(async (batch) => {});
    const microBatcher = new MicroBatcher({
      maxBatchSize: 2,
      maxBatchTime: 250,
      batchProcessFn: batchProcessFnMock,
    });
    microBatcher.add('test1');
    microBatcher.add('test2');
    microBatcher.add('test3');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(batchProcessFnMock).toHaveBeenCalledTimes(2);
  });

  test('maxBatchSize set to 0 does not trigger batch processing', async () => {
    const batchProcessFnMock = jest.fn(async (batch) => {});
    const microBatcher = new MicroBatcher({
      maxBatchSize: 0,
      maxBatchTime: 2000,
      batchProcessFn: batchProcessFnMock,
    });
    for (let i = 0; i < 100; i++) {
      microBatcher.add(`test${i}`);
    }
    expect(batchProcessFnMock).not.toHaveBeenCalled();
  });

  test('maxBatchTime limits the batch time', async () => {
    const batchProcessFnMock = jest.fn(async (batch) => {});
    const microBatcher = new MicroBatcher({
      maxBatchTime: 500,
      batchProcessFn: batchProcessFnMock,
    });
    microBatcher.add('test1');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(batchProcessFnMock).toHaveBeenCalledTimes(1);
  });

  test('maxBatchTime set to 0 does not trigger timer based batch processing', async () => {
    const batchProcessFnMock = jest.fn(async (batch) => {});
    const microBatcher = new MicroBatcher({
      maxBatchTime: 0,
      batchProcessFn: batchProcessFnMock,
    });
    for (let i = 0; i < 3; i++) {
      microBatcher.add(`test${i}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(batchProcessFnMock).not.toHaveBeenCalled();
  });

  test('caches are not cleared if queue is empty', async () => {
    const microBatcher = new MicroBatcher({
      maxBatchTime: 100,
      cacheLifespan: 2,
      batchProcessFn: async () => {},
    });
    microBatcher.add('test');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const status = microBatcher.status('test');
    expect(status.batchId).not.toBeNull();
  });

  test('batchProcessFn is used to process batches', async () => {
    const batchProcessFnMock = jest.fn(async (batch) => {});
    const microBatcher = new MicroBatcher({
      maxBatchTime: 100,
      batchProcessFn: batchProcessFnMock,
    });
    microBatcher.add('test1');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(batchProcessFnMock).toHaveBeenCalledWith(['test1']);
  });

  test('start configuration starts processing immediately', async () => {
    const batchProcessFnMock = jest.fn(async (batch) => {});
    const microBatcher = new MicroBatcher({
      maxBatchTime: 100,
      start: true,
      batchProcessFn: batchProcessFnMock,
    });
    microBatcher.add('test1');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(batchProcessFnMock).toHaveBeenCalledWith(['test1']);
  });

  test("start configuration set to false doesn't start processing immediately", async () => {
    const batchProcessFnMock = jest.fn(async (batch) => {});
    const microBatcher = new MicroBatcher({
      start: false,
      batchProcessFn: batchProcessFnMock,
    });
    microBatcher.add('test1');
    // Wait for a period longer than what was used in the positive test case
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // batchProcessFn should not have been called since start was set to false
    expect(batchProcessFnMock).not.toHaveBeenCalled();
  });

  test('allowDuplicates set to true allows duplicate messages', () => {
    const microBatcher = new MicroBatcher({
      allowDuplicates: true,
      batchProcessFn: async (batch) => {},
    });

    microBatcher.add('test');
    microBatcher.add('test');

    expect(microBatcher['queue'].length).toBe(2);
  });

  test("allowDuplicates set to false doesn't allow duplicate messages", () => {
    const microBatcher = new MicroBatcher({
      allowDuplicates: false,
      batchProcessFn: async (batch) => {},
    });

    microBatcher.add('test');
    microBatcher.add('test');

    expect(microBatcher['queue'].length).toBe(1);
  });

  test('hashFn configuration is applied in messageToKey', () => {
    const hashFn = (message: any) => `hashed_${JSON.stringify(message)}`;
    const microBatcher = new MicroBatcher({
      hashFn: hashFn,
      batchProcessFn: async (batch) => {},
      allowDuplicates: false,
    });

    const message = { test: 'test' };
    const message2 = { test: 'test' };

    microBatcher.add(message);
    microBatcher.add(message2);

    const hashedMessage = microBatcher['messageToKey'](message);
    expect(hashedMessage).toBe(`hashed_${JSON.stringify(message)}`);
    expect(microBatcher['queue'].length).toBe(1);
  });

  test('hashFn configuration is applied in duplicate checking for referential equality', () => {
    const hashFn = (message: any) => {
      return uuidv4();
    };
    const microBatcher = new MicroBatcher({
      hashFn: hashFn,
      batchProcessFn: async (batch) => {},
      allowDuplicates: false,
    });
    const message = { test: 'test' };
    const message2 = { test: 'test' };
    microBatcher.add(message);
    microBatcher.add(message2);
    expect(microBatcher['queue'].length).toBe(2);
  });

  test('cacheLifespan configuration works as expected', () => {
    const cacheLifespan = 3;
    const microBatcher = new MicroBatcher({
      maxBatchSize: 10,
      cacheLifespan: cacheLifespan,
      allowDuplicates: false,
      batchProcessFn: async (batch) => {},
    });
    let resArr = [];
    for (let i = 0; i < 50; i++) {
      resArr.push(microBatcher.add(`Message${i}`));
    }
    //20-29th message should be in the third batch of the cache
    const batchIdWithMessage20 = microBatcher['stringToBatchId'].get('Message20');
    const batchIndexWithMessage20 = microBatcher['batchIdToBatchIndex'].get(batchIdWithMessage20 as string);
    expect(batchIndexWithMessage20).toBe(2);
    //30-39th message should be in the first batch of the cache
    const batchIdWithMessage30 = microBatcher['stringToBatchId'].get('Message30');
    const batchIndexWithMessage30 = microBatcher['batchIdToBatchIndex'].get(batchIdWithMessage30 as string);
    expect(batchIndexWithMessage30).toBe(0);
    //0-9th message should cycled out of cache
    const batchIdWithMessage0 = microBatcher['stringToBatchId'].get('Message0');
    const batchIndexWithMessage0 = microBatcher['batchIdToBatchIndex'].get(batchIdWithMessage0 as string);
    expect(batchIndexWithMessage0).toBeUndefined();
  });
});
