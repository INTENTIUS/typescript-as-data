import { Outer } from "./outer";

export const site = Outer({ name: "web" });
export const { main, fixed, side } = Outer({ name: "api" });
