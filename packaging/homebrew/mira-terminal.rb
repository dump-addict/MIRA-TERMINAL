# Homebrew cask for Mira Terminal. It lives in the tap repository dump-addict/homebrew-tap (Casks/mira-terminal.rb),
# so that `brew install --cask dump-addict/tap/mira-terminal` works. Update `version` and both `sha256` after each
# release : shasum -a 256 Mira-Terminal-macos-arm64.dmg Mira-Terminal-macos-x64.dmg
cask "mira-terminal" do
  arch arm: "arm64", intel: "x64"

  version "0.1.0"
  sha256 arm:   "REPLACE_WITH_ARM64_DMG_SHA256",
         intel: "REPLACE_WITH_X64_DMG_SHA256"

  url "https://github.com/dump-addict/MIRA-TERMINAL/releases/download/v#{version}/Mira-Terminal-macos-#{arch}.dmg"
  name "Mira Terminal"
  desc "Terminal for all your projects, agents and tasks"
  homepage "https://github.com/dump-addict/MIRA-TERMINAL"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: :ventura

  app "Mira Terminal.app"

  zap trash: [
    "~/Library/Application Support/Mira Terminal",
    "~/Library/Preferences/dev.mira.terminal.plist",
    "~/Library/Saved Application State/dev.mira.terminal.savedState",
  ]
end
