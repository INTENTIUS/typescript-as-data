export function plain(n: number) {
  return { n: n, nested: { deeper: [n, n] } };
}

export const marker = 1;
