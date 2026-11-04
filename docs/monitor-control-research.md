# LG monitor speaker control: research

Researched 2026-11-04. Scope: controlling the built-in speaker volume of the **LG 49WQ95C-W**, confirmed by the user, from Windows and macOS. The user has **one monitor and an M1 Mac**, with an intended M4 or M5 replacement. Target Apple Silicon for the first release; Intel details below are background, not required implementation scope. Firmware, exact Mac model/OS and connection mapping remain unconfirmed. Test the M1 now and repeat hardware acceptance on the selected replacement; architecture alone does not guarantee every port/OS control path.

Model-specific update: LG's [49WQ95C-W product page](https://www.lg.com/us/monitors/lg-49wq95c-w-ultrawide-monitor) documents built-in speakers and HDMI/DisplayPort/USB-C connections, plus PBP/PIP and KVM features. Its [model support page](https://www.lg.com/us/support/product/lg-49WQ95C-W.AUS) lists Windows and macOS OnScreen Control downloads. No model-specific third-party VCP volume compatibility was established by this search. The earlier 49WL95C reports below concern different hardware and must not be used as evidence that this user's monitor works or fails.

## Connection and KVM update

The user reports HDMI and “display” (provisionally DisplayPort) plus an **external KVM used for its remote switching button**. Their photo visibly identifies **KCEVE**, with the case text **“DP+HD Dual Monitor KVM Switch.”** The exact model/revision is not visible. They confirmed **one physical monitor: the LG 49WQ95C-W**. They would consider the LG built-in KVM if convenient app switching can replace this workflow. Exact host wiring and any LG PBP use remain unconfirmed; assume ordinary full-screen handoff for planning. LG's [owner's manual](https://www.adorama.com/col/productManuals/LG49WQ95CW.pdf), authored by LG and mirrored by Adorama, documents USB upstream selection and KVM controls. The monitor's built-in KVM provides a potential route to direct video from each computer while sharing peripherals.

KCEVE research limit: the [manufacturer catalog](https://kceve.com/products/) contains multiple KVM families. No exact-match primary-source guarantee of DDC/CI forwarding, host software switching, or reusable remote-button signaling was established for the photographed unit. Similar model names or reseller/manual-aggregation listings are insufficient to establish its revision. Validate the current hardware path before recommending replacement. The user's confirmed single-monitor setup removes any need to coordinate a second physical display.

Input-switch research: [BetterDisplay's first-party guide](https://betterdisplay.pro/guide/faq/general/input-switch-back/) documents LG alternate addressing/input commands and cautions that inactive-link switching and USB routing are distinct concerns. [lg-input-switch](https://github.com/meer-cha/lg-input-switch) demonstrates an NVIDIA raw-I2C alternative for **45GX950A-B**, not the user's model. Local WMI reports an NVIDIA GeForce RTX 3060 Ti, which is a possible investigation route only; input switching on 49WQ95C-W remains unvalidated. Prefer a two-app handoff in which each active host switches away to the other, with independently verified USB upstream mapping. A programmable USB HID button could trigger this workflow on the active host, subject to practical testing. Do not assume the current external KVM's remote is a generic USB button.

Recommendation: first compare the existing KVM path with a direct connection, keeping the same host/input where possible. Prefer Windows direct DisplayPort and Mac direct USB-C as the initial two-host design if the hosts support them. This recommendation removes an intermediary from the control path; it does not establish a universal reliability ranking or guaranteed Mac refresh rate.

EDID handling and control-command forwarding are distinct. [Adder's AV4PRO-DVI manual](https://cdn11.bigcommerce.com/s-hltjsp5jm3/content/pdfs/MAN-AV4PRO-DVI-Adder.pdf) separately documents EDID emulation and configurable Hybrid DDC for two-way DDC/CI on the selected host. This primary-source example demonstrates why a KVM's EDID specification alone is insufficient; it is not a compatibility claim about the unidentified switch. Confirm actual read/write support, switching recovery, and audio routing before replacing hardware. Inactive-host control remains unproven.

## Feasibility

**Build around DDC/CI, with a hardware validation milestone before application development.** This is an established way of changing an external display's hardware volume. It does not imply that every LG model or cable/dock combination supports it. MonitorControl implements external-display brightness, contrast and volume through DDC; its published compatibility notes identify port and DisplayLink limitations. [MonitorControl project](https://github.com/MonitorControl/MonitorControl)

LG's 49WL95C specifications confirm two 10 W speaker channels, USB-C, HDMI and DisplayPort, plus OnScreen Control software. They do not publish a VCP support contract. The 49WQ95C support page also supplies Windows and Mac OnScreen Control downloads. These are reasons to test the official utility first, not proof of a working third-party volume path. [LG 49WL95C specifications](https://solutions.lg.com/us/PDF/press-release/CES-2019-LG-Ultra-Monitors-Release-US.pdf), [LG 49WQ95C support](https://www.lg.com/uk/support/product-support/cs-49WQ95C-W.AEU/)

There is conflicting first-hand evidence within the same LG family: an M1 MacBook Air/49WL95C-WE over USB-C report describes volume changes taking effect after the app menu closes; another 49WL95C USB-C report describes an ineffective volume slider. These are historical user observations, not controlled tests or a guarantee for current software. [MonitorControl issue 475](https://github.com/MonitorControl/MonitorControl/issues/475), [MonitorControl discussion 1597](https://github.com/MonitorControl/MonitorControl/discussions/1597)

## Control protocol

| Feature | VCP | Semantics and design implication |
| --- | --- | --- |
| Speaker volume | `0x62` | Read/write audio speaker volume. Its feature classification changes across MCCS versions; do not blindly assume every raw value is a 0–100 percentage. |
| Audio mute | `0x8D` | Common values are `1` mute and `2` unmute. MCCS 2.2 also includes screen-blank semantics; validate the monitor's behavior before enabling this control. |

These meanings come from ddcutil's maintained feature database. It is an implementation reference, not the normative VESA specification. [ddcutil VCP definitions](https://www.ddcutil.com/vcpinfo_output/)

Design recommendation: use an allowlist of validated volume/mute commands; retain raw values alongside normalized UI values. Do not scan-write arbitrary VCP codes. If a monitor lacks reliable dedicated mute, only offer zero-volume emulation after verifying that zero means silence; save the previous nonzero value and label the operation accurately. If zero cannot be validated, disable mute.

MonitorControl's troubleshooting documentation explicitly distinguishes individual-feature failures, cable differences and unreliable readback. It also documents longer delays and reduced polling as workarounds. Therefore treat transport availability, volume readability, volume writability and mute support as separate capabilities. [MonitorControl troubleshooting](https://github.com/MonitorControl/MonitorControl/wiki/Monitor-Troubleshooting)

## Windows backend

Microsoft exposes the required operations through `Dxva2.dll`:

- Obtain a physical-monitor handle using `GetPhysicalMonitorsFromHMONITOR`.
- Read `0x62` with `GetVCPFeatureAndVCPFeatureReply`, which returns current value, maximum value and code type.
- Write the validated value with `SetVCPFeature`.
- Report Win32 failures using `GetLastError`; free physical-monitor resources when finished.

Microsoft documents approximately 40 ms for a read and 50 ms for a write and cautions that incomplete MCCS implementations require physical validation. Recommendation: execute transactions off the UI thread, coalesce slider events and serialize operations for each physical display. These timing numbers are API documentation estimates, not guaranteed latency targets. [Microsoft read API](https://learn.microsoft.com/en-us/windows/win32/api/lowlevelmonitorconfigurationapi/nf-lowlevelmonitorconfigurationapi-getvcpfeatureandvcpfeaturereply), [Microsoft write API](https://learn.microsoft.com/en-us/windows/win32/api/lowlevelmonitorconfigurationapi/nf-lowlevelmonitorconfigurationapi-setvcpfeature)

Audio endpoint control is a different layer. `IAudioEndpointVolume` controls an audio endpoint stream; Windows can implement it in software when hardware control is unavailable. Software endpoint volume affects shared-mode rendering and can be bypassed by exclusive-mode playback. Recommendation: keep optional computer-volume fallback distinct from monitor hardware control in both state and UI. [Microsoft endpoint-volume API](https://learn.microsoft.com/en-us/windows/win32/api/endpointvolume/nn-endpointvolume-iaudioendpointvolume)

## macOS backend

There is an architecture split in established implementations:

| Mac | Existing implementation evidence | Implication |
| --- | --- | --- |
| Intel | MonitorControl uses `IOKit.i2c`, framebuffer discovery, `IOI2CRequest` and `IOI2CSendRequest`. | A separate Intel transport is needed if Intel support is a release requirement. |
| Apple Silicon | MonitorControl sends DDC packets through `IOAVServiceWriteI2C` and `IOAVServiceReadI2C`, matching registry services to displays. | Isolate low-level service matching and private interfaces behind a small transport boundary. |

The Apple Silicon source includes per-operation delays, retries and checksum handling. The Intel implementation also validates response type, unsupported status and checksum. These are useful behaviors to preserve, not reasons to copy code without reviewing the license and current OS behavior. [MonitorControl Intel source](https://raw.githubusercontent.com/MonitorControl/MonitorControl/main/MonitorControl/Support/IntelDDC.swift), [MonitorControl Apple Silicon source](https://raw.githubusercontent.com/MonitorControl/MonitorControl/main/MonitorControl/Support/Arm64DDC.swift)

The current m1ddc README describes Apple Silicon support through USB-C/DisplayPort Alt Mode **and supported built-in HDMI ports**. It provides display enumeration, UUID targeting, volume and mute commands; it explicitly excludes Intel Macs. Older descriptions that say it is USB-C-only are stale. Its source uses IOAVService I2C operations and transport-specific wait times. Recommendation: use it as a validation tool and possible narrowly scoped MIT-licensed transport reference, not as proof that every Mac HDMI port works. [m1ddc README](https://github.com/waydabber/m1ddc), [m1ddc I2C implementation](https://raw.githubusercontent.com/waydabber/m1ddc/main/sources/i2c.m)

MonitorControl documents unsupported built-in HDMI combinations and says DisplayLink docks do not expose its DDC path on Mac. It suggests BetterDisplay as an alternative for some ports. Its App Store Lite edition does not have the full app's DDC functionality. Recommendation: direct signed/notarized distribution should be the initial macOS plan; separately assess store eligibility and native media-key permissions during implementation. No permission or store behavior was tested in this research. [MonitorControl compatibility](https://github.com/MonitorControl/MonitorControl), [maintainer discussion of Lite/DDC](https://github.com/MonitorControl/MonitorControl/discussions/1597)

## Official software and existing tools

LG publishes OnScreen Control for both systems. Its software guide describes volume among monitor controls and qualifies functionality by monitor model. The current OSC help page also documents connection and adapter limitations. Test the exact model with LG's utility before assuming custom development is necessary. Keep LG OSC-specific USB requirements separate from standard DDC over the display cable; they are different compatibility questions. [LG software guide](https://www.lg.com/content/dam/channel/wcms/it/supporto/guide-soluzioni/download/dual-controller-guide-sw.pdf), [LG OSC installation and troubleshooting](https://www.lg.com/us/support/help-library/lg-monitor-how-to-install-onscreen-control-and-use-its-features--20155115803113)

For Mac validation, try the full MonitorControl app first and BetterDisplay if the transport is unsupported. BetterDisplay's repository is a distribution/documentation repository; do not assume its complete implementation is available for reuse. Its old wiki now points users to its current guide. [BetterDisplay documentation](https://github.com/waydabber/BetterDisplay/wiki/)

## Recommended validation experiment

The following is proposed work, not a test already performed:

1. Record the retail model and firmware from the monitor label/OSD; identify host GPU/Mac chip, OS version, input, cable, adapters, dock and PBP/PIP state.
2. Select the monitor as the audio output and confirm that sound reaches its speakers. Record both computer and monitor volume without automatically increasing either.
3. Start with a direct USB-C/DisplayPort connection where available. Read only the volume feature and inspect status/type/range. A brightness response does not prove volume support.
4. With quiet playback and user observation, make a small volume decrease. Verify monitor OSD, audible output and readback; restore the original value. Confirm the computer volume did not change.
5. Test dedicated mute and restoration only after validating its semantics. Record unsupported operations separately.
6. Repeat for every intended Windows/Mac connection, then through the intended dock. Test sleep/wake, unplug/replug, other audio outputs and PBP if used.
7. Promote only proven model/firmware/transport combinations to supported profiles. A visible slider or successful API return alone is insufficient.

## Architecture recommendations derived from the evidence

These are design judgments, not claims from the cited projects:

- Initial proposal: small native tray/menu-bar applications. Following the Electron discussion, the current application plan instead proposes a shared Electron/TypeScript shell with a Windows C#/C++ helper and macOS Swift helper. This is an architectural recommendation, not a hardware compatibility claim.
- Share application logic, documented backend contracts, state transitions, model-profile data and failure fixtures while isolating private macOS transport code in its helper.
- Keep physical display identity separate from the audio endpoint identity; require explicit mapping when automatic matching is ambiguous.
- Track `confirmed`, `pending`, `stale`, `unsupported`, `unreachable` and optionally `write-only` state. Never present cached values as fresh hardware readback.
- Serialize and coalesce commands, use bounded retries, and suspend polling while sleeping/disconnected. Avoid two utilities concurrently writing the same monitor during validation.
- Rescan after topology changes. Persist stable identity with an ambiguity fallback; do not bind preferences to enumeration index alone.
- MVP: volume, validated mute, device selection, connection status and diagnostics. Add media-key interception after the core transport is reliable; brightness/input/KVM are separate later features.
- Do not automatically set the OS audio output or raise its volume. Software-volume fallback must be explicit and must not be reported as hardware control.

## Remaining uncertainty

The model is confirmed as LG 49WQ95C-W; its transport and DDC volume behavior have not been validated. No monitor-control writes were made, and no Windows or Mac hardware test was performed for this research. No public LG per-model VCP matrix was found. The strongest next step is a short diagnostic experiment on the actual hardware, then implementation against that confirmed path.
