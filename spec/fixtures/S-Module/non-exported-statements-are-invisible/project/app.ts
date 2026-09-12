let counter = 0;
counter += 1;
if (counter > 0) {
  counter = 2;
}
class Hidden {
  run() {
    return counter;
  }
}
console.log(new Hidden().run());

export const x = { answer: 42 };
