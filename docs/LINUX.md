DEMONX FORGE FOR LINUX
======================

DemonX Forge is a 3D design (CAD) program that runs in your web browser, on your own computer. Nothing goes to the cloud.
You sketch, extrude, fillet, drill, pattern and more, on an editable timeline. See README.md in the project for everything it does.

You need: a 64-bit Linux computer (x86-64) with a reasonably recent system (Ubuntu 22.04 or newer, Debian 12, Fedora 36, Linux Mint 21 or the like)
and a web browser. About 300 MB of disk. You do NOT need to install Node or anything else: it is all in the folder.
(Raspberry Pi and other ARM computers are not supported yet.)


1. GET IT
---------
From the project's Releases page on GitHub, download  DemonX-Forge-<version>-linux-x64.tar.gz .
(If you got it from the "Actions" tab instead: the download is a .zip with the .tar.gz inside it. Unzip that first.)


2. INSTALL
----------
Open a terminal in the folder you downloaded it to and type these two lines. The second one makes the folder  DemonX-Forge  in your home folder:

    cd ~
    tar -xzf ~/Downloads/DemonX-Forge-*-linux-x64.tar.gz

(Change ~/Downloads if you saved it somewhere else. You can put the folder anywhere you like; just do not move it later without
running  ./install-launcher.sh  again.)


3. START IT
-----------
    cd ~/DemonX-Forge
    ./start-forge.sh

A few seconds later your browser opens Forge. If it does not, open  http://127.0.0.1:8120  by hand.
Leave the terminal window open while you use Forge. Press Ctrl+C in it, or close it, to stop Forge.

"Permission denied"? Type  chmod +x start-forge.sh install-launcher.sh uninstall-launcher.sh  and try again.


4. A MENU ENTRY AND A DESKTOP ICON
----------------------------------
    cd ~/DemonX-Forge
    ./install-launcher.sh

It adds "DemonX Forge" to your applications menu and puts an icon on your desktop. It then asks:

    Start DemonX Forge by itself when you log in? [y/N]
    Open it in the browser each time too? [Y/n]

- Answer  y  to the first to have Forge start in the background every time you log in. Answer  y  to the second on a computer you sit at
  (Forge opens in your browser); answer  n  if you would rather open it yourself from the icon.
- When Forge starts at login there is no window, so what it says goes to  ~/DemonX-Forge/data/forge.log .
- On GNOME the desktop icon may show a gear or a warning the first time: right-click it and choose "Allow Launching".
- Run  ./install-launcher.sh  again to change your answers. Run  ./uninstall-launcher.sh  to remove the menu entry, the icon and the login start.
  Your designs and settings are not touched.


5. FIRST THINGS TO TRY
----------------------
- Press "Load the demo bracket" for a part to look at. Mouse: the wheel zooms, the middle button pans, Shift + middle button orbits.
- Make a part from nothing: Create Sketch, click the blue square on the floor (the XY plane), press R, click two corners, press E, click the
  shaded shape, type a distance, press OK. Ctrl+Z undoes. Press ? for every key.
- Save with File > Save (Ctrl+S). Forge files end in .forge. Chrome and Chromium give you a normal file window; Firefox downloads the file to your
  Downloads folder.
- File > Import brings in STEP, IGES, STL, OBJ and 3MF files. An STL becomes a mesh; "Mesh to Solid" (MODIFY tab) turns a mechanical part into real,
  editable sketches and extrudes.
- Letting an AI use Forge: see "CONNECT AN AI (MCP).txt" (on Linux the command to give it is  ~/DemonX-Forge/node/node ~/DemonX-Forge/launcher.mjs mcp ).


6. UPDATING
-----------
Forge checks for a newer version about once a day and shows an Update button in its header. On Linux the button opens the release notes and the
download page: update by hand. Close Forge, download the new  .tar.gz , and extract it over the old folder the same way as in step 2
(answer yes if it asks to overwrite). Your settings are in the  data  folder, which the download does not contain, so they stay.
(Update now, which does this by itself, works on Windows only for now.)


7. IF SOMETHING GOES WRONG
--------------------------
- The page says the modelling engine was not found, or it will not start: check that  ~/DemonX-Forge/versions/<number>/engine/solidcraft-cli  exists and is
  executable (the number is the one in current.txt).
- A message about "GLIBC" or "version not found": the system is older than the program needs. Use Ubuntu 22.04 or newer.
- "Port 8120 is in use": another copy of Forge is running. Close it, or use another port:  FORGE_PORT=8121 ./start-forge.sh
- The browser did not open by itself: your system has no  xdg-open . Open  http://127.0.0.1:8120  yourself.
- It started at login but is not there: look at  ~/DemonX-Forge/data/forge.log .
- Forge answers only this computer (127.0.0.1) on purpose: another computer on your network cannot open it.


8. WHAT IS IN THE FOLDER
------------------------
  start-forge.sh            starts Forge (with "nobrowser" it does not open the browser)
  install-launcher.sh       menu entry, desktop icon, start at login (uninstall-launcher.sh undoes it)
  launcher.mjs, current.txt what start-forge.sh runs: it starts the version current.txt names
  versions/<number>/app     Forge itself, one folder per version
  versions/<number>/engine  the modelling engine, SolidCraft (MIT or Apache-2.0 licence), with its licence texts in licences/
  node/                     its own copy of Node (the program that runs it), with its licence
  data/                     your settings, and forge.log when it starts at login. Nothing else of yours is in the program folders.
  LICENSE                   Forge's own licence (GPL-3.0-or-later)

Parts you make leave Forge as STEP, STL, 3MF, OBJ or DXF files (File > Export).


9. RUNNING FROM THE SOURCE (for developers)
-------------------------------------------
You need Node 20 or newer and the engine. Get the source with git, then:

    npm install
    npm run build
    FORGE_ENGINE=/path/to/solidcraft-cli npm start     # http://127.0.0.1:8120

The engine is built from SolidCraft's source at the commit named in engine/SOLIDCRAFT_REF (Rust: `cargo build --release -p solidcraft-cli`, 20 to 40
minutes the first time). The package above already has it built.
