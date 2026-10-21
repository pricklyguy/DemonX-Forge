#!/bin/sh
# Undoes install-launcher.sh: removes the menu entry, the desktop icon and the start-at-login entry. Your designs and settings are not touched.
apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
auto="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
desk="$(xdg-user-dir DESKTOP 2>/dev/null || true)"; [ -d "$desk" ] || desk="$HOME/Desktop"
rm -f "$apps/demonx-forge.desktop" "$auto/demonx-forge.desktop" "$desk/DemonX Forge.desktop"
echo "Done: DemonX Forge is no longer in your menu, on your desktop or in your login programs."
