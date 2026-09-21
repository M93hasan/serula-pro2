import { parts } from './benchmark.mjs';
import { runAdvancedNesting } from '../../frontend/src/nesting/advancedNestingEngine.ts';
import { DEFAULT_NESTING_SETTINGS } from '../../frontend/src/nesting/nestingEngine.ts';
const advanced = runAdvancedNesting(parts, DEFAULT_NESTING_SETTINGS);
console.log(JSON.stringify({ ...advanced, result: { ...advanced.result, placements: undefined } }));
