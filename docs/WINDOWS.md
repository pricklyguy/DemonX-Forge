DEMONX FORGE FOR WINDOWS
========================

DemonX Forge is a 3D design (CAD) program that runs in your web browser, on your own computer. Nothing goes to the cloud.
It is early: you can sketch (line, rectangle, circle, dimensions) and extrude, cut or join. Fillet (F) and Chamfer round or bevel the edges of a body: hover an edge, click it, type a size, OK. Press Pull (Q) pushes or pulls a face: click the face, type a distance (negative cuts), OK. Shell hollows a body: click the face(s) to leave open, type the wall thickness, OK. Revolve turns a sketch profile about an axis (finish the sketch, press Revolve, choose the axis and angle). Mirror and the two Patterns copy a whole body (click it, choose the plane or direction and counts). Offset Face moves flat faces in or out, Draft tilts walls about a neutral plane, Combine joins, cuts or intersects bodies. Hole (H) opens a dialog (position, diameter, depth, counterbore or countersink); double-click a hole in the timeline to change it. Move / Copy, Split Body, Thread and Rib are in the same tabs. File > Import STEP / IGES adds a part made elsewhere. File > Export > Section through a body saves a cut through the part as a DXF (pick the plane and where to cut). Double-click a Fillet, Chamfer, Shell, Offset Face or Draft in the timeline to change its number. Scale, Coil, Pipe and Emboss are in the same tabs. In Press Pull and Extrude you can also drag the arrow in the view to set the distance. To hand a face to DemonX Design: click a flat face, then File > Export > Selected face (a DXF of its outline and holes). Sweep carries a profile along a path drawn in another sketch; Loft joins profiles from two or more sketches (click one profile in each).

You need: Windows 10 or 11 (64-bit) and a web browser.
You do NOT need to install Node, Rust or anything else: it is all in this folder.


1. INSTALL
----------
a. Right-click the zip file you downloaded, choose Properties. If you see an "Unblock" box at the bottom, tick it and
   press OK. (Windows marks files downloaded from the internet as untrusted.)
b. Right-click the zip, choose "Extract All...". When it asks where, type  C:\  and press Extract.
   That gives you the folder  C:\DemonX-Forge  . (Do not run it from inside the zip.)
c. Open  C:\DemonX-Forge  and double-click  "Start DemonX Forge.bat".
d. For an icon on your desktop, double-click  "Create Desktop Shortcut.bat"  once. After that, double-click the icon to start Forge.


2. FIRST START
--------------
- A black window opens (leave it open: closing it stops Forge) and your browser opens Forge after a few seconds.
  If the page does not open by itself, type  http://127.0.0.1:8120  into your browser.
- "Windows protected your PC" (SmartScreen)? Press "More info", then "Run anyway". The files are not signed with a
  paid certificate. The engine (solidcraft-cli.exe) may be asked about too: same answer.
- Windows Firewall may ask about "Node.js JavaScript Runtime". You can press Cancel: Forge only talks to this
  computer and does not need the network.
- Try a part from nothing: press Create Sketch, click the blue square on the floor (the XY plane), press R, click two
  corners, press C, click a centre and a point for the radius, press D, click a side of the rectangle and type its
  length, press E, click the shaded shape, type a distance, press OK. Ctrl+Z undoes, Ctrl+Y redoes.
- Mouse: the wheel zooms, the middle button pans, Shift + middle button orbits. The cube at the top right looks at the
  model from a side; the buttons under the model fit it to the window or show the home view.
- More sketch tools are on the SKETCH tab: center rectangle, 2-point circle, 3-point arc (A), slot, trim (T), extend, offset (O),
  fillet, and the constraints (the small icons). With no tool selected, click a line to select it: Delete removes it, X makes
  it a construction line (dashed). Esc ends a tool.
- To change something you made: double-click a step in the timeline (the icons along the bottom). A sketch reopens; an
  extrude opens its dialog, and you can see the result while you type. Right-click a step for Rename, Suppress, Roll
  history to here, and Delete. Deleting a sketch also deletes what was built on it: Forge tells you first.
- Saving: File menu, Save (Ctrl+S). Forge files end in .forge. The first Save asks where to put it; after that Ctrl+S
  writes to the same file. A dot next to the name at the top means there are unsaved changes. Open is Ctrl+O.
  (Chrome or Edge give you the normal Windows save and open windows; other browsers download the file to your
  Downloads folder.)
- Getting a part out: File, Export: STEP (for other CAD programs), STL or 3MF (for a slicer), OBJ, and "Export a
  sketch as DXF" (the outline of a sketch, in millimetres, for DemonX Design or a laser/CNC program).
- Bringing a part in: File, "Import STEP / IGES / STL...". STEP and IGES give solid bodies. An STL, OBJ or 3MF file gives a mesh
  body (a skin of triangles, read in millimetres with Z up). A mesh can be moved (M), scaled and mirrored, and exported again, but
  it has no real faces or edges. "Mesh to Solid" (on the MODIFY tab) rebuilds a closed mesh of a mechanical part as real faces,
  so you can fillet, press pull, drill and split it. It rebuilds the part as sketches and extrudes you can edit, and works on
  parts made of flat steps and straight or evenly leaning walls along one main direction (plates, lips, ribs, drafted walls, round and
  slotted holes, rounded corners), with holes, countersinks and bosses across it. A sculpted part, or walls that lean unevenly, are
  refused with a reason and nothing is changed. Ctrl+Z takes it all back.
- "Load the demo bracket" gives a ready-made part to look at.


2b. A DESKTOP ICON, AND STARTING BY ITSELF
------------------------------------------
- "Create Desktop Shortcut.bat" puts a "DemonX Forge" icon on your desktop that starts Forge (it is a shortcut to "Start DemonX Forge.bat").
  Delete the icon like any other to remove it.
- "Start at login.bat" makes Forge start by itself, minimised, when you sign in to Windows. It asks whether it should also open the browser each
  time (Y for a computer you sit at, N to run in the background and open Forge yourself from the desktop icon). Run it again to change your answer.
  "Stop starting at login.bat" undoes it. (The computer must be signed in: Forge is not a Windows service.)


3. IF SOMETHING GOES WRONG
--------------------------
- The page says the modelling engine was not found, or it will not start: check that
  C:\DemonX-Forge\versions\<number>\engine\solidcraft-cli.exe exists (<number> is the version in current.txt). Antivirus programs sometimes quarantine new programs: look in
  your antivirus quarantine list, restore it, and add the DemonX-Forge folder to its exceptions.
- Black window closes at once: open Command Prompt, type  cd C:\DemonX-Forge  then  "Start DemonX Forge.bat"  and
  read the message.
- Port 8120 is in use (another copy of Forge is running): close it first.


4. UPDATING
-----------
The easy way: when the header shows a green "Update 0.x.y" button (or File > Updates...), open the window. It says what is new.
Tick "Allow Update now" (it is off until you turn it on), save your design (File > Save), then press "Update now". Forge downloads
the new version's Windows zip from GitHub, checks it against the checksum published with it, unpacks it NEXT TO the version you
run (nothing that is running is touched), and restarts itself into the new one. The browser page reloads by itself.
- Forge will not restart while the design has unsaved changes (the dot next to its name): the design lives in the running engine,
  so a restart would lose them. Save first.
- The old version stays in  versions\  and Forge puts it back by itself if the new one does not start. Your settings do not move.
- Forge must have been started with "Start DemonX Forge.bat" (that is what starts it again after an update).
- Forge asks GitHub about new releases at start and about once a day (it is the only thing it sends to the internet). Untick
  "Check for updates" in the same window to stop that. "Skip this version" hides the button for one version.
Versions before 0.15.0 cannot update themselves: for those, use the zip once (below). From 0.15.0 on, Update now works.

By hand: download the new zip, unblock it (step 1a), close Forge, right-click the zip, Extract All, type  C:\  again, and answer
"Replace" if asked. Your settings are in the "data" folder, which the zip does not contain, so they stay.
To go back to an older version, extract that older zip over it the same way. (Or, if the last update just happened: put the
version number from  previous.txt  into  current.txt  with Notepad, with Forge closed, and start it again.)
Old versions are tidied up by Forge at its start; the newest few are kept.


5. LETTING AN AI USE FORGE
--------------------------
Forge has an MCP server, so Claude, OpenAI's Codex and other AI programs that speak MCP can read your open design, build parts in it and check
them with a screenshot, while you watch in the Forge window. The steps to connect them are in the file "CONNECT AN AI (MCP).txt" in this folder.
The command they start is:  node\node.exe launcher.mjs mcp  (Forge must be running). The AI cannot open, save or delete files.


6. WHAT IS IN THE FOLDER
------------------------
  Start DemonX Forge.bat   starts Forge ("Start DemonX Forge.bat nobrowser" starts it without opening the browser)
  Create Desktop Shortcut.bat, Start at login.bat, Stop starting at login.bat   the desktop icon and starting at login (see step 2b)
  forge.ico                the icon of those shortcuts
  launcher.mjs             what the start file runs: it starts the version current.txt names ("launcher.mjs mcp": the MCP server)
  CONNECT AN AI (MCP).txt  how to connect Claude or OpenAI's Codex to Forge
  current.txt              the version that runs (previous.txt: the one before an update)
  versions\<number>\app\     Forge itself, one folder per version
  versions\<number>\engine\  the modelling engine, SolidCraft (MIT or Apache-2.0 licence), and licences\ with its
                           licence texts and those of the parts it is made of
  node\                    its own copy of Node (the program that runs it), with its licence
  data\                    your settings (settings.json). Nothing else of yours is in the program folders.
  LICENSE.txt              Forge's own licence (GPL-3.0-or-later)

Parts you make leave Forge as STEP, STL, 3MF or DXF files (File, Export).
