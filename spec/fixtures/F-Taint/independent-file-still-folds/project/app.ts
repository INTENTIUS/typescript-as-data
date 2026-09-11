export function classify(n: number) {
  if (n > 0) {
    return "big";
  }
  return "small";
}

export const label = classify(1);
