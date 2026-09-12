import policy from "./policy";

export const doubled = { ...policy, replicas: policy.replicas * 2 };
