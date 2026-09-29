<div align="center">

# LINKD

**A safety bangle and companion app that sends an SOS without reaching for your phone.**

![Status](https://img.shields.io/badge/status-pre--alpha-orange)
![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-lightgrey)
![Expo](https://img.shields.io/badge/Expo-React%20Native-000020?logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-backend-3FCF8E?logo=supabase&logoColor=white)
![Bluetooth LE](https://img.shields.io/badge/Bluetooth-LE-0082FC?logo=bluetooth&logoColor=white)

[How it works](#how-it-works) ·
[Repo structure](#repo-structure) ·
[Getting started](#getting-started) ·
[Workflow](#development-workflow) ·
[Docs](#documentation)

</div>

---

## Why LINKD

Women often need to call for help in situations where getting to a phone is slow or dangerous: take it out, unlock it, find the right app, tap through. Under fight-or-flight stress, every one of those steps costs time that may not be there.

**LINKD removes the steps.** A discreet bangle with one button stays linked to your phone. Press and hold it, or have the link cut, and your chosen contacts and local authorities are alerted.

## How it works

```mermaid
flowchart LR
    B["LINKD bangle<br/>(button + BLE)"] -- "Bluetooth LE" --> A["LINKD app<br/>(always connected)"]
    A -- "button pressed / held" --> C{"Cancel window"}
    A -- "link lost" --> G{"Grace period"}
    G -- "reconnected" --> OK(["No alert"])
    G -- "expired" --> C
    C -- "cancelled" --> OK
    C -- "not cancelled" --> S["Supabase<br/>Edge Function"]
    S --> SMS["SMS to emergency contacts"]
    S --> D["Emergency dispatch"]
```

| Trigger | What happens |
|---|---|
| **Press / hold the button** | The bangle notifies the app, a short cancel window starts, then alerts go out. |
| **Link severed** | If the bangle is ripped off or the phone is taken, the app waits a grace period, then starts the cancel window. |
| **Battery dying** | The bangle warns before shutdown, so a dead battery is **never** mistaken for an emergency. |

> [!IMPORTANT]
> LINKD is a safety product. A missed alert and a false alert are both treated as serious defects. See the [SOS alert flow](docs/design/sos_alert_flow.md) for the behavior the code must follow.

### The app

- Pairs with and stays connected to the bangle, in the background.
- Manages the account, emergency contacts, and alert settings.
- Shows link status and battery life, and warns early when the coin cell needs replacing.
- Sends alerts via SMS to contacts and via a professional dispatch service.

### The bangle (v1 hardware)

| Part | Choice |
|---|---|
| SoC | Nordic nRF52832 / nRF52840 / nRF54L15 (pre-certified module for prototypes) |
| Power | User-replaceable coin cell (CR2025 / CR2032), sealed hatch on the inner face |
| Input | Sealed low-profile tactile button |
| Protection | Reverse-polarity protection, bulk capacitor for radio bursts |
| Antenna | Chip or PCB trace antenna behind a non-metal window |
| Board | Flex / rigid-flex PCB following the bangle curve |

*Not in v1:* haptic motor, status LED, accelerometer.

## Tech stack

| Layer | Technology |
|---|---|
| Mobile app | React Native + Expo (dev builds), expo-router, TypeScript |
| Bluetooth | react-native-ble-plx, shared protocol in `packages/ble-protocol` |
| Backend | Supabase: Postgres + row-level security, Auth, Edge Functions |
| Alerts | Twilio (SMS), Noonlight or RapidSOS (dispatch, vendor TBD) |
| Testing | Jest + React Native Testing Library, pgTAP, Deno test |
| Builds | EAS Build + EAS Update |
| Firmware | Nordic nRF SDK (toolchain TBD, not started) |

## Repo structure

```
linkd/
├── apps/
│   └── mobile/            # Expo app
├── packages/
│   └── ble-protocol/      # Single source of truth for app <-> bangle messages (planned)
├── supabase/
│   ├── config.toml        # Local stack config
│   ├── migrations/        # Schema + RLS (planned)
│   ├── functions/         # Edge Functions (send-alert, dispatch, ...) (planned)
│   └── tests/             # pgTAP tests (planned)
├── firmware/              # Bangle firmware (planned)
├── docs/                  # Protocols, design specs, decisions
└── .claude/               # Claude Code agents + skills
```

> [!NOTE]
> `packages/ble-protocol/` and `firmware/` do not exist yet - they are created when the bangle hardware is confirmed. `supabase/` holds config only; migrations, functions, and tests arrive with the first backend issue.

## Getting started

Pick your machine below. The commands inside each section are the complete path from a fresh clone to the app running on a phone.

| | Android builds | iOS builds |
|---|---|---|
| **macOS** | yes | yes |
| **Windows** | yes | no |
| **Linux** | yes | no |

iOS builds require macOS: Apple's toolchain does not exist elsewhere. On Windows and Linux, develop against Android and let a teammate on macOS cover iOS.

> [!IMPORTANT]
> **A physical phone is required.** Simulators and emulators cannot do Bluetooth Low Energy, so the bangle link cannot be tested without one.

<details>
<summary><b>macOS</b> - setup and run</summary>

### 1. Prerequisites

```bash
# Node, pinned by .nvmrc
curl -fsSL https://fnm.vercel.app/install | bash
exec $SHELL

# JDK 17 and Android SDK command-line tools
brew install --cask zulu@17
brew install --cask android-studio

# Docker, for the local Supabase stack
brew install --cask docker
```

Open Android Studio once and install **SDK Platform 36 (Android 16)** and **Android SDK Build-Tools** from Settings -> Languages & Frameworks -> Android SDK.

Install **Xcode** from the Mac App Store, then its Command Line Tools (Xcode -> Settings -> Locations -> Command Line Tools).

Add to `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

Watchman is **not** needed: Expo requires it only for SDK 55 and earlier, and this app is on SDK 57.

### 2. Install

```bash
git clone <repo-url> linkd
cd linkd
fnm install && fnm use
npm ci
cp .env.example .env
npm run doctor
```

### 3. Run on a phone

Connect the phone by USB and trust the computer.

```bash
npm run ios -w @linkd/mobile        # iPhone
npm run android -w @linkd/mobile    # Android
```

</details>

<details>
<summary><b>Windows</b> - setup and run</summary>

### 1. Prerequisites

In PowerShell:

```powershell
# Node, pinned by .nvmrc
winget install Schniz.fnm

# JDK 17, Android Studio, Docker
winget install Microsoft.OpenJDK.17
winget install Google.AndroidStudio
winget install Docker.DockerDesktop
```

Open Android Studio once and install **SDK Platform 36 (Android 16)** and **Android SDK Build-Tools** from Settings -> Languages & Frameworks -> Android SDK.

Set **`ANDROID_HOME`** under System Properties -> Environment Variables, normally:

```
%LOCALAPPDATA%\Android\Sdk
```

**Enable long paths**, or `npm ci` fails deep inside `node_modules`:

```powershell
git config --global core.longpaths true
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1
```

Reboot after that second command.

### 2. Install

```powershell
git clone <repo-url> linkd
cd linkd
fnm install; fnm use
npm ci
copy .env.example .env
npm run doctor
```

### 3. Run on a phone

Enable **Developer options** and **USB debugging** on the Android phone, connect it by USB, and accept the debugging prompt.

```powershell
npm run android -w @linkd/mobile
```

iOS is not available on Windows.

</details>

<details>
<summary><b>Linux</b> - setup and run</summary>

### 1. Prerequisites

```bash
# Node, pinned by .nvmrc
curl -fsSL https://fnm.vercel.app/install | bash
exec $SHELL

# JDK 17 (apt: openjdk-17-jdk, dnf: java-17-openjdk-devel)
sudo dnf install java-17-openjdk-devel

# Android Studio: install from https://developer.android.com/studio
# Docker Engine or Docker Desktop, for the local Supabase stack
```

Open Android Studio once and install **SDK Platform 36 (Android 16)** and **Android SDK Build-Tools** from Settings -> Languages & Frameworks -> Android SDK.

Add to `~/.bashrc` or `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

Add yourself to the group that can talk to USB devices, or `adb` will not see the phone:

```bash
sudo usermod -aG plugdev $USER   # log out and back in
```

### 2. Install

```bash
git clone <repo-url> linkd
cd linkd
fnm install && fnm use
npm ci
cp .env.example .env
npm run doctor
```

### 3. Run on a phone

Enable **Developer options** and **USB debugging** on the Android phone, connect it by USB, and accept the debugging prompt. Confirm it is visible:

```bash
adb devices
```

Then:

```bash
npm run android -w @linkd/mobile
```

iOS is not available on Linux.

</details>

### Everyday commands

Identical on all three OSes.

| Command | What it does |
|---|---|
| `npm run doctor` | The setup check. Validates the native project, config, and dependency versions against the Expo SDK. Run this before asking why a build fails. |
| `npm run typecheck` | TypeScript, no emit. |
| `npm run lint` | ESLint. |
| `npm test` | Jest. These three are exactly what CI runs on every PR, on all three OSes. |
| `npm start -w @linkd/mobile` | Dev server against an already-installed dev build. |
| `npx supabase start` | Local Supabase stack. Docker must be running. |

Two notes on the setup commands above:

- **`npm ci`, not `npm install`.** It installs exactly what [`package-lock.json`](package-lock.json) pins, so two machines cannot drift apart.
- **`fnm use` reads [`.nvmrc`](.nvmrc).** `engine-strict=true` in `.npmrc` means npm refuses to install on the wrong Node major rather than failing strangely later.

The Expo and Supabase CLIs are **not** installed globally. Both come from this repo's dev dependencies, so everyone gets the same version.

Environment variable names and purposes are in [integrations.md](docs/reference/integrations.md). Never commit values.

### Development builds, not Expo Go

Bluetooth needs native code, so the app runs as a **development build**. Expo Go cannot connect to the bangle. `npm run android` / `npm run ios` produce that build the first time and install it on the phone.

Prerequisite versions above (JDK 17, Android SDK Platform 36, and Watchman being unnecessary from SDK 56 on) follow Expo's [environment setup guide](https://docs.expo.dev/get-started/set-up-your-environment/). Check it against the installed SDK version before assuming these are current.

## Development workflow

Work is tracked in **GitHub Issues** and built with Claude Code using the rules in [CLAUDE.md](CLAUDE.md).

1. **Pick an issue** labeled `ready`: `/session-start`
2. **Branch** off `main`: `feature/<issue#>-<slug>` or `bugfix/<issue#>-<slug>`
3. **Build it.** Safety-critical code (alert logic, BLE codec, alert fan-out, RLS) is written **test-first**.
4. **Open a PR** with `Closes #<n>`: `/session-end`
5. **CI green + on-device QA** for anything BLE, background, or alert-path, then a developer merges.

| Skill | Use it to |
|---|---|
| `/new-issue` | Capture work as a GitHub issue |
| `/new-screen` | Add an app screen (test first) |
| `/new-migration` | Change the database schema + RLS |
| `/new-edge-function` | Add server logic like SMS or dispatch |
| `/ble-change` | Change the bangle protocol on both sides |
| `/new-design` | Resolve open design questions one at a time |

## Documentation

| Doc | What's in it |
|---|---|
| [SOS alert flow](docs/design/sos_alert_flow.md) | Triggers, timers, recipients, open questions |
| [BLE link spec](docs/design/ble_link_spec.md) | Messages between the bangle and the app |
| [Locked decisions](docs/reference/locked_decisions.md) | What is settled and what is still open |
| [Core protocol](docs/protocol/core_protocol.md) | Testing, branching, layout, conventions |
| [QA protocol](docs/protocol/qa_protocol.md) | On-device safety test scenarios |
| [Docs index](docs/README.md) | Everything else |

## Roadmap

- [ ] Scaffold Expo app, `packages/ble-protocol`, and Supabase project
- [ ] Resolve open questions in the SOS alert flow (timers, gesture, offline fallback)
- [ ] Bangle pairing + background connection on iOS and Android
- [ ] Emergency contacts + SMS alerts (sandbox)
- [ ] Choose a dispatch vendor and integrate
- [ ] Firmware prototype on a pre-certified nRF module

## License

_Not yet chosen._
