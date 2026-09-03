/**
 * Shape check for a fixture captured before an API fix deployed.
 *
 * Every key becomes optional (recursively) so the fields the fix adds may be
 * absent, while the literal still gets excess-property and enum checks for
 * everything that is present. Used only by generated fixture modules whose
 * binding in scripts/generate-fixture-modules.ts carries `pending`.
 */
export type PendingApiFix<T> = T extends (infer U)[]
  ? PendingApiFix<U>[]
  : T extends object
    ? { [K in keyof T]?: PendingApiFix<T[K]> }
    : T;
