import type { ReactNode } from 'react';
import { Icon } from './icons';
import type { Mode, Tool } from './ui';

interface Props {
  mode: Mode;
  tool: Tool | null;
  canHole: boolean;
  onCreateSketch(): void;
  onExtrude(): void;
  onHole(): void;
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
            <Btn id="btn-extrude" icon={<Icon.extrude />} label="Extrude" keyHint="E" pressed={p.mode === 'extrude'} onClick={p.onExtrude} />
            <Btn id="btn-hole" icon={<Icon.hole />} label="Hole" keyHint="H" disabled={!p.canHole} onClick={p.onHole} />
          </Group>
        ) : (
          <>
            <Group title="CREATE">
              <Btn id="tool-line" icon={<Icon.line />} label="Line" keyHint="L" pressed={p.tool === 'line'} onClick={() => p.onTool('line')} />
              <Btn id="tool-rect" icon={<Icon.rect />} label="Rectangle" keyHint="R" pressed={p.tool === 'rect'} onClick={() => p.onTool('rect')} />
              <Btn id="tool-circle" icon={<Icon.circle />} label="Circle" keyHint="C" pressed={p.tool === 'circle'} onClick={() => p.onTool('circle')} />
            </Group>
            <Group title="CONSTRAINTS">
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
