export class TSBatchError extends Error {
  cause: string | undefined;

  constructor(arg: { message: string; cause: string } | Error) {
    super(arg instanceof Error ? arg.message : arg.message);
    this.name = 'TSBatchError';
    this.cause = arg instanceof Error ? undefined : arg.cause;
    Object.assign(this, arg instanceof Error ? arg : { ...arg, name: 'TSBatchError' });
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TSBatchError);
    } else {
      this.stack = new Error().stack;
    }
  }
}
