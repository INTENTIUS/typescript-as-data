import { Store, Wrap } from "./shapes";

export const s = Store({ name: "a" });
export const w = Wrap({ inner: s.bucket });
