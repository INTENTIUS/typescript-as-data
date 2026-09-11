import { settings } from "./config";

export function ensure(p: number) {
  if (p > 0) {
    return p;
  }
  return 1;
}

export const port = ensure(settings.port);
