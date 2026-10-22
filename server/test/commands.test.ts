import { describe, expect, it } from 'vitest';
import { BadRequest, checkStep, isAllowedCommand } from '../src/commands';

describe('model command boundary', () => {
  it('allows modeling command namespaces and keeps file operations out of the engine batch route', () => {
    for (const id of ['sketch.create', 'solid.extrude', 'mesh.convert', 'parameters.change', 'timeline.inspect', 'model.select', 'edit.apply']) {
      expect(isAllowedCommand(id)).toBe(true);
    }
    for (const id of ['file.open', 'file.export', 'filesystem.delete', 'document.save', 'sketch.export_dxf', 'sketch.insert_dxf', 'sketch.insert_svg', 'sketch.text', 'sketch.edit_text']) {
      expect(isAllowedCommand(id)).toBe(false);
      expect(() => checkStep({ command: id, params: { path: 'C:/private/design.step' } })).toThrow(BadRequest);
    }
  });

  it('requires JSON-object parameters and a dotted command id', () => {
    expect(() => checkStep({ command: 'solid.extrude', params: ['bad'] })).toThrow(/"params" must be an object/);
    expect(() => checkStep({ command: 'solid' })).toThrow(/Command not allowed/);
    expect(checkStep({ command: 'solid.extrude', params: { distance: 10 } })).toEqual({
      command: 'solid.extrude', params: { distance: 10 },
    });
  });
});
