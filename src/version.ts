/**
 * SDK version, inlined from package.json at build time (tsup `define`) and
 * at test time (vitest `define`). package.json is the single source.
 */
declare const __NOPE_SDK_VERSION__: string;

export const SDK_VERSION: string = __NOPE_SDK_VERSION__;

/** User-Agent header sent on every request. */
export const USER_AGENT = `nope-node/${SDK_VERSION}`;
