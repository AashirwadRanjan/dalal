"""Live record: logs only setups on the latest final bar, then follows them forward with the backtest rules."""
import datetime as dt
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from engine import alerts, db
from engine.signals import backtest, live

IST = live.IST


def at(date: str, hh=18, mm=45):
    y, m, d = map(int, date.split("-"))
    return dt.datetime(y, m, d, hh, mm, tzinfo=IST)


class Live(unittest.TestCase):
    def setUp(self):
        backtest.COST_PCT, backtest.SLIPPAGE_PCT = 0, 0
        self.tmp = tempfile.TemporaryDirectory()
        self.patch = mock.patch.object(db, "DB_PATH", Path(self.tmp.name) / "m.db")
        self.patch.start()
        self.conn = db.connect()
        self.conn.execute("INSERT INTO instruments (symbol, name, sector, isin, yf_symbol, in_index) VALUES ('A','A','','','A.NS',1)")
        self.bar("2026-11-16", 99, 101, 98, 100)

    def tearDown(self):
        backtest.COST_PCT, backtest.SLIPPAGE_PCT = 0.1, 0.2
        self.conn.close()
        self.patch.stop()
        self.tmp.cleanup()

    def bar(self, d, o, h, l, c):
        self.conn.execute("INSERT INTO prices_daily VALUES ('A', ?, ?, ?, ?, ?, 1000)", (d, o, h, l, c))

    def signal(self, d):
        self.conn.execute("INSERT INTO signals (symbol, date, pattern, side, trend, entry, stop, target, detail) "
                          "VALUES ('A', ?, 'breakout', 'long', 'up', 100, 95, 110, '')", (d,))

    def events(self):
        return [r[0] for r in self.conn.execute("SELECT event FROM setup_events ORDER BY rowid")]

    def test_follows_a_setup_to_its_target(self):
        self.signal("2026-11-16")
        live.run(self.conn, at("2026-11-16"))
        self.assertEqual(self.conn.execute("SELECT status FROM setup_log").fetchone()[0], "waiting")
        self.bar("2026-11-17", 100, 106, 99, 105)
        live.run(self.conn, at("2026-11-17"))
        self.assertEqual(self.conn.execute("SELECT status, entry, best_r FROM setup_log").fetchone(), ("open", 100, 1.2))
        self.bar("2026-11-18", 105, 111, 104, 109)
        live.run(self.conn, at("2026-11-18"))
        self.assertEqual(self.conn.execute("SELECT status, r FROM setup_log").fetchone(), ("target", 2.0))
        self.assertEqual(self.events(), ["new", "entered", "working", "target"])

    def test_does_not_log_old_setups(self):
        self.bar("2026-11-17", 100, 101, 99, 100)
        self.signal("2026-11-16")  # fired before the latest bar: logging it now would use hindsight
        live.run(self.conn, at("2026-11-17"))
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM setup_log").fetchone()[0], 0)

    def test_partial_bar_during_market_hours_is_ignored(self):
        self.signal("2026-11-16")
        live.run(self.conn, at("2026-11-16"))
        self.bar("2026-11-17", 100, 100.5, 94, 94.5)  # partial bar at 11 am touches the stop
        live.run(self.conn, at("2026-11-17", 11, 0))
        self.assertEqual(self.conn.execute("SELECT status FROM setup_log").fetchone()[0], "waiting")

    def test_gap_past_stop_is_skipped(self):
        self.signal("2026-11-16")
        live.run(self.conn, at("2026-11-16"))
        self.bar("2026-11-17", 94, 95, 92, 93)
        live.run(self.conn, at("2026-11-17"))
        self.assertEqual(self.conn.execute("SELECT status FROM setup_log").fetchone()[0], "skipped")

    def test_alert_scope_and_wording(self):
        self.signal("2026-11-16")
        live.run(self.conn, at("2026-11-16"))
        self.assertEqual(alerts.event_lines(self.conn, mine=set())[0], [])  # not your stock, not weekly
        lines, ids = alerts.event_lines(self.conn, mine={"A"})
        self.assertEqual(len(ids), 1)
        self.assertIn("A: long breakout, daily setup", lines[0])


if __name__ == "__main__":
    unittest.main()
