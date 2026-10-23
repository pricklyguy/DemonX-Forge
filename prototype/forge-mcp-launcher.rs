//! Stable Windows stdio entry point for MCP clients that cannot execute `.cmd` files directly.
//! The child inherits all three stdio streams so MCP framing remains byte-for-byte unchanged.
use std::path::PathBuf;
use std::process::{Command, ExitCode, Stdio};

fn run() -> Result<ExitCode, String> {
    let executable = std::env::current_exe().map_err(|error| format!("Cannot locate forge-mcp.exe: {error}"))?;
    let root = executable.parent().ok_or("forge-mcp.exe has no installation directory")?;
    let runtime = root.join("runtime").join("node.exe");
    let bridge = root.join("forge-mcp-native.mjs");
    if !runtime.is_file() || !bridge.is_file() {
        return Err(format!("Forge MCP installation is incomplete. Expected {} and {}.", runtime.display(), bridge.display()));
    }
    let status = Command::new(PathBuf::from(runtime))
        .arg(bridge)
        .current_dir(root)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|error| format!("Could not start the bundled Forge MCP runtime: {error}"))?;
    Ok(ExitCode::from(status.code().unwrap_or(1).clamp(0, 255) as u8))
}

fn main() -> ExitCode {
    match run() {
        Ok(code) => code,
        Err(error) => {
            eprintln!("DemonX Forge MCP: {error}");
            ExitCode::FAILURE
        }
    }
}
