// What the browser may ask the engine to do. File and export commands are not allowed here: they need their own checked routes.
import type { CommandStep } from './engine/Engine';

export class BadRequest extends Error {}

/** Commands the browser may send. File and export commands are not here: they need their own checked routes. */
const ALLOWED = /^(sketch|solid|mesh|parameters|timeline|model|edit)\.[a-z0-9_.]+$/;
// These engine commands can read or write paths (or read a font by path). File access goes
// through Forge's checked upload/download routes instead of the generic modeling endpoint.
// Keep this list explicit: some engine versions expose file operations outside `file.*`.
const FILE_COMMANDS = new Set([
  'sketch.export_dxf', 'sketch.insert_dxf', 'sketch.insert_svg', 'sketch.text', 'sketch.edit_text',
  'parameters.export', 'parameters.import', 'timeline.export_script',
  // Defense in depth for newer engine command namespaces.
  'component.insert_design', 'component.update_links', 'component.relink',
]);

/** Whether the browser (and an AI client) may run this command. */
export const isAllowedCommand = (id: string) => ALLOWED.test(id) && !FILE_COMMANDS.has(id);

export function checkStep(s: any): CommandStep {
  if (!s || typeof s.command !== 'string' || !isAllowedCommand(s.command)) throw new BadRequest(`Command not allowed: ${String(s?.command).slice(0, 60)}`);
  if (s.params !== undefined && (typeof s.params !== 'object' || s.params === null || Array.isArray(s.params))) throw new BadRequest('"params" must be an object');
  return { command: s.command, params: s.params };
}

