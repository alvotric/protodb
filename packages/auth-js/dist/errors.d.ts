/** Error with a stable machine-readable code. Never carries secrets or tokens. */
export declare class ProtoDBAuthError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
