#!/bin/sh
# Adds DemonX Forge to your applications menu and to your desktop, and, if you want, makes it start by itself when you log in.
# Run it again to change your answers; "./uninstall-launcher.sh" undoes all of it. Nothing outside your own home folder is touched.
here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
[ -x "$here/start-forge.sh" ] || { echo "start-forge.sh is not in $here (or not executable: chmod +x start-forge.sh)"; exit 1; }

apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
auto="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
desk="$(xdg-user-dir DESKTOP 2>/dev/null || true)"; [ -d "$desk" ] || desk="$HOME/Desktop"
mkdir -p "$apps"

entry() { # entry <file> <exec arguments> <terminal true|false>
  cat > "$1" <<EOF
[Desktop Entry]
Type=Application
Name=DemonX Forge
Comment=Parametric 3D CAD in your browser, on your own computer
Exec="$here/start-forge.sh"$2
Path=$here
Icon=$here/forge.png
Terminal=$3
Categories=Graphics;Engineering;
StartupNotify=false
EOF
  chmod +x "$1"
}

entry "$apps/demonx-forge.desktop" "" true
echo "Added DemonX Forge to your applications menu."

if [ -d "$desk" ]; then
  entry "$desk/DemonX Forge.desktop" "" true
  gio set "$desk/DemonX Forge.desktop" metadata::trusted true 2>/dev/null || true   # GNOME asks "Allow Launching" once otherwise
  echo "Put an icon on your desktop ($desk). If it shows a gear or a warning, right-click it and choose Allow Launching."
fi

printf "Start DemonX Forge by itself when you log in? [y/N] "
read -r a
case "$a" in
  y|Y|yes|YES)
    printf "Open it in the browser each time too? (y = a computer you sit at, n = one nobody sits at) [Y/n] "
    read -r b
    mkdir -p "$auto"
    case "$b" in n|N|no|NO) args=" nobrowser" ;; *) args="" ;; esac
    entry "$auto/demonx-forge.desktop" "$args" false
    echo "Done: Forge will start by itself the next time you log in (what it says goes to $here/data/forge.log)."
    ;;
  *) rm -f "$auto/demonx-forge.desktop"; echo "Forge will not start by itself." ;;
esac
echo "To undo all of this: $here/uninstall-launcher.sh"
