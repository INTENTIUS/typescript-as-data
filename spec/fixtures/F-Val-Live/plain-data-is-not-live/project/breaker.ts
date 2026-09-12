import { plain } from "./source";

export function guard(n: number) {
  if (n > 0) {
    return n;
  }
  return 0;
}

export const value = guard(plain(1).n);
