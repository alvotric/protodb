/** Error with a stable machine-readable code. Never carries secrets or tokens. */
export class ProtoDBAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProtoDBAuthError";
    this.code = code;
  }
}
