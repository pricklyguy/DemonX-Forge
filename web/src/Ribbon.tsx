import type { ReactNode } from 'react';
import { Icon } from './icons';
import type { Mode, Tool } from './ui';

interface Props {
  mode: Mode;
  tool: Tool | null;
  canHole: boolean;
  onCreateSketch(): void;
  onExtrude(): void;
  onRevolve(): void;
  onSweep(): void;
  onLoft(): void;
  /** The Extrude-dialog tool that is open, if any. */
  extKind: 'extrude' | 'revolve' | 'sweep' | 'loft' | null;
  onHole(): void;
  canModify: boolean;
  /** The Modify tool whose dialog is open, if any. */
  modTool: 'fillet' | 'chamfer' | 'presspull' | 'shell' | 'mirror' | 'rpattern' | 'cpattern' | null;
  onFillet(): void;
  onChamfer(): void;
  onPressPull(): void;
  onShell(): void;
  onMirror(): void;
  onRPattern(): void;
  onCPattern(): void;
  onTool(t: Tool): void;
  onFinish(): void;
}

function Btn({ icon, label, keyHint, pressed, disabled, onClick, id }: { icon: ReactNode; label: string; keyHint?: string; pressed?: boolean; disabled?: boolean; onClick(): void; id: string }) {
  return (
    <button className={`rbtn${pressed ? ' on' : ''}`} aria-pressed={pressed} disabled={disabled} title={keyHint ? `${label} (${keyHint})` : label} data-testid={id} onClick={onClick}>
      <span className="ricon">{icon}</span><span className="rlabel">{label}</span>
    </button>
  );
}
function Cbtn({ id, icon, label, tool, p }: { id: string; icon: ReactNode; label: string; tool: Tool; p: Props }) {
  return <button className={`cbtn${p.tool === tool ? ' on' : ''}`} aria-pressed={p.tool === tool} title={label} aria-label={label} data-testid={id} onClick={() => p.onTool(tool)}>{icon}</button>;
}
const Group = ({ title, children }: { title: string; children: ReactNode }) => <div className="rgroup"><div className="rbtns">{children}</div><div className="rtitle">{title}</div></div>;

/** The tabs and toolbar. The SKETCH tab exists only while a sketch is open, as in Fusion. */
export function Ribbon(p: Props) {
  const sketching = p.mode === 'sketch';
  return (
    <div className="ribbon" data-testid="ribbon">
      <div className="rtabs">
        <button className={`rtab${!sketching ? ' active' : ''}`} data-testid="tab-solid" disabled>SOLID</button>
        {sketching && <button className="rtab active" data-testid="tab-sketch" disabled>SKETCH</button>}
      </div>
      <div className="rtools">
        {!sketching ? (
          <Group title="CREATE">
            <Btn id="btn-sketch" icon={<Icon.sketch />} label="Create Sketch" pressed={p.mode === 'pickPlane'} onClick={p.onCreateSketch} />
            <Btn id="btn-extrude" icon={<Icon.extrude />} label="Extrude" keyHint="E" pressed={p.extKind === 'extrude'} onClick={p.onExtrude} />
            <Btn id="btn-revolve" icon={<Icon.revolve />} label="Revolve" pressed={p.extKind === 'revolve'} onClick={p.onRevolve} />
            <Btn id="btn-sweep" icon={<Icon.sweep />} label="Sweep" pressed={p.extKind === 'sweep'} onClick={p.onSweep} />
            <Btn id="btn-loft" icon={<Icon.loft />} label="Loft" pressed={p.extKind === 'loft'} onClick={p.onLoft} />
            <Btn id="btn-mirror" icon={<Icon.mirror />} label="Mirror" pressed={p.modTool === 'mirror'} disabled={!p.canModify} onClick={p.onMirror} />
            <Btn id="btn-rpattern" icon={<Icon.rpattern />} label="Rect. Pattern" pressed={p.modTool === 'rpattern'} disabled={!p.canModify} onClick={p.onRPattern} />
            <Btn id="btn-cpattern" icon={<Icon.cpattern />} label="Circ. Pattern" pressed={p.modTool === 'cpattern'} disabled={!p.canModify} onClick={p.onCPattern} />
            <Btn id="btn-hole" icon={<Icon.hole />} label="Hole" keyHint="H" disabled={!p.canHole} onClick={p.onHole} />
          </Group>
        ) : null}
        {!sketching ? (
          <Group title="MODIFY">
            <Btn id="btn-fillet" icon={<Icon.bFillet />} label="Fillet" keyHint="F" pressed={p.modTool === 'fillet'} disabled={!p.canModify} onClick={p.onFillet} />
            <Btn id="btn-chamfer" icon={<Icon.bChamfer />} label="Chamfer" pressed={p.modTool === 'chamfer'} disabled={!p.canModify} onClick={p.onChamfer} />
            <Btn id="btn-presspull" icon={<Icon.bPressPull />} label="Press Pull" keyHint="Q" pressed={p.modTool === 'presspull'} disabled={!p.canModify} onClick={p.onPressPull} />
            <Btn id="btn-shell" icon={<Icon.bShell />} label="Shell" pressed={p.modTool === 'shell'} disabled={!p.canModify} onClick={p.onShell} />
          </Group>
        ) : (
          <>
            <Group title="CREATE">
              <Btn id="tool-line" icon={<Icon.line />} label="Line" keyHint="L" pressed={p.tool === 'line'} onClick={() => p.onTool('line')} />
              <Btn id="tool-rect" icon={<Icon.rect />} label="2-Point Rectangle" keyHint="R" pressed={p.tool === 'rect'} onClick={() => p.onTool('rect')} />
              <Btn id="tool-rectCenter" icon={<Icon.rectCenter />} label="Center Rectangle" pressed={p.tool === 'rectCenter'} onClick={() => p.onTool('rectCenter')} />
              <Btn id="tool-circle" icon={<Icon.circle />} label="Center Circle" keyHint="C" pressed={p.tool === 'circle'} onClick={() => p.onTool('circle')} />
              <Btn id="tool-circle2" icon={<Icon.circle2 />} label="2-Point Circle" pressed={p.tool === 'circle2'} onClick={() => p.onTool('circle2')} />
              <Btn id="tool-arc3" icon={<Icon.arc3 />} label="3-Point Arc" keyHint="A" pressed={p.tool === 'arc3'} onClick={() => p.onTool('arc3')} />
              <Btn id="tool-slot" icon={<Icon.slot />} label="Slot" pressed={p.tool === 'slot'} onClick={() => p.onTool('slot')} />
            </Group>
            <Group title="MODIFY">
              <Btn id="tool-trim" icon={<Icon.trim />} label="Trim" keyHint="T" pressed={p.tool === 'trim'} onClick={() => p.onTool('trim')} />
              <Btn id="tool-extend" icon={<Icon.extend />} label="Extend" pressed={p.tool === 'extend'} onClick={() => p.onTool('extend')} />
              <Btn id="tool-offset" icon={<Icon.offset />} label="Offset" keyHint="O" pressed={p.tool === 'offset'} onClick={() => p.onTool('offset')} />
              <Btn id="tool-fillet" icon={<Icon.fillet />} label="Fillet" pressed={p.tool === 'fillet'} onClick={() => p.onTool('fillet')} />
            </Group>
            <Group title="CONSTRAINTS">
              <div className="cgrid">
                <Cbtn id="tool-horizontal" icon={<Icon.cHoriz />} label="Horizontal/Vertical" tool="horizontal" p={p} />
                <Cbtn id="tool-coincident" icon={<Icon.cCoinc />} label="Coincident" tool="coincident" p={p} />
                <Cbtn id="tool-parallel" icon={<Icon.cParallel />} label="Parallel" tool="parallel" p={p} />
                <Cbtn id="tool-perpendicular" icon={<Icon.cPerp />} label="Perpendicular" tool="perpendicular" p={p} />
                <Cbtn id="tool-tangent" icon={<Icon.cTangent />} label="Tangent" tool="tangent" p={p} />
                <Cbtn id="tool-equal" icon={<Icon.cEqual />} label="Equal" tool="equal" p={p} />
                <Cbtn id="tool-midpoint" icon={<Icon.cMid />} label="Midpoint" tool="midpoint" p={p} />
                <Cbtn id="tool-concentric" icon={<Icon.cConc />} label="Concentric" tool="concentric" p={p} />
                <Cbtn id="tool-fix" icon={<Icon.cFix />} label="Fix / Unfix" tool="fix" p={p} />
              </div>
              <Btn id="tool-dimension" icon={<Icon.dimension />} label="Sketch Dimension" keyHint="D" pressed={p.tool === 'dimension'} onClick={() => p.onTool('dimension')} />
            </Group>
            <div className="rspacer" />
            <Group title="FINISH SKETCH">
              <Btn id="btn-finish" icon={<Icon.finish />} label="Finish Sketch" onClick={p.onFinish} />
            </Group>
          </>
        )}
      </div>
    </div>
  );
}
