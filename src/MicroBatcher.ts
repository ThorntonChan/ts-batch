import {TSBatchError} from './TSBatchError';
import {uuidv4} from './util';

/**
 Batched: The message was added to the queue and is waiting to be processed.
 Batched: The message was added to the queue and is currently being processed.
 Resolved: The message has been successfully processed as part of a batch.
 Rejected: The message was batched, but Promise returned by batchProcessFn was rejected.
 Declined: The message was not added to the queue.
 NotFound: The message was not found in the queue or cache.
 **/
export enum Status {
  QUEUED = 'QUEUED',
  BATCHED = 'BATCHED',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
  DECLINED = 'DECLINED',
  NOTFOUND = 'NOTFOUND',
}

/**
 batchProcessFn: The function that will be called to process the batch.
 It should return a Promise and must be provided on initialization.
 hashFn: Optional function that will be called uniquely hash the message. It should return a unique reference.
 maxBatchSize: The maximum number of messages that can be in a batch. Default is 10
 maxBatchTime: The maximum time a batch can be in the queue before it is processed. Default is 10000ms
 cacheLifespan: The number of batching cycles after which a message is forgotten. Default is 100 cycles
 allowDuplicates: Whether to allow duplicate messages in the queue.
 If duplicates are allowed and status is called, it will return the latest batching event.
 Duplicates are determined by strict equality within the Cache. Default is false
 start: Whether the batch processor is accepting new messages. Default is true.
 **/
type MicroBatcherOptionalConfig<T> = {
  hashFn?: (message: T) => string;
  maxBatchSize: number;
  maxBatchTime: number;
  cacheLifespan: number;
  allowDuplicates: boolean;
  start: boolean;
};
export type MicroBatcherConfigParams<T> = Partial<MicroBatcherOptionalConfig<T>> & {
  batchProcessFn: (batch: T[]) => Promise<void>;
};
type MicroBatcherConfig<T> = MicroBatcherOptionalConfig<T> & {
  batchProcessFn: (batch: T[]) => Promise<void>;
};
type Batch<T> = { messages: T[]; batchId: string; status: Status };

export class MicroBatcher<T> {
  private config: MicroBatcherConfig<T> = {
    batchProcessFn: async () => {},
    maxBatchSize: 10,
    maxBatchTime: 10000,
    cacheLifespan: 100,
    allowDuplicates: false,
    start: true,
    hashFn: undefined,
  };
  private queue: T[] = [];
  private readonly batches: (Batch<T> | undefined)[];
  private readonly stringToBatchId: Map<string, string | null> = new Map<string, string | null>();
  private readonly batchIdToBatchIndex: Map<string, number> = new Map<string, number>();
  private currentBatchIndex = 0;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(config: MicroBatcherConfigParams<T>) {
    this.config = {
      ...this.config,
      ...Object.fromEntries(Object.entries(config).filter(([key, value]) => value !== undefined)),
    };
    if (this.config.cacheLifespan < 0 || this.config.maxBatchSize < 0 || this.config.maxBatchTime < 0) {
      throw new TSBatchError({
        message: 'cacheLifespan, maxBatchSize, and maxBatchTime must be greater than 0',
        cause: 'invalid config',
      });
    }
    this.batches = new Array(this.config.cacheLifespan);
    if (!this.config.batchProcessFn) {
      throw new TSBatchError({
        message: 'batchProcessFn is required in config',
        cause: 'invalid config',
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
      if (!this.config.allowDuplicates && this.stringToBatchId.get(this.messageToKey(message)) !== undefined) {
        return { batchId: null, status: Status.DECLINED };
      }
      this.queue.push(message);
      this.stringToBatchId.set(this.messageToKey(message), null);
      if (this.queue.length >= this.config.maxBatchSize) {
        const nextBatch = this.nextBatch();
        if (nextBatch) {
          this.processBatch(nextBatch);
          return { batchId: nextBatch.batchId, status: Status.BATCHED };
        }
      }
      return { batchId: null, status: Status.QUEUED };
    } catch (e) {
      throw new TSBatchError(e as Error);
    }
  }

  /**
   allow the batch processor to accept new messages. and begin processing the queue.
   **/
  public start(): void {
    try {
      this.config.start = true;
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }
      this.intervalId = setInterval(() => {
        const nextBatch = this.nextBatch();
        if (nextBatch) {
          this.processBatch(nextBatch);
        }
      }, this.config.maxBatchTime);
    } catch (e) {
      throw new TSBatchError(e as Error);
    }
  }

  /**
   Stops the batch processor from accepting new messages. New entries will be declined.
   **/
  public async stop(): Promise<void> {
    try {
      this.config.start = false;
      while (this.queue.length !== 0) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      // allow restart
      if (this.config.start === false && this.intervalId) {
        clearInterval(this.intervalId);
      }
    } catch (e) {
      throw new TSBatchError(e as Error);
    }
  }

  /**
   Returns whether the batch processor is currently accepting new messages.
   **/
  public started(): boolean {
    return this.config.start;
  }

  /**
   Returns batchId and status of a message. If the message expired from cache or otherwise nonexistent, batchId will be
   null and status will be NOTFOUND.
   **/
  public status(message: T) {
    try {
      if (!message) {
        return { batchId: null, status: Status.NOTFOUND };
      }
      const batchId = this.stringToBatchId.get(this.messageToKey(message));
      if (batchId === null) {
        return { batchId: null, status: Status.QUEUED };
      }
      if (batchId === undefined) {
        return { batchId: null, status: Status.NOTFOUND };
      }
      const batchIndex = this.batchIdToBatchIndex.get(batchId);
      if (batchIndex === undefined) {
        return { batchId: null, status: Status.NOTFOUND };
      }
      const batch = this.batches[batchIndex];
      if (!batch) {
        return { batchId: null, status: Status.NOTFOUND };
      }
      return {
        batchId: batch.batchId,
        status: batch.status,
      };
    } catch (e) {
      throw new TSBatchError(e as Error);
    }
  }

  /**
   Returns status of a batchId. If the batch is expired from cache or otherwise nonexistent, status will be NOTFOUND.
   **/
  public batchStatus(batchId: string) {
    try {
      if (!batchId) {
        return { batchId: null, status: Status.NOTFOUND };
      }
      const batchIndex = this.batchIdToBatchIndex.get(batchId);
      if (batchIndex === undefined) {
        return { batchId: null, status: Status.NOTFOUND };
      }
      const batch = this.batches[batchIndex];
      if (!batch) {
        return { batchId: null, status: Status.NOTFOUND };
      }
      if (batch) {
        return {
          batchId: batch.batchId,
          status: batch.status,
        };
      }
    } catch (e) {
      throw new TSBatchError(e as Error);
    }
  }

  /**
   Extracts the next batch.
   Synchronous by design. If a new message is added while nextBatch is running,
   the new message will be added to the queue array in the add method.
   However, it will not be included in the current batch being processed by nextBatch.
   **/
  private nextBatch(): Batch<T> | undefined {
    try {
      const currentBatchMessages = this.queue.slice(0, this.config.maxBatchSize);
      if (currentBatchMessages.length) {
        const currentBatchId = uuidv4();
        this.queue = this.queue.slice(this.config.maxBatchSize);
        const currentBatchIndex = this.currentBatchIndex++ % this.config.cacheLifespan;
        // cycle out batch exceeding lifespan
        const cycledBatch = this.batches[currentBatchIndex];
        if (cycledBatch) {
          cycledBatch.messages.forEach((message) => {
            this.stringToBatchId.delete(this.messageToKey(message));
          });
          this.batchIdToBatchIndex.delete(cycledBatch.batchId);
        }
        // add new batch to cache
        currentBatchMessages.forEach((message) => {
          const messageString: string = this.messageToKey(message);
          this.stringToBatchId.set(messageString, currentBatchId);
        });
        this.batchIdToBatchIndex.set(currentBatchId, currentBatchIndex);
        const currentBatch = {
          batchId: currentBatchId,
          status: Status.BATCHED,
          messages: currentBatchMessages,
        };
        this.batches[currentBatchIndex] = currentBatch;
        return currentBatch;
      } else {
        return undefined;
      }
    } catch (e) {
      throw new TSBatchError(e as Error);
    }
  }

  /**
   Runs batchProcessFn on the batch provided. If the Promise is resolved, the batch status is set to RESOLVED.
   If the Promise is rejected, the batch status is set to REJECTED.
   **/
  private async processBatch(batch: Batch<T>): Promise<void> {
    try {
      // execute
      await this.config
        .batchProcessFn(batch.messages)
        .then((result) => {
          batch.status = Status.RESOLVED;
        })
        .catch((error) => {
          batch.status = Status.REJECTED;
        });
    } catch (e) {
      throw new TSBatchError(e as Error);
    }
  }

  /**
   Convert a message to a string, if a message is an Object it will be JSON.stringified. If this fails, it will attempt
   to call .toString() on the message. Limitations to this are described in the Readme. Alternatively, If a hashFn is
   provided, it will be used to hash the message. This can be used to uniquely identify a message or control equality
   checking - If the messageToKey function returns something already in the queue or cache and allowDuplicates is false,
   the message will be DECLINED.
   **/
  private messageToKey(message: T): string | any {
    try {
      if (message === null) {
        return 'null';
      }
      if (message === undefined) {
        return 'undefined';
      }
      if (this.config.hashFn) {
        return this.config.hashFn(message);
      } else if (typeof message === 'object') {
        try {
          return JSON.stringify(message);
        } catch (e) {
          if (message.toString) return message.toString();
        }
      } else if (message.toString) {
        return message.toString();
      } else {
        return message;
      }
    } catch (e) {
      throw new TSBatchError(e as Error);
    }
  }
}
