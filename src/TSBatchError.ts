export class TSBatchError extends Error {
  constructor(arg: { message: string; cause: string } | Error) {
    super();
    Object.assign(this, arg instanceof Error ? arg : { ...arg, name: 'TSBatchError' });
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TSBatchError);
    } else {
      this.stack = (new Error()).stack;
    }
  }
}