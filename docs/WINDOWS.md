DEMONX FORGE FOR WINDOWS
========================

DemonX Forge is a 3D design (CAD) program that runs in your web browser, on your own computer. Nothing goes to the cloud.
It is early: it can show a demo part, pick faces, change a parameter and drill a hole. Sketching tools are not in yet.

You need: Windows 10 or 11 (64-bit) and a web browser.
You do NOT need to install Node, Rust or anything else: it is all in this folder.


1. INSTALL
----------
a. Right-click the zip file you downloaded, choose Properties. If you see an "Unblock" box at the bottom, tick it and
   press OK. (Windows marks files downloaded from the internet as untrusted.)
b. Right-click the zip, choose "Extract All...". When it asks where, type  C:\  and press Extract.
   That gives you the folder  C:\DemonX-Forge  . (Do not run it from inside the zip.)
c. Open  C:\DemonX-Forge  and double-click  "Start DemonX Forge.bat".


2. FIRST START
--------------
- A black window opens (leave it open: closing it stops Forge) and your browser opens Forge after a few seconds.
  If the page does not open by itself, type  http://127.0.0.1:8120  into your browser.
- "Windows protected your PC" (SmartScreen)? Press "More info", then "Run anyway". The files are not signed with a
  paid certificate. The engine (solidcraft-cli.exe) may be asked about too: same answer.
- Windows Firewall may ask about "Node.js JavaScript Runtime". You can press Cancel: Forge only talks to this
  computer and does not need the network.
- Press "Load the demo bracket". Click a face to select it. Change "width" on the left and press Enter. Click a face, then
  "Drill hole at click". Undo takes it back.


3. IF SOMETHING GOES WRONG
--------------------------
- The page says the modelling engine was not found, or it will not start: check that
  C:\DemonX-Forge\engine\solidcraft-cli.exe exists. Antivirus programs sometimes quarantine new programs: look in
  your antivirus quarantine list, restore it, and add the DemonX-Forge folder to its exceptions.
- Black window closes at once: open Command Prompt, type  cd C:\DemonX-Forge  then  "Start DemonX Forge.bat"  and
  read the message.
- Port 8120 is in use (another copy of Forge is running): close it first.


4. WHAT IS IN THE FOLDER
------------------------
  Start DemonX Forge.bat   starts Forge
  app\                     Forge itself
  node\                    its own copy of Node (the program that runs it), with its licence
  engine\                  the modelling engine, SolidCraft (MIT or Apache-2.0 licence), and licences\ with its
                           licence texts and those of the parts it is made of
  LICENSE.txt              Forge's own licence (GPL-3.0-or-later)

Parts you make leave Forge as STEP, STL, 3MF or DXF files (export is not in this early version yet).
