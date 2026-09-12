export const labels = { team: "platform", tier: "gold" };

export function port(n: number) {
  return { containerPort: n, protocol: "TCP" };
}
