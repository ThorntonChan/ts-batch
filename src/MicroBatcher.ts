import {TSBatchError} from "./TSBatchError";
import {uuidv4} from "./lib";

/**
 batchProcessFn: The function that will be called to process the batch.
 It should return a Promise and must be provided on initialization.
 hashFn: Optional function that will be called uniquely hash the message. It should return a unique reference.
 maxBatchSize: The maximum number of messages that can be in a batch. Default is 10
 maxBatchTime: The maximum time a batch can be in the queue before it is processed. Default is 10000ms
 cacheLifespan: The number of batching cycles after which a message is forgotten. Default is 100 cycles
 allowDuplicates: Whether to allow duplicate messages in the queue.
 Duplicates are determined by strict equality within the Cache. Default is false
 start: Whether the batch processor is accepting new messages. Default is true.
 **/
type Config<T> = Partial<OptionalConfig<T>> & {
  batchProcessFn: (batch: T[]) => Promise<void>;
};
type OptionalConfig<T> = {
  hashFn: (message: T) => string;
  maxBatchSize: number;
  maxBatchTime: number;
  cacheLifespan: number;
  allowDuplicates: boolean;
  start: boolean;
};

/**
 Batched: The message was added to the queue and is waiting to be processed.
 Batched: The message was added to the queue and is currently being processed.
 Resolved: The message has been successfully processed as part of a batch.
 Rejected: The message was batched, but Promise returned by batchProcessFn was rejected.
 Declined: The message was not added to the queue.
 NotFound: The message was not found in the queue or cache.
 **/
enum Status {
  QUEUED = "QUEUED",
  BATCHED = "BATCHED",
  RESOLVED = "RESOLVED",
  REJECTED = "REJECTED",
  DECLINED = "DECLINED",
  NOTFOUND = "NOTFOUND",
}

type BatchProps = { batchId: string; index: number };
type MessageString = string;
type Batch<T> = {
  batchMessages: T[];
  batchId: string;
  batchIndex: number;
};

class MicroBatcher<T> {
  private config: Config<T> = {
    batchProcessFn: undefined,
    maxBatchSize: 10,
    maxBatchTime: 10000,
    cacheLifespan: 100,
    allowDuplicates: false,
    start: true,
    hashFn: undefined,
  };
  private queue: T[] = [];
  private readonly batches: MessageString[][];
  private readonly batchStatus: Status[];
  private readonly stringToBatch: Map<MessageString, BatchProps> = new Map<
    MessageString,
    BatchProps
  >();
  private currentBatchIndex = 0;
  private intervalId: NodeJS.Timeout;

  constructor(config: Config<T>) {
    this.config = { ...this.config, ...config };
    this.batches = new Array(this.config.cacheLifespan);
    this.batchStatus = new Array(this.config.cacheLifespan);
    if (!this.config.batchProcessFn) {
      throw new TSBatchError({
        message: "batchProcessFn is required in config",
        cause: "invalid config",
      });
    }
    if (this.config.start) {
      this.start();
    }
  }

  /**
   Adds a message to the queue to be batched. Null and undefined objects are DECLINED. Further type validation is not included.
   **/
  public add(message: T): { batchId: string | null; status: Status } {
    try {
      if (!this.config.start || message === null || message === undefined) {
        return { batchId: null, status: Status.DECLINED };
      }
      if (
        !this.config.allowDuplicates &&
        this.stringToBatch.get(this.messageToString(message))
      ) {
        return { batchId: null, status: Status.DECLINED };
      }
      this.queue.push(message);
      if (this.queue.length >= this.config.maxBatchSize) {
        this.processBatch();
        this.start();
      }
      return { batchId: null, status: Status.QUEUED };
    } catch (e) {
      throw new TSBatchError(e);
    }
  }

  /**
   allow the batch processor to accept new messages.
   **/
  public start(): void {
    try {
      this.config.start = true;
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }
      this.intervalId = setInterval(() => {
        const nextBatch = this.nextBatch();
        this.processBatch(nextBatch);
      }, this.config.maxBatchTime);
    } catch (e) {
      throw new TSBatchError(e);
    }
  }

  /**
   Stops the batch processor from accepting new messages. New entries will be declined.
   **/
  async stop(): Promise<void> {
    try {
      this.config.start = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }
    } catch (e) {
      throw new TSBatchError(e);
    }
  }

  private nextBatch(): Batch<T> {
    try {
      const currentBatch = this.queue.slice(0, this.config.maxBatchSize);
      const currentBatchId = uuidv4();
      this.queue = this.queue.slice(this.config.maxBatchSize);
      const currentBatchIndex =
        this.currentBatchIndex++ % this.config.cacheLifespan;
      // cycle out batch exceeding lifespan
      if (this.batches[currentBatchIndex]) {
        const cycledBatch: MessageString[] = this.batches[currentBatchIndex];
        cycledBatch.forEach((message) => {
          this.stringToBatch.delete(message);
        });
      }
      // add new batch to cache
      this.batches[currentBatchIndex] = [];
      currentBatch.forEach((message) => {
        const messageString = this.messageToString(message) as MessageString;
        this.stringToBatch.set(messageString, {
          batchId: currentBatchId,
          index: currentBatchIndex,
        });
        this.batches[currentBatchIndex].push(messageString);
      });
      this.batchStatus[currentBatchIndex] = Status.BATCHED;
      return {
        batchMessages: currentBatch,
        batchId: currentBatchId,
        batchIndex: currentBatchIndex,
      };
    } catch (e) {
      throw new TSBatchError(e);
    }
  }

  private async processBatch(batch: Batch<T>): Promise<void> {
    try {
      // execute
      this.config
        .batchProcessFn(batch.batchMessages)
        .then((result) => {
          this.batchStatus[batch.batchIndex] = Status.RESOLVED;
        })
        .catch((error) => {
          this.batchStatus[batch.batchIndex] = Status.REJECTED;
        });
    } catch (e) {
      throw new TSBatchError(e);
    }
  }

  private status(message: T) {
    try {
      const batch = this.stringToBatch.get(this.messageToString(message));
      if (!batch) {
        return { batchId: null, status: Status.NOTFOUND };
      }
      return { batchId: batch.batchId, status: this.batchStatus[batch.index] };
    } catch (e) {
      throw new TSBatchError(e);
    }
  }

  private messageToString(message: T): string | any {
    try {
      if (this.config.hashFn) {
        return this.config.hashFn(message);
      } else if (typeof message === "object") {
        return JSON.stringify(message);
      } else if (message.toString) {
        return message.toString();
      } else {
        return message;
      }
    } catch (e) {
      throw new TSBatchError(e);
    }
  }
}

export default MicroBatcher;
