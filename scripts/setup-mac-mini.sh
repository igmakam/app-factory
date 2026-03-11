#!/bin/bash
# Mac Mini M4 — iOS Worker Setup
# Spusti na Mac Mini po prvom nastavení macOS

set -e

echo "🍎 App Factory — Mac Mini M4 iOS Worker Setup"
echo "=============================================="

# 1. Homebrew
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# 2. Python 3.12
brew install python@3.12
python3 --version

# 3. Ruby + Fastlane
brew install ruby
export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
gem install fastlane --no-document
fastlane --version

# 4. Xcode CLI tools
xcode-select --install || true

# 5. SwiftLint
brew install swiftlint

# 6. App Factory worker deps
cd "$(dirname "$0")/.."
pip3 install -r requirements.txt

# 7. Create .env for this worker
if [ ! -f .env ]; then
  cat > .env << 'ENVEOF'
TEMPORAL_HOST=your-temporal-server:7233
DATABASE_URL=postgresql://user:pass@your-db-host:5432/appfactory
ANTHROPIC_API_KEY=sk-ant-...
ENVEOF
  echo "⚠️  Edit .env with your credentials!"
fi

# 8. Create launchd plist for auto-start on reboot
PLIST_PATH="$HOME/Library/LaunchAgents/com.appfactory.ios-worker.plist"
cat > "$PLIST_PATH" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.appfactory.ios-worker</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which python3)</string>
        <string>$(pwd)/workers/ios_worker.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$(pwd)</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>StandardOutPath</key>
    <string>$(pwd)/logs/ios-worker.log</string>
    <key>StandardErrorPath</key>
    <string>$(pwd)/logs/ios-worker-error.log</string>
</dict>
</plist>
PLISTEOF

mkdir -p logs
launchctl load "$PLIST_PATH"

echo ""
echo "✅ Mac Mini iOS Worker setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your credentials"
echo "  2. Make sure Xcode is installed (App Store)"
echo "  3. Run: python3 workers/ios_worker.py"
echo "  4. Worker will auto-start on reboot via launchd"
