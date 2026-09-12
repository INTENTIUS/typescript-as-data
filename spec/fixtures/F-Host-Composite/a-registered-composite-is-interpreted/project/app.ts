import { Store } from "./store";

export const store = Store({ name: "app" });
export const { logs } = Store({ name: "other" });
