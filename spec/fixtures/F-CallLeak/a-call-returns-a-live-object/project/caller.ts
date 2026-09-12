import { shared } from "./leaky";
import { twice } from "./pure";

export const live = shared();
export const data = twice(21);
