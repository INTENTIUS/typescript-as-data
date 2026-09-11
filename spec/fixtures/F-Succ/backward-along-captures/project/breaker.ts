import { registry } from "./shared";

export function guard(r: { name: string }) {
  if (r.name) {
    return r.name;
  }
  return "";
}

export const name = guard(registry);
