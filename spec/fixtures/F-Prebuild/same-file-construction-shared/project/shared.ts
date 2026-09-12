import { Bucket } from "@tsad/shapes";

const base = new Bucket({ name: "base" });

export const wrapper = { inner: base, twice: [base, base] };
export { base };
