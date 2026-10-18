// What the browser may ask the engine to do. File and export commands are not allowed here: they need their own checked routes.
import type { CommandStep } from './engine/Engine';

export class BadRequest extends Error {}

/** Commands the browser may send. File and export commands are not here: they need their own checked routes. */
const ALLOWED = /^(sketch|solid|parameters|timeline|model|edit)\.[a-z0-9_.]+$/;

export function checkStep(s: any): CommandStep {
  if (!s || typeof s.command !== 'string' || !ALLOWED.test(s.command)) throw new BadRequest(`Command not allowed: ${String(s?.command).slice(0, 60)}`);
  if (s.params !== undefined && (typeof s.params !== 'object' || s.params === null || Array.isArray(s.params))) throw new BadRequest('"params" must be an object');
  return { command: s.command, params: s.params };
}

