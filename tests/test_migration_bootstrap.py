"""
Bootstrap verification for the migration chain.

Executes every migration .sql file sequentially against an empty SQLite
database and asserts a clean bootstrap.  Failure on any migration aborts
immediately with the offending file name and SQLite error message.

Closure condition for #1581:
  migration chain boots cleanly
  AND referential integrity preserved
  AND this test passes
"""

import os
import pathlib
import sqlite3
import sys
import tempfile
import unittest

MIGRATIONS_DIR = pathlib.Path(__file__).parent.parent / "migrations"

CROSS_TABLE_TRIGGERS = [
    ("csr_finality_class_must_exist", "conflict_set_registry"),
    ("qar_finality_class_must_exist", "quorum_attestation_registry"),
    ("rlr_finality_class_must_exist", "revocation_liveness_registry"),
    ("er_finality_class_must_exist", "epoch_registry"),
]


def _apply_migration_chain(conn):
    sql_files = sorted(p for p in MIGRATIONS_DIR.iterdir() if p.suffix == ".sql")
    assert sql_files, "No .sql migration files found"
    for sql_file in sql_files:
        sql = sql_file.read_text(encoding="utf-8")
        try:
            conn.executescript(sql)
        except sqlite3.Error as exc:
            raise AssertionError(f"{sql_file.name}: {exc}") from exc


class MigrationBootstrapTest(unittest.TestCase):
    def setUp(self):
        f = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
        self.db_path = f.name
        f.close()
        self.conn = sqlite3.connect(self.db_path)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")

    def tearDown(self):
        self.conn.close()
        os.unlink(self.db_path)

    def test_migration_chain_boots_cleanly(self):
        _apply_migration_chain(self.conn)

        cur = self.conn.execute(
            "SELECT COUNT(*) FROM sqlite_master "
            "WHERE type='table' AND name='finality_classification_registry'"
        )
        self.assertEqual(
            cur.fetchone()[0], 1,
            "finality_classification_registry missing after migration chain",
        )

        for trigger_name, table_name in CROSS_TABLE_TRIGGERS:
            cur = self.conn.execute(
                "SELECT COUNT(*) FROM sqlite_master "
                "WHERE type='trigger' AND name=? AND tbl_name=?",
                (trigger_name, table_name),
            )
            self.assertEqual(
                cur.fetchone()[0], 1,
                f"trigger {trigger_name} missing on {table_name} after migration chain",
            )


# pytest-compatible function for environments that have pytest installed
def test_migration_chain_boots_cleanly():
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        db_path = f.name
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        _apply_migration_chain(conn)

        cur = conn.execute(
            "SELECT COUNT(*) FROM sqlite_master "
            "WHERE type='table' AND name='finality_classification_registry'"
        )
        assert cur.fetchone()[0] == 1, (
            "finality_classification_registry missing after migration chain"
        )

        for trigger_name, table_name in CROSS_TABLE_TRIGGERS:
            cur = conn.execute(
                "SELECT COUNT(*) FROM sqlite_master "
                "WHERE type='trigger' AND name=? AND tbl_name=?",
                (trigger_name, table_name),
            )
            assert cur.fetchone()[0] == 1, (
                f"trigger {trigger_name} missing on {table_name} after migration chain"
            )

        conn.close()
    finally:
        os.unlink(db_path)


if __name__ == "__main__":
    unittest.main()
