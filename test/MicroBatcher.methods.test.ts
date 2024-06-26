import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MicroBatcher, MicroBatcherConfig, Status } from "../src/MicroBatcher";

describe("MicroBatcher methods unit tests", () => {
  let microBatcher: MicroBatcher<any>;

  beforeEach(() => {
    const microBatcherConfig: MicroBatcherConfig<any> = {
      maxBatchSize: 10,
      maxBatchTime: 1000,
      batchProcessFn: async (batch) => {},
      start: true,
    };
    microBatcher = new MicroBatcher(microBatcherConfig);
  });
  describe("add method", () => {
    test("add method should add message to the queue and return QUEUED", () => {
      const res = microBatcher.add("test");
      expect(microBatcher["queue"]).toContain("test");
      expect(res.status).toBe(Status.QUEUED);
    });

    test("add method should reject null and undefined to the queue", () => {
      const nullRes = microBatcher.add(null);
      const undefRes = microBatcher.add(undefined);
      expect(microBatcher["queue"].length).toBe(0);
      expect(nullRes.status).toBe(Status.DECLINED);
      expect(undefRes.status).toBe(Status.DECLINED);
    });

    test("add method should process a batch when the maxBatchSize is Reached", () => {
      let res;
      for (let i = 0; i < 10; i++) {
        res = microBatcher.add(`test${i}`);
      }
      expect(microBatcher["queue"].length).toBe(0);
      expect(res.status).toBe(Status.BATCHED);
    });

    test("Consecutive/async high speed adding should be supported without synchronicity issues", async () => {
      const maxBatchSize = 10;
      const microBatcherConfig: MicroBatcherConfig<any> = {
        maxBatchSize: maxBatchSize,
        maxBatchTime: 1000,
        batchProcessFn: async (batch) => {},
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
        expect(microBatcher["batches"][i].length).toBe(maxBatchSize);
      }
    });
  });

  describe("start method", () => {
    test("start method should start the batch processor", () => {
      microBatcher.start();
      expect(microBatcher["config"].start).toBe(true);
      expect(microBatcher["intervalId"]).toBeDefined();
    });
  });

  describe("stop method", () => {
    test("stop method should stop the batch processor", async () => {
      microBatcher.start();
      await microBatcher.stop();
      expect(microBatcher["config"].start).toBe(false);
    });

    test("stop method should stop the batch processor", async () => {
      microBatcher.start();
      await microBatcher.stop();
      const res = microBatcher.add("test");
      expect(res.status).toBe(Status.DECLINED);
    });

    test("stop method should process the remaining messages", async () => {
      microBatcher.add("test");
      microBatcher.start();
      await microBatcher.stop();
      expect(microBatcher["queue"].length).toBe(0);
    });

    test("stop method can be run asynchronously", async () => {
      microBatcher.start();
      microBatcher.add("test");
      microBatcher.stop();
      await new Promise((resolve) =>
        setTimeout(resolve, microBatcher["config"]["maxBatchTime"]),
      );
      expect(microBatcher["config"].start).toBe(false);
      expect(microBatcher["queue"].length).toBe(0);
    });
  });

  // see config for results caching tests
  describe("nextBatch method", () => {
    test("nextBatch method should return a batch of messages from the queue", () => {
      for (let i = 0; i < 5; i++) {
        microBatcher.add(`test${i}`);
      }
      const batch = microBatcher["nextBatch"]();
      expect(batch.batchMessages.length).toBe(5);
      expect(microBatcher["queue"].length).toBe(0);
    });

    test("nextBatch should return undefined if there is nothing in the queue", () => {
      const batch = microBatcher["nextBatch"]();
      expect(batch).toBe(undefined);
    });
  });

  describe("processBatch method", () => {
    test("processBatch method should process a batch of messages", async () => {
      const batchProcessFnMock = jest.fn(async (batch) => {});
      const microBatcherConfig: MicroBatcherConfig<any> = {
        maxBatchSize: 10,
        maxBatchTime: 1000,
        batchProcessFn: batchProcessFnMock,
        start: true,
      };
      const microBatcher = new MicroBatcher(microBatcherConfig);
      const batch = {
        batchMessages: ["test"],
        batchId: "test-id",
        batchIndex: 0,
      };
      await microBatcher["processBatch"](batch);
      expect(batchProcessFnMock).toHaveBeenCalledWith(["test"]);
    });

    test("processBatch method should update the batch status with RESOLVED if completed scucessfully", async () => {
      const batch = {
        batchMessages: ["test"],
        batchId: "test-id",
        batchIndex: 0,
      };
      await microBatcher["processBatch"](batch);
      expect(microBatcher["batchStatus"][0]).toBe(Status.RESOLVED);
    });

    test("processBatch method should update the batch status with REJECTED if errored", async () => {
      const errorBatcher = new MicroBatcher<any>({
        maxBatchSize: 1,
        batchProcessFn: async (batch) => {
          throw new Error();
        },
      });
      errorBatcher.add("test");
      // wait for processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(errorBatcher["batchStatus"][0]).toBe(Status.REJECTED);
    });
  });

  describe("status method", () => {
    test("status can correctly get status after queued (exist in queue not cache)", () => {
      microBatcher.add("test1");
      const { batchId, status } = microBatcher["status"]("test1");
      expect(status).toBe(Status.QUEUED);
      expect(batchId).toBeDefined();
    });

    test("status can correctly get status after batch (exist in cache not queue)", () => {
      for (let i = 0; i < 10; i++) {
        microBatcher.add(`test${i}`);
      }
      const { batchId, status } = microBatcher["status"]("test1");
      expect(status).toBe(Status.BATCHED);
      expect(batchId).toBeDefined();
    });

    test("status can correctly get status after processing (exist in cache not queue)", async () => {
      for (let i = 0; i < 10; i++) {
        microBatcher.add(`test${i}`);
      }
      const { batchId, status } = microBatcher["status"]("test1");
      //await processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(status).toBe(Status.BATCHED);
      expect(batchId).toBeDefined();
    });

    test("status NOTFOUND is returned if message does (not exist in cache or queue)", async () => {
      const { batchId, status } = microBatcher["status"]("test1");
      expect(status).toBe(Status.NOTFOUND);
      expect(batchId).toBeNull();
    });
  });

  describe("messageToKey method", () => {
    test("messageToKey method should convert an object to a string", () => {
      const message = { test: "test" };
      const stringMessage = microBatcher["messageToKey"](message);
      expect(stringMessage).toBe(JSON.stringify(message));
    });

    // an obsolete test as javascript classes are objects and can be JSON.stringified
    // if a class instance is not stringifiable => expect(stringMessage).toBe(message.toString());

    test("messageToKey method should convert a class instance to a string", () => {
      const input = "test";

      class TestClass {
        constructor(public test: string) {}

        public toString() {
          return this.test;
        }
      }

      const message = new TestClass(input);
      const stringMessage = microBatcher["messageToKey"](message);
      expect(stringMessage).toBe(JSON.stringify(message));
    });
  });
});