import io
import json
import os
import sqlite3
import tempfile
import unittest

from engine import alerts, db
from engine.ingest import fii_dii_import


class Alerts(unittest.TestCase):
    def conn(self):
        c = sqlite3.connect(":memory:")
        c.executescript(db.SCHEMA)
        data = {"hero": {"headline": "Foreign money kept coming in."}, "lines": [{"tone": "up", "text": "Realty led."}]}
        c.execute("INSERT INTO daily_brief VALUES ('2026-11-17', ?)", (json.dumps(data),))
        return c

    def test_message_has_brief_and_failures(self):
        m = alerts.message(self.conn(), ["fii_dii"])
        self.assertIn("Failed: fii_dii", m)
        self.assertIn("Foreign money kept coming in.", m)
        self.assertIn("▲ Realty led.", m)
        self.assertIn("not investment advice", m)

    def test_send_posts_to_bot_api(self):
        seen = {}

        class Resp(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *a): pass

        def opener(req, timeout):
            seen["url"], seen["body"] = req.full_url, json.loads(req.data)
            return Resp(b'{"ok": true}')

        self.assertTrue(alerts.send_telegram("hi", "TOKEN", "42", opener=opener))
        self.assertEqual(seen["url"], "https://api.telegram.org/botTOKEN/sendMessage")
        self.assertEqual(seen["body"]["chat_id"], "42")

    def test_not_configured_sends_nothing(self):
        saved = {k: os.environ.pop(k, None) for k in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID")}
        try:
            alerts.load_env = lambda *a, **k: None  # ignore any real .env during the test
            self.assertEqual(alerts.notify_telegram(self.conn(), []), "telegram not configured")
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v


class FlowImport(unittest.TestCase):
    def test_import_formats_and_no_overwrite(self):
        c = sqlite3.connect(":memory:")
        c.executescript(db.SCHEMA)
        c.execute("INSERT INTO fii_dii_daily (date, fii_net, dii_net) VALUES ('2026-11-13', 1, 1)")
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
            f.write('date,fii_net,dii_net\n2026-11-13,-1217.7,1220.35\n14-Nov-2026,"2,104.50",-512.25\nbad,1,1\n')
        out = fii_dii_import.run(c, f.name)
        os.unlink(f.name)
        self.assertIn("1 days added, 1 already present", out)
        self.assertIn("skipped 1", out)
        self.assertEqual(c.execute("SELECT fii_net FROM fii_dii_daily WHERE date='2026-11-13'").fetchone()[0], 1)
        self.assertEqual(c.execute("SELECT fii_net FROM fii_dii_daily WHERE date='2026-11-14'").fetchone()[0], 2104.5)


if __name__ == "__main__":
    unittest.main()
