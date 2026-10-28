/**
 * The general HTTP entry: one guarded outbound operation and its result declarations.
 * Configuration, caller cancellation, timeout and transport failures are diagnosed once by the framework
 * and returned as failures. Success carries a real, fully received Response, including non-2xx.
 */
export * from "./http-contract";
export { request } from "../../modules/http";
