import { useEffect, useState, type ReactNode } from 'react';
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
  extKind: 'extrude' | 'revolve' | 'sweep' | 'loft' | 'rib' | 'pipe' | 'emboss' | null;
  onHole(): void;
  onThread(): void;
  onMove(): void;
  onSplit(): void;
  onMeshConvert(): void;
  onRib(): void;
  onPipe(): void;
  onEmboss(): void;
  onCoil(): void;
  onScale(): void;
  canModify: boolean;
  /** The Modify tool whose dialog is open, if any. */
  modTool: 'fillet' | 'chamfer' | 'presspull' | 'shell' | 'offsetface' | 'draft' | 'hole' | 'thread' | 'mirror' | 'rpattern' | 'cpattern' | 'combine' | 'move' | 'split' | 'scale' | 'coil' | 'meshconv' | null;
  onFillet(): void;
  onChamfer(): void;
  onPressPull(): void;
  onShell(): void;
  onOffsetFace(): void;
  onDraft(): void;
  onCombine(): void;
  onMirror(): void;
  onRPattern(): void;
  onCPattern(): void;
  onTool(t: Tool): void;
  onFinish(): void;
  measuring: boolean;
  onMeasure(): void;
  onSection(): void;
  onImport(): void;
}

function Btn({ icon, label, keyHint, pressed, disabled, onClick, id, tooltip }: { tooltip?: string; icon: ReactNode; label: string; keyHint?: string; pressed?: boolean; disabled?: boolean; onClick(): void; id: string }) {
  return (
    <button className={`rbtn${pressed ? ' on' : ''}`} aria-pressed={pressed} disabled={disabled} title={tooltip ?? (keyHint ? `${label} (${keyHint})` : label)} data-testid={id} onClick={onClick}>
      <span className="ricon">{icon}</span><span className="rlabel">{label}</span>
    </button>
  );
}
function Cbtn({ id, icon, label, tool, p }: { id: string; icon: ReactNode; label: string; tool: Tool; p: Props }) {
  return <button className={`cbtn${p.tool === tool ? ' on' : ''}`} aria-pressed={p.tool === tool} title={label} aria-label={label} data-testid={id} onClick={() => p.onTool(tool)}>{icon}</button>;
}
interface Cmd { pinned?: boolean; tooltip?: string; id: string; icon: ReactNode; label: string; keyHint?: string; pressed?: boolean; disabled?: boolean; onClick(): void }
/** A group of buttons whose title opens a menu listing the same commands (Fusion's CREATE ▾), for the keyboard and for a narrow window. */
function CmdGroup({ title, cmds, open, setOpen }: { title: string; cmds: Cmd[]; open: string | null; setOpen(v: string | null): void }) {
  return (
    <div className="rgroup">
      <div className="rbtns">{cmds.filter((c) => c.pinned).map((c, i) => <span className={`rpin rpin-${i}`} key={c.id}><Btn {...c} /></span>)}</div>
      <div className="rtitle"><button className="rmenu" data-testid={`menu-${title.toLowerCase()}`} aria-haspopup="menu" aria-expanded={open === title} onClick={() => setOpen(open === title ? null : title)}>{title} ▾</button></div>
      {open === title && (
        <div className="rdrop" role="menu" data-testid={`dropdown-${title.toLowerCase()}`}>
          {cmds.map((c) => <button key={c.id} role="menuitem" disabled={c.disabled} data-testid={`item-${c.id}`} onClick={() => { setOpen(null); c.onClick(); }}><span className="ricon sm">{c.icon}</span><span>{c.label}</span>{c.keyHint && <kbd>{c.keyHint}</kbd>}</button>)}
        </div>
      )}
    </div>
  );
}
const Group = ({ title, children }: { title: string; children: ReactNode }) => <div className="rgroup"><div className="rbtns">{children}</div><div className="rtitle">{title}</div></div>;

/** The tabs and toolbar. The SKETCH tab exists only while a sketch is open, as in Fusion. */
export function Ribbon(p: Props) {
  const sketching = p.mode === 'sketch';
  const [tab, setTab] = useState<'solid' | 'mesh'>('solid');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!(e.target as HTMLElement).closest?.('.rdrop, .rmenu')) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('pointerdown', away); window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  const create: Cmd[] = [
    { id: 'btn-sketch', pinned: true, icon: <Icon.sketch />, label: 'Create Sketch', pressed: p.mode === 'pickPlane', onClick: p.onCreateSketch },
    { id: 'btn-extrude', pinned: true, icon: <Icon.extrude />, label: 'Extrude', keyHint: 'E', pressed: p.extKind === 'extrude', onClick: p.onExtrude },
    { id: 'btn-revolve', pinned: true, icon: <Icon.revolve />, label: 'Revolve', pressed: p.extKind === 'revolve', onClick: p.onRevolve },
    { id: 'btn-sweep', icon: <Icon.sweep />, label: 'Sweep', pressed: p.extKind === 'sweep', onClick: p.onSweep },
    { id: 'btn-loft', icon: <Icon.loft />, label: 'Loft', pressed: p.extKind === 'loft', onClick: p.onLoft },
    { id: 'btn-rib', icon: <Icon.rib />, label: 'Rib', pressed: p.extKind === 'rib', disabled: !p.canModify, onClick: p.onRib },
    { id: 'btn-pipe', icon: <Icon.pipe />, label: 'Pipe', pressed: p.extKind === 'pipe', onClick: p.onPipe },
    { id: 'btn-coil', icon: <Icon.coil />, label: 'Coil', pressed: p.modTool === 'coil', onClick: p.onCoil },
    { id: 'btn-emboss', icon: <Icon.emboss />, label: 'Emboss', pressed: p.extKind === 'emboss', onClick: p.onEmboss },
    { id: 'btn-mirror', icon: <Icon.mirror />, label: 'Mirror', pressed: p.modTool === 'mirror', disabled: !p.canModify, onClick: p.onMirror },
    { id: 'btn-rpattern', icon: <Icon.rpattern />, label: 'Rect. Pattern', pressed: p.modTool === 'rpattern', disabled: !p.canModify, onClick: p.onRPattern },
    { id: 'btn-cpattern', icon: <Icon.cpattern />, label: 'Circ. Pattern', pressed: p.modTool === 'cpattern', disabled: !p.canModify, onClick: p.onCPattern },
    { id: 'btn-hole', icon: <Icon.hole />, label: 'Hole', keyHint: 'H', pressed: p.modTool === 'hole', disabled: !p.canHole, onClick: p.onHole },
  ];
  const modify: Cmd[] = [
    { id: 'btn-fillet', pinned: true, icon: <Icon.bFillet />, label: 'Fillet', keyHint: 'F', pressed: p.modTool === 'fillet', disabled: !p.canModify, onClick: p.onFillet },
    { id: 'btn-chamfer', pinned: true, icon: <Icon.bChamfer />, label: 'Chamfer', pressed: p.modTool === 'chamfer', disabled: !p.canModify, onClick: p.onChamfer },
    { id: 'btn-presspull', icon: <Icon.bPressPull />, label: 'Press Pull', keyHint: 'Q', pressed: p.modTool === 'presspull', disabled: !p.canModify, onClick: p.onPressPull },
    { id: 'btn-shell', icon: <Icon.bShell />, label: 'Shell', pressed: p.modTool === 'shell', disabled: !p.canModify, onClick: p.onShell },
    { id: 'btn-offsetface', icon: <Icon.bOffsetFace />, label: 'Offset Face', pressed: p.modTool === 'offsetface', disabled: !p.canModify, onClick: p.onOffsetFace },
    { id: 'btn-draft', icon: <Icon.bDraft />, label: 'Draft', pressed: p.modTool === 'draft', disabled: !p.canModify, onClick: p.onDraft },
    { id: 'btn-combine', icon: <Icon.bCombine />, label: 'Combine', pressed: p.modTool === 'combine', disabled: !p.canModify, onClick: p.onCombine },
    { id: 'btn-move', icon: <Icon.bMove />, label: 'Move / Copy', pressed: p.modTool === 'move', disabled: !p.canModify, onClick: p.onMove },
    { id: 'btn-meshconv', icon: <Icon.bMesh />, label: 'Mesh to Solid', pressed: p.modTool === 'meshconv', disabled: !p.canModify, onClick: p.onMeshConvert },
    { id: 'btn-split', icon: <Icon.bSplit />, label: 'Split Body', pressed: p.modTool === 'split', disabled: !p.canModify, onClick: p.onSplit },
    { id: 'btn-scale', icon: <Icon.bScale />, label: 'Scale', pressed: p.modTool === 'scale', disabled: !p.canModify, onClick: p.onScale },
    { id: 'btn-thread', icon: <Icon.bThread />, label: 'Thread', pressed: p.modTool === 'thread', disabled: !p.canModify, onClick: p.onThread },
  ];
  const inspect: Cmd[] = [
    { id: 'btn-measure', pinned: true, icon: <Icon.bMeasure />, label: 'Measure', keyHint: 'I', pressed: p.measuring, disabled: !p.canModify, onClick: p.onMeasure },
    { id: 'btn-section', icon: <Icon.bSection />, label: 'Section to DXF', disabled: !p.canModify, onClick: p.onSection },
  ];
  const insert: Cmd[] = [
    { id: 'btn-import', pinned: true, icon: <Icon.bImport />, label: 'Import', tooltip: 'Import STEP / IGES / STL / OBJ / 3MF…', onClick: p.onImport },
  ];
  const meshTools: Cmd[] = [
    { id: 'btn-import-mesh', pinned: true, icon: <Icon.bImport />, label: 'Insert Mesh (STL, OBJ, 3MF)…', onClick: p.onImport },
    { id: 'btn-meshconv-mesh', pinned: true, icon: <Icon.bMesh />, label: 'Mesh to Solid', pressed: p.modTool === 'meshconv', disabled: !p.canModify, onClick: p.onMeshConvert },
    { id: 'btn-scale-mesh', pinned: true, icon: <Icon.bScale />, label: 'Scale', pressed: p.modTool === 'scale', disabled: !p.canModify, onClick: p.onScale },
  ];

  const shown = sketching ? 'solid' : tab;
  return (
    <div className="ribbon" data-testid="ribbon">
      <div className="rtabs">
        {(['solid', 'mesh'] as const).map((t) => <button key={t} className={`rtab${!sketching && shown === t ? ' active' : ''}`} data-testid={`tab-${t}`} disabled={sketching} onClick={() => setTab(t)}>{t.toUpperCase()}</button>)}
        {sketching && <button className="rtab active" data-testid="tab-sketch" disabled>SKETCH</button>}
      </div>
      <div className={`rtools${sketching ? " sketch-tools" : " model-tools"}`}>
        {!sketching && shown === 'mesh' ? <CmdGroup title="MESH" cmds={meshTools} open={open} setOpen={setOpen} /> : !sketching ? (
          <>
            <CmdGroup title="CREATE" cmds={create} open={open} setOpen={setOpen} />
            <CmdGroup title="MODIFY" cmds={modify} open={open} setOpen={setOpen} />
            <div className="rspacer" />
            <CmdGroup title="INSPECT" cmds={inspect} open={open} setOpen={setOpen} />
            <CmdGroup title="INSERT" cmds={insert} open={open} setOpen={setOpen} />
          </>
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
