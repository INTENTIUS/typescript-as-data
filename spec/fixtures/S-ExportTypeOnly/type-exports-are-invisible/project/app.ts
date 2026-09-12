type Shape = { sides: number };
interface Named {
  name: string;
}

export type { Shape };
export type Alias = Named;

const square: Shape = { sides: 4 };

export { square, type Named };
export const x = square.sides;
