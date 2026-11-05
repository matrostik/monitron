# Monitron

Cross-platform desktop application (Electron) for hardware control of monitors via DDC/CI, specifically tested with the **LG 49WQ95C-W**.

## Features

- **Hardware Volume & Mute Control**: Adjusts volume and mute state directly on the monitor via DDC/CI rather than OS software attenuation.
- **Hardware Brightness Control**: Adjusts the monitor backlight (VCP 0x10) from its own slider, independent of volume. If the monitor locks brightness (e.g. in HDR modes), only the brightness card reports the error.
- **Hardware Contrast Control**: Adjusts monitor contrast (VCP 0x12) from its own slider with customizable fine/large steppers and preset chips.
- **Hardware Input Source Switching & Customization**: Switch between DisplayPort 1/2, HDMI 1, and USB-C (VCP 0x60). Configure which ports are visible in the main view and set custom friendly names (e.g. "Work Mac", "Gaming PC").
- **Display Standby / Power Control**: Put the display into low-power standby mode (VCP 0xD6) with one click.
- **System Tray Integration**: Minimizes to system tray on window close to stay unobtrusively accessible; quit anytime from the tray menu.
- **Customizable Global Shortcuts**: Configure custom key combinations for volume and brightness shortcuts, with automatic Shift fine-step modifiers.
- **Tabbed Settings Architecture**: Clean, organized 4-tab settings modal (`General`, `Levels & Ports`, `Shortcuts`, `About`) with compact side-by-side step grids.
- **Light & Dark Themes**: Follows the system appearance by default, or force Light / Dark in Settings.
- **Persistent Settings**: Theme, startup behavior, step sizes, port names/visibility, shortcuts, and system-volume sync are saved and applied at startup.
- **Hardware Diagnostics**: Read-only probing tool (`probe-volume.ps1`) to inspect monitor DDC/CI capabilities and active VCP codes.
- **Multi-Platform Support**:
  - **Windows**: Native DDC/CI control via Windows monitor API (`dxva2.dll`) invoked from PowerShell scripts.
  - **macOS (Apple Silicon)**: Bundled [m1ddc](https://github.com/waydabber/m1ddc) helper communicating over Apple Silicon display I2C buses.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- **Windows**: PowerShell 5.1+ / pwsh, physical DDC/CI-capable connection (DisplayPort, HDMI, or USB-C supporting DDC/CI pass-through).
- **macOS**: Apple Silicon Mac (M1/M2/M3/M4) and Apple Command Line Tools (`xcode-select --install`) to compile the bundled `m1ddc` helper.

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd monitron

# Install dependencies
npm install
```

### macOS Build Step

On Apple Silicon macOS, compile the bundled `m1ddc` utility before launching:

```bash
npm run build:mac
```

## Usage

### Run Development Application

```bash
npm start
```

- When you close the main window, the application remains running in the system tray.
- Right-click the tray icon to open Settings, toggle shortcuts / system-volume sync, switch appearance, or choose **Quit** to exit.

### Settings Tabs

Open Settings with the gear button in the title bar (or **Settings…** in the tray menu). The settings are organized across four focused tabs:

1. **General**:
   - **Appearance**: Follow System theme, or force Light / Dark mode.
   - **Startup**: Toggle *Launch at login* and *Start in tray*.

2. **Levels & Ports**:
   - **Step Sizes (%)**: Compact 2- and 3-column side-by-side grids for Fine, Large, and Shortcut step sizes across Volume, Brightness, and Contrast.
   - **Monitor Ports**: Toggle which input ports (DisplayPort 1, DisplayPort 2, HDMI 1, USB-C) appear as chips in the main view, and assign custom alias names (up to 24 characters).

3. **Shortcuts**:
   - **Shortcuts Master**: Enable/disable global hotkeys and OS volume synchronization.
   - **Key Bindings**: Customizable Electron accelerators for Volume Up, Volume Down, Brightness Up, and Brightness Down. Adding `Shift` automatically triggers the configured fine step size.

4. **About**:
   - Displays application version, target monitor, hardware protocol, backend, and runtime environment.
   - Quick-action buttons to open the local config directory and copy diagnostic system info to clipboard.

### Diagnostics & Hardware Probing

To test and verify whether your monitor responds to DDC/CI commands without modifying settings:

```bash
npm run probe
```

> [!NOTE]
> Ensure DDC/CI is enabled in your monitor's OSD (On-Screen Display) settings and that any intervening KVM switch or dock passes DDC/CI signals through.

## Running Tests

Execute the automated test suite using the Node.js built-in test runner:

```bash
npm test
```

## Building for Distribution

Packaged binaries and installers are built using `electron-builder`:

### Windows
```bash
# Builds a Windows installation setup wizard / installer (Monitron Setup.exe)
npm run dist:win:installer

# Builds a portable 64-bit Windows executable (Monitron.exe)
npm run dist:win

# Builds both installer and portable executable packages
npm run dist:win:all

# Alternatively, generate an unpacked directory build
npx electron-builder --win --dir --x64
```

### macOS (Apple Silicon)
```bash
# Compiles m1ddc and packages a macOS arm64 DMG (Monitron.dmg)
npm run dist:mac
```

*Note: Binaries are unsigned by default until signing certificates are configured in `package.json`.*

## Project Structure

```
├── docs/                 # Application architecture and research documentation
├── scripts/              # Platform helper scripts
│   ├── probe-volume.ps1  # Read-only DDC/CI probe script
│   └── windows-volume.ps1# Windows DDC/CI volume/mute control script
├── src/                  # Main Electron application source
│   ├── controller.js     # State and action dispatching
│   ├── macos.js          # macOS m1ddc bridge & display matching
│   ├── main.js           # Electron main process & tray lifecycle
│   ├── operations.js     # Volume normalization and command validation
│   ├── preload.js        # IPC context bridge
│   ├── renderer.js       # UI rendering and event handlers
│   ├── settings.js       # Settings persistence and validation
│   ├── style.css         # UI stylesheet
│   └── volume.js         # Volume calculations and clamping
├── tests/                # Unit test suite
└── vendor/
    └── m1ddc/            # m1ddc DDC/CI utility source for Apple Silicon
```

## License & Attribution

- Application code is private / proprietary unless otherwise specified.
- The bundled `m1ddc` helper in `vendor/m1ddc/` is provided under the [MIT License](vendor/m1ddc/LICENSE) (upstream revision `7339ceebb03f691b1eaeb8471dca301d215d19c8`).
