export class RpcError extends Error {
  constructor(message: string, name: string, public httpCode: number, cause?: unknown) {
    super(message);
    this.name = name;
    this.cause = cause;
  }
}