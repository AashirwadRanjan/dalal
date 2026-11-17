#!/bin/bash
# Install (or reinstall) a macOS launchd job that runs the engine on weekdays at 18:45 local time.
# launchd, unlike cron, runs a missed job when the Mac wakes from sleep.
#
#   scripts/install-schedule.sh            # install / update
#   scripts/install-schedule.sh --remove   # uninstall
set -euo pipefail

LABEL="com.dalal.daily"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PYTHON="$ROOT/.venv/bin/python"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

if [[ "${1:-}" == "--remove" ]]; then
  rm -f "$PLIST"
  echo "Removed $LABEL"
  exit 0
fi

[[ -x "$PYTHON" ]] || { echo "Missing $PYTHON. Create the venv first (see README)." >&2; exit 1; }
mkdir -p "$ROOT/data" "$(dirname "$PLIST")"

days=""
for wd in 1 2 3 4 5; do  # Mon-Fri
  days+="    <dict><key>Weekday</key><integer>$wd</integer><key>Hour</key><integer>18</integer><key>Minute</key><integer>45</integer></dict>
"
done

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PYTHON</string><string>-m</string><string>engine.run_daily</string><string>--notify</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StartCalendarInterval</key>
  <array>
$days  </array>
  <key>StandardOutPath</key><string>$ROOT/data/engine.log</string>
  <key>StandardErrorPath</key><string>$ROOT/data/engine.log</string>
</dict>
</plist>
EOF

launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed $LABEL: weekdays 18:45, log at data/engine.log"
echo "Run it now with: launchctl kickstart gui/$(id -u)/$LABEL"
