export type Patch<T, U> = Omit<T, keyof U> & U
