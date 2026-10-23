"""Build and submit bounded Forge scripts through the existing authenticated MCP bridge.

This SDK does not execute Python inside Forge. Modeling operations remain native SolidCraft
commands and are submitted as one atomic ``forge_run_commands`` batch.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import threading
from typing import Any


MAX_SCRIPT_BYTES = 1_048_576
MAX_MCP_STEPS = 200
_COMMAND_ID = re.compile(r"^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$")


class ScriptError(RuntimeError):
    """Validation, transport, or native command error returned by Forge."""


@dataclass(frozen=True)
class ScriptCommand:
    command: str
    params: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"command": self.command, "params": self.params}


@dataclass
class ForgeScript:
    name: str
    commands: list[ScriptCommand] = field(default_factory=list)
    description: str = ""
    schema_version: int = 1

    def add(self, command: str, params: dict[str, Any] | None = None, **arguments: Any) -> "ForgeScript":
        """Append a native command. Pass parameters as a mapping or keyword arguments."""
        if params is not None and arguments:
            raise ScriptError("Pass command parameters as a mapping or keyword arguments, not both")
        self.commands.append(ScriptCommand(command, dict(params if params is not None else arguments)))
        return self

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "name": self.name,
            "description": self.description,
            "commands": [command.to_dict() for command in self.commands],
        }

    def validate(self, *, for_mcp: bool = False) -> bytes:
        if self.schema_version != 1:
            raise ScriptError(f"Unsupported schema version: {self.schema_version}")
        if not self.name.strip() or len(self.name) > 120:
            raise ScriptError("Script name must contain 1 to 120 characters")
        if not self.commands:
            raise ScriptError("A script must contain at least one command")
        limit = MAX_MCP_STEPS if for_mcp else 10_000
        if len(self.commands) > limit:
            raise ScriptError(f"This script contains {len(self.commands)} commands; the limit is {limit}")
        for index, step in enumerate(self.commands, 1):
            if not _COMMAND_ID.fullmatch(step.command):
                raise ScriptError(f"Command {index} has an invalid command id: {step.command!r}")
            if not isinstance(step.params, dict):
                raise ScriptError(f"Command {index} parameters must be a JSON object")
        try:
            encoded = json.dumps(self.to_dict(), ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
        except (TypeError, ValueError) as error:
            raise ScriptError(f"Script contains a value that cannot be represented as JSON: {error}") from error
        if len(encoded) > MAX_SCRIPT_BYTES:
            raise ScriptError(f"Script is {len(encoded)} bytes; the limit is {MAX_SCRIPT_BYTES} bytes")
        return encoded

    def save(self, path: str | os.PathLike[str]) -> Path:
        """Write a portable JSON script that can be imported in Scripts & Add-Ins."""
        encoded = self.validate()
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(json.dumps(json.loads(encoded), ensure_ascii=False, indent=2).encode("utf-8") + b"\n")
        return target


class _McpProcess:
    def __init__(self, command: list[str], timeout: float):
        self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", bufsize=1)
        self.timeout = timeout
        self._lines: queue.Queue[str | None] = queue.Queue()
        self._stderr: list[str] = []
        self._reader = threading.Thread(target=self._read_stdout, daemon=True)
        self._error_reader = threading.Thread(target=self._read_stderr, daemon=True)
        self._reader.start()
        self._error_reader.start()
        self._next_id = 0

    def _read_stdout(self) -> None:
        assert self.process.stdout is not None
        for line in self.process.stdout:
            self._lines.put(line)
        self._lines.put(None)

    def _read_stderr(self) -> None:
        assert self.process.stderr is not None
        for line in self.process.stderr:
            self._stderr.append(line.rstrip())
            if len(self._stderr) > 50:
                del self._stderr[:-50]

    def request(self, method: str, params: dict[str, Any], timeout: float | None = None) -> dict[str, Any]:
        self._next_id += 1
        request_id = self._next_id
        payload = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
        assert self.process.stdin is not None
        self.process.stdin.write(json.dumps(payload, separators=(",", ":")) + "\n")
        self.process.stdin.flush()
        deadline = self.timeout if timeout is None else timeout
        while True:
            try:
                line = self._lines.get(timeout=deadline)
            except queue.Empty as error:
                raise ScriptError(f"MCP {method} timed out; inspect Forge before retrying a modeling script") from error
            if line is None:
                detail = "\n".join(self._stderr[-10:])
                raise ScriptError(f"MCP bridge exited while handling {method}. {detail}".strip())
            try:
                message = json.loads(line)
            except json.JSONDecodeError as error:
                raise ScriptError(f"MCP bridge emitted invalid JSON: {line[:240]!r}") from error
            if message.get("id") != request_id:
                continue
            if "error" in message:
                raise ScriptError(f"MCP {method} failed: {message['error'].get('message', message['error'])}")
            return message.get("result", {})

    def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        assert self.process.stdin is not None
        payload = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            payload["params"] = params
        self.process.stdin.write(json.dumps(payload, separators=(",", ":")) + "\n")
        self.process.stdin.flush()

    def close(self) -> None:
        if self.process.stdin:
            self.process.stdin.close()
        try:
            self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()


def _launcher_command(launcher: str | os.PathLike[str] | None, node: str | None) -> list[str]:
    configured = launcher or os.environ.get("FORGE_MCP_LAUNCHER")
    if not configured and os.name == "nt":
        configured = r"C:\DemonX-Forge-Native\forge-mcp-native.mjs"
    if not configured:
        raise ScriptError("Set FORGE_MCP_LAUNCHER to Forge's stable forge-mcp-native.mjs path")
    return [node or os.environ.get("FORGE_NODE", "node"), str(configured)]


def submit(
    script: ForgeScript,
    *,
    launcher: str | os.PathLike[str] | None = None,
    node: str | None = None,
    timeout: float = 600.0,
) -> dict[str, Any]:
    """Submit one all-or-nothing modeling batch through the established Forge MCP tool.

    Forge must be running with its native control channel enabled. The MCP launcher discovers
    the private per-user endpoint and authenticates on this SDK's behalf; this SDK never reads
    Forge token files, accepts filesystem scopes, or exposes another command path.
    """
    script.validate(for_mcp=True)
    client = _McpProcess(_launcher_command(launcher, node), timeout)
    try:
        client.request("initialize", {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "demonx-forge-python-sdk", "version": "0.1.0"},
        })
        client.notify("notifications/initialized")
        tools = client.request("tools/list", {})
        if not any(tool.get("name") == "forge_run_commands" for tool in tools.get("tools", [])):
            raise ScriptError("The configured MCP bridge does not provide Forge's forge_run_commands tool")
        result = client.request("tools/call", {
            "name": "forge_run_commands",
            "arguments": {"steps": [step.to_dict() for step in script.commands]},
        }, timeout=timeout)
        if result.get("isError"):
            details = "; ".join(item.get("text", "") for item in result.get("content", []) if item.get("type") == "text")
            raise ScriptError(details or "Forge rejected the script batch")
        return result
    finally:
        client.close()


def load(path: str | os.PathLike[str]) -> ForgeScript:
    """Load and locally validate a version 1 Forge JSON script."""
    try:
        raw = Path(path).read_bytes()
    except OSError as error:
        raise ScriptError(f"Could not read script: {error}") from error
    if len(raw) > MAX_SCRIPT_BYTES:
        raise ScriptError(f"Script is {len(raw)} bytes; the limit is {MAX_SCRIPT_BYTES} bytes")
    try:
        payload = json.loads(raw)
        commands = [ScriptCommand(row["command"], row.get("params", {})) for row in payload["commands"]]
        script = ForgeScript(payload["name"], commands, payload.get("description", ""), payload["schema_version"])
    except (json.JSONDecodeError, KeyError, TypeError) as error:
        raise ScriptError(f"Invalid Forge script JSON: {error}") from error
    script.validate()
    return script
