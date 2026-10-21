// Commands that are not pinned to the ribbon live in their group's menu (CREATE, MODIFY, INSPECT, INSERT): open it and pick the command.
export async function pick(p, id) {
  const bar = p.getByTestId(id);
  if (await bar.count() && await bar.first().isVisible()) { await bar.first().click(); return; }
  for (const g of ['create', 'modify', 'inspect', 'insert', 'mesh']) {
    await p.getByTestId(`menu-${g}`).click().catch(() => {});
    const it = p.getByTestId(`item-${id}`);
    if (await it.count() && await it.first().isVisible()) { await it.first().click(); return; }
    await p.keyboard.press('Escape');
  }
  throw new Error(`no ribbon command ${id}`);
}

/** Is a command enabled? Reads it from the bar, or from its group's menu when it is not pinned. */
export async function enabled(p, id) {
  const bar = p.getByTestId(id);
  if (await bar.count() && await bar.first().isVisible()) return bar.first().isEnabled();
  for (const g of ['create', 'modify', 'inspect', 'insert', 'mesh']) {
    await p.getByTestId(`menu-${g}`).click().catch(() => {});
    const it = p.getByTestId(`item-${id}`);
    if (await it.count() && await it.first().isVisible()) { const e = await it.first().isEnabled(); await p.keyboard.press('Escape'); return e; }
    await p.keyboard.press('Escape');
  }
  throw new Error(`no ribbon command ${id}`);
}
