/** Shared rotation policy for the UI, search and layout validation. */
export const ROTATION_STEP = 10;
export const ANY_ROTATIONS = Array.from({ length: 360 / ROTATION_STEP }, (_, index) => index * ROTATION_STEP);
export const matchesRotations = (actual: readonly number[], expected: readonly number[]) =>
  actual.length === expected.length && actual.every((angle, index) => angle === expected[index]);
export const isFreeRotation = (rotations: readonly number[]) => matchesRotations(rotations, ANY_ROTATIONS);
