export function down(n: number) {
  return n <= 0 ? 0 : down(n - 1);
}
