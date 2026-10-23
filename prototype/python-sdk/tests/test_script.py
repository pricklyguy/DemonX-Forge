import json
import tempfile
import unittest
from pathlib import Path

from demonx_forge import ForgeScript, ScriptCommand, ScriptError
from demonx_forge.script import load


class ScriptTests(unittest.TestCase):
    def test_json_round_trip_and_reusable_save(self):
        script = ForgeScript("Mounting plate", description="Parametric example")
        script.add("solid.box", length=40, width=30, height=10, body_name="Plate")
        with tempfile.TemporaryDirectory() as folder:
            path = script.save(Path(folder) / "plate.json")
            loaded = load(path)
        self.assertEqual(loaded.to_dict(), script.to_dict())

    def test_rejects_invalid_schema_command_and_over_limit_mcp_batch(self):
        self.assertRaises(ScriptError, ForgeScript("", []).validate)
        bad = ForgeScript("bad", schema_version=2)
        bad.add("solid.box", length=1)
        self.assertRaises(ScriptError, bad.validate)
        bad = ForgeScript("bad")
        bad.add("File.save", path="C:/outside")
        self.assertRaises(ScriptError, bad.validate)
        long_batch = ForgeScript("long")
        long_batch.commands = [ScriptCommand("solid.box") for _ in range(201)]
        self.assertRaises(ScriptError, lambda: long_batch.validate(for_mcp=True))

    def test_rejects_non_json_numbers(self):
        script = ForgeScript("bad")
        script.add("solid.box", length=float("nan"))
        self.assertRaises(ScriptError, script.validate)


if __name__ == "__main__":
    unittest.main()
