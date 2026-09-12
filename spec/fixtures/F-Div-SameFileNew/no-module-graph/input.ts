class Bucket { constructor(readonly props: { name: string }) {} }

const base = new Bucket({ name: "base" });

export const wrapper = { inner: base };
