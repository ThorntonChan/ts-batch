# ts-batch

`ts-batch` is a simple and configurable tool designed to process messages in batches. It uses JavaScript's native Maps
as its built-in cache, providing efficient and fast operations.

## Installation

You can install `ts-batch` using your package manager. First, make sure you have [Node.js](https://nodejs.org/)
installed on your machine. Then, open your terminal and run the following command:

```bash
npm install ts-batch
yarn add ts-batch
```

In your project file, you can import `ts-batch` using the following syntax:

```typescript
const {MicroBatcher} = require('ts-batch');
import {MicroBatcher} from 'ts-batch';
```

## Configuration Options

When creating a new instance of `MicroBatcher`, you can provide a configuration object with the following properties:

- `batchProcessFn`: **REQUIRED** A function that will be called to process each batch of messages.
- `maxBatchSize`: The maximum number of messages that can be included in a batch. Default is `10`.
  If set to `0`, the batch will be not be processed until the next MaxBatchTime interval (this is not recommended,
  as it can lead to memory issues if throughput is too high).
- `maxBatchTime`: The maximum amount of time (in milliseconds) that a batch can wait before being processed. Default
  is `10000`. If set to `0`, the batch will be not be processed until MaxBatchSize is reached.
- `start`: A boolean indicating whether the `MicroBatcher` should accept and start processing batches immediately after
  instantiation. Default is `true`.
- `allowDuplicates`: A boolean indicating whether duplicate messages are allowed in the queue. Default is `false`.
- `hashFn`: A user-defined function to hash the messages. If not provided, objects and classes are converted to a string
  for hashing.

## Example Usage:

### Instantiation

```typescript
// microbatcher will accept any type
const anyMicroBatcher = new MicroBatcher(microBatcherConfig);

// microbatcher will accept Record<string, string> with the following configs
const recordMicroBatcher = new MicroBatcher<Record<string, string>>({
  maxBatchSize: 10,
  maxBatchTime: 1000,
  batchProcessFn: async (batch) => {
  },
  start: true,
  allowDuplicates: false,
  hashFn: (message) => { /* adjust allowDuplicates and hashFn for desired equality checking */
  },
});
```

### Adding to queue

```typescript
// res will be { batchId: string, status: 'QUEUED' | 'BATCHED' | 'DECLINED' }.
// Null and undefined objects are DECLINED. Further type validation is not included and should be done by the user app.
const res = microBatcher.add(message);
```

### Get status of a message

```typescript
// see valid statuses below
const status = microBatcher.status(message);
```

| Status     | Description                                                                   |
|------------|-------------------------------------------------------------------------------|
| Batched    | The message was added to the queue and is waiting to be processed.            |
| Processing | The message was added to the queue and is currently being processed.          |
| Resolved   | The message has been successfully processed as part of a batch.               |
| Rejected   | The message was batched, but Promise returned by batchProcessFn was rejected. |
| Declined   | The message was not added to the queue.                                       |
| NotFound   | The message was not found in the queue or cache.                              |

### Stopping the MicroBatcher

```typescript
microBatcher.stop(); // finishes processing all batches and stops the MicroBatcher, rejecting all new messages.
await microBatcher.stop(); // use await to wait for all batches to finish processing.
```

## Limitations

As this project is designed to be a simple and quick tool, it has some limitations:

- Javascript native "collections" are referential. To circumvent this, objects and classes are converted to a JSON
  string (via `JSON.stringify`) before being used as a key. This is neither true strict or true referential equality.
  Tight equality checks can be achieved by providing a user-defined `hashFn`. Classes can also provide a `toString()`
  method or override a `toJSON()` method to return a string representation of the class instance.
    - **Undefined values:** Object conversion to string converts undefined to 'NULL'
    - **Circular References:** JSON.stringify() will throw an error when there are circular references in the object. A
      circular reference occurs when an object property refers to the object itself.
    - **Non-enumerable Properties:** JSON.stringify() only serializes enumerable properties. So, if an object has
      non-enumerable properties, they will be ignored.
    - **Undefined, function, and symbol:** If these types are encountered as properties in the object during
      stringification, they are omitted from the resulting JSON string.
    - **BigInt values:** JSON.stringify() will throw an error when a BigInt value is encountered.
    - **Date objects:** Date objects will be converted to their equivalent ISO string representation.
    - **NaN and Infinity:** These numeric values are serialized into null.
    - **Sparse Arrays:** Sparse arrays will be serialized with null in the place of missing items.
    - **Prototype chain:** Only the object's own enumerable properties are serialized. Properties in the prototype chain
      won't be included.

## Potential Optimizations

- **Improve Hashing Mechanism:** The current implementation uses JSON.stringify() for hashing, which has several
  limitations. A more sophisticated hashing mechanism could be implemented to handle edge cases better and improve
  performance.
- **Batch Processing Optimization:** Currently, the batch processing function is called for each batch. Depending on the
  nature of the processing function, it might be more efficient to process multiple batches at once or to use a
  different scheduling algorithm.
- **Configurable Retry Mechanism:** In case of a failure in the batchProcessFn, a retry mechanism could be beneficial.
  This could be made configurable to allow the user to specify the number of retries and the delay between retries.
- **Memory Management:** The current implementation keeps all batches in memory until they are processed. Depending on
  the size of the batches and the processing time, this could lead to high memory usage. Implementing a mechanism to
  offload batches to disk or a database could help manage memory usage.
- **Individual message results:** The current implementation only provides a status for each message. It might be useful
  to provide more detailed information about the processing of each message, such as the result of the processing
  function or any errors that occurred. Implementing with a batchProcessFn that accepts a Message instead of
  MessageArray, complemented with a Promise.settleAll() would allow for this.
- **Extend cacheLifespan:** Current Implementation only allows for a maxBatchTime to be provided in cycles. This is for
  quick and easy calculation of expected memory usage. (cached memory
  usage = `O((bytes(Message) + bytes(Message.toString())) *maxBatchSize * cacheLifespan)`). Extending this to allow for
  a cacheLifespan to be provided in milliseconds would allow for better control over cache lifecycle.
- **Maximum bandwidth:** Due to the nature of Javascript as a single-threaded language, the maximum bandwidth of the
  system is limited by the processing power of the system. Implementing a multi-threaded system could help increase the
  maximum bandwidth of the system, but will introduce concurrency issues.

## Contributing

Contributions are welcome! Please feel free to submit a pull request at https://github.com/ThorntonChan/ts-batch

## License

`ts-batch` is [MIT licensed](./LICENSE).