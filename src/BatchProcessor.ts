class BatchProcessor {
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  printMessage() {
    console.log(this.message);
  }
}

export default BatchProcessor