import { describe, expect, jest, test } from "@jest/globals";
import { MicroBatcher } from "../src/MicroBatcher";
import { uuidv4 } from "../src/util";

describe("MicroBatcher configuration", () => {
  test("maxBatchSize limits the batch size", async () => {
    const batchProcessFnMock = jest.fn(async (batch) => {});
    const microBatcher = new MicroBatcher({
      maxBatchSize: 2,
      maxBatchTime: 250,
      batchProcessFn: batchProcessFnMock,
    });
    microBatcher.add("test1");
    microBatcher.add("test2");
    microBatcher.add("test3");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(batchProcessFnMock).toHaveBeenCalledTimes(2);
  });

  test("maxBatchTime limits the batch time", async () => {
    const batchProcessFnMock = jest.fn(async (batch) => {});
    const microBatcher = new MicroBatcher({
      maxBatchTime: 500,
      batchProcessFn: batchProcessFnMock,
    });
    microBatcher.add("test1");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(batchProcessFnMock).toHaveBeenCalledTimes(1);
  });

  test("batchProcessFn is used to process batches", async () => {
    const batchProcessFnMock = jest.fn(async (batch) => {});
    const microBatcher = new MicroBatcher({
      maxBatchTime: 100,
      batchProcessFn: batchProcessFnMock,
    });
    microBatcher.add("test1");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(batchProcessFnMock).toHaveBeenCalledWith(["test1"]);
  });

  test("start configuration starts processing immediately", async () => {
    const batchProcessFnMock = jest.fn(async (batch) => {});
    const microBatcher = new MicroBatcher({
      maxBatchTime: 100,
      start: true,
      batchProcessFn: batchProcessFnMock,
    });
    microBatcher.add("test1");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(batchProcessFnMock).toHaveBeenCalledWith(["test1"]);
  });

  test("start configuration set to false doesn't start processing immediately", async () => {
    const batchProcessFnMock = jest.fn(async (batch) => {});
    const microBatcher = new MicroBatcher({
      start: false,
      batchProcessFn: batchProcessFnMock,
    });
    microBatcher.add("test1");
    // Wait for a period longer than what was used in the positive test case
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // batchProcessFn should not have been called since start was set to false
    expect(batchProcessFnMock).not.toHaveBeenCalled();
  });

  test("allowDuplicates set to true allows duplicate messages", () => {
    const microBatcher = new MicroBatcher({
      allowDuplicates: true,
      batchProcessFn: async (batch) => {},
    });

    microBatcher.add("test");
    microBatcher.add("test");

    expect(microBatcher["queue"].length).toBe(2);
  });

  test("allowDuplicates set to false doesn't allow duplicate messages", () => {
    const microBatcher = new MicroBatcher({
      allowDuplicates: false,
      batchProcessFn: async (batch) => {},
    });

    microBatcher.add("test");
    microBatcher.add("test");

    expect(microBatcher["queue"].length).toBe(1);
  });

  test("hashFn configuration is applied in messageToKey", () => {
    const hashFn = (message: any) => `hashed_${JSON.stringify(message)}`;
    const microBatcher = new MicroBatcher({
      hashFn: hashFn,
      batchProcessFn: async (batch) => {},
      allowDuplicates: false,
    });

    const message = { test: "test" };
    const message2 = { test: "test" };

    microBatcher.add(message);
    microBatcher.add(message2);

    const hashedMessage = microBatcher["messageToKey"](message);
    expect(hashedMessage).toBe(`hashed_${JSON.stringify(message)}`);
    expect(microBatcher["queue"].length).toBe(1);
  });

  test("hashFn configuration is applied in duplicate checking for referential equality", () => {
    const hashFn = (message: any) => {
      return uuidv4();
    };
    const microBatcher = new MicroBatcher({
      hashFn: hashFn,
      batchProcessFn: async (batch) => {},
      allowDuplicates: false,
    });
    const message = { test: "test" };
    const message2 = { test: "test" };
    microBatcher.add(message);
    microBatcher.add(message2);
    expect(microBatcher["queue"].length).toBe(2);
  });

  test("cacheLifespan configuration works as expected", () => {
    const cacheLifespan = 3;
    const microBatcher = new MicroBatcher({
      maxBatchSize: 10,
      cacheLifespan: cacheLifespan,
      allowDuplicates: false,
      batchProcessFn: async (batch) => {},
    });
    let resArr = [];
    for (let i = 0; i < 50; i++) {
      resArr.push(microBatcher.add(`test${i}`));
    }
    //20-29th message should be in the third batch of the cache
    const batchWithtest20 = microBatcher["stringToBatch"].get("test20");
    expect(batchWithtest20.index).toBe(2);
    //30-39th message should be in the first batch of the cache
    const batchWithtest30 = microBatcher["stringToBatch"].get("test30");
    expect(batchWithtest30.index).toBe(0);
    //0-9th message should cycled out of cache
    const batchWithtest0 = microBatcher["stringToBatch"].get("test0");
    expect(batchWithtest0).toBeUndefined();
  });
});
