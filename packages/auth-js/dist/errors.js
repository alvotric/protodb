/** Error with a stable machine-readable code. Never carries secrets or tokens. */
export class ProtoDBAuthError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "ProtoDBAuthError";
        this.code = code;
    }
}
