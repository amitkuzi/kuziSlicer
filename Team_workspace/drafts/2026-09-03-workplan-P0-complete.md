# תוכנית עבודה kuziSlicer — P0 מלא עם תלויות (2026-09-03)

**סטטוס:** טיוטה לאישור  
**מקור:** HLD-3d-slicer-P0.md + PRD-סליסר-3D-מאוחד.md  
**תאריך:** 2026-09-03  
**שפה:** עברית (ארגון) + אנגלית (משימות קוד)

---

## תקציר

תוכנית עבודה מפורטת ל-P0 של kuziSlicer עם **5 שלבים קצרים** (Phases 0–5), **27 משימות עיקריות**, ו**מפת תלויות מלאה**. סדר הביצוע מומלץ: **Phase 0 → 2 → 3 → 4 → (5) → Phase 1 במקביל** (Phase 1 חסום בהחלטת רישוי §0 בPRD).

כל משימה נושאת:
- **מטרה:** מה ייבנה/יתקבל
- **תלויות:** תנאים מוקדמים
- **סוג בדיקה:** Unit/Integration/Manual
- **סטטוס נוכחי:** ✅ בוצע / ⚠ חלקי / ⏳ לביצוע

---

## Phase 0 — שלד ארכיטקטוני (7 משימות)

### Gatekeeping
**§0 – החלטת רישוי** ❌ **חסום עד אישור**
- **מטרה:** החלטה: שימוש חוזר בקוד Arachne/PS (GPLv3) מול יישום עצמאי  
- **תלויות:** —  
- **השפעה:** Phase 1 לא מתחיל ללא החלטה זו  
- **סטטוס:** ⏳ ממתין לאישור בעל המוצר  
- **הערה:** שאר Phases (0, 2–5) **לא תלויים בה** ויכולים להתקדם בעצמאות

---

### Tasks

#### 0.1 – ממשקי TypeScript גרסתיים לסוגי פלאגינים
- **מטרה:** הגדרת `engine.interface.ts`, `importer.interface.ts`, `overhang.interface.ts` עם:
  - קלט/פלט מוגדרים (manifest, request, result, progress events)
  - הרשאות sandbox (file-read, network, cpu-limits)
  - versioned interface עם SemVer
- **תלויות:** —  
- **סוג בדיקה:** Unit (manifest validator)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/types/plugin-*.ts`

#### 0.1-Host – שלד PluginHost (C#/.NET) ✅ **בוצע**
- **מטרה:** `kuziSlicer.PluginHost` — ריפו .NET נפרד עם:
  - `PluginHost.Contracts` (DTO/manifest/request/result)
  - `PluginHost.Core` (Manager/Engine/Accessor)
  - `PluginHost.Api` (REST + SSE + SignalR)
- **תלויות:** —  
- **סוג בדיקה:** Unit, Build  
- **סטטוס:** ✅ **בוצע** — `dotnet build` → 0 שגיאות; `dotnet test` → 6/6 ירוק  
- **קובץ:** `D:\Development\kuziSlicer.PluginHost/` (ריפו חדש)

#### 0.2 – Sandbox — תהליך OS נפרד + Fault Isolation ✅ **בוצע**
- **מטרה:** `PluginProcessAccessor` עם:
  - `Process.Start` לכל פלאגין (תהליך-בן אמיתי, לא worker_threads)
  - קריאה/כתיבה stdio JSON-lines
  - הרשאות מוגבלות (manifest-based)
  - ניהול exit codes וcrash handling
- **תלויות:** 0.1-Host  
- **סוג בדיקה:** Integration (פלאגין-דמה אמיתי עדיין לביצוע)  
- **סטטוס:** ✅ **קוד קיים** בPluginHost, ⏳ **בדיקת integration** עדיין נדרשת  
- **קובץ:** `PluginHost.Core/PluginProcessAccessor.cs`

#### 0.3 – Plugin Manager — Load/Unload/Enable/Disable
- **מטרה:** ממשק בסיידבר עם:
  - טעינה/פריקה דינמית (hot load/unload)
  - הפעלה/השבתה לכל פלאגין
  - הצגת מטא-דאטה (גרסה, הרשאות, סטטוס)
  - ניהול תצורה בקובץ JSON
- **תלויות:** 0.1-Host, 0.2  
- **סוג בדיקה:** Unit (מנהל עם fakes) + Integration (hot load אמיתי)  
- **סטטוס:** ⚠ **חלקי** — רשימה/הרצה קיימות ב`PluginManager`, enable/disable+hot-unload עדיין לביצוע  
- **קובץ:** `PluginHost.Core/PluginManager.cs`, `PluginHost.Api/PluginController.cs`

#### 0.4 – פירוק GcodeGenerator ל-Manager + Engine (TypeScript)
- **מטרה:** שדרוג `src/main/services/gcodeGenerator.ts`:
  - **Manager:** אורקסטרציה — קראת פרופיל, validation, קריאה ל-PluginHost דרך REST/SignalR
  - **Engine:** מתמטיקה טהורה בלבד (STL parsing, layer generation) — אם קוד מקומי (בגלל §0)
  - הסרת calls לפלאגינים מקומיים, שימוש בPlugin Host client
- **תלויות:** 0.1, 0.7  
- **סוג בדיקה:** Unit (Engine ללא doubles), Unit (Manager עם mocks), Regression (output = current output)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/main/services/gcodeManager.ts`, `src/main/services/engines/stlEngine.ts`

#### 0.5 – פירוק ProfilesManager ל-Accessor + Manager
- **מטרה:** שדרוג `src/main/services/profilesManager.ts`:
  - **Accessor:** קריאה/כתיבה גולמית (JSON/YAML) מ-userData
  - **Manager:** הוגמות (DTO), מיזוג bundled+user profiles, validation
  - DTO כ-readonly; no direct exposure of raw storage types
- **תלויות:** 0.1  
- **סוג בדיקה:** Unit (pure resolve logic), Integration (קריאת FS אמיתי)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/main/services/profilesAccessor.ts`, `src/main/services/profilesManager.ts`

#### 0.6 – ניקוי Main.ts — IPC כ-Controller בלבד
- **מטרה:** שדרוג `src/main/main.ts`:
  - הסרת עיבוד לוגיקה מה-IPC handlers
  - `ipcMain.handle` → ישירות ל-Manager (בלי עיבוד ביניים)
  - logging מובנה, error handling אחיד
- **תלויות:** 0.4, 0.5  
- **סוג בדיקה:** Integration (IPC מקצה-לקצה)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/main/main.ts`

#### 0.7 – Plugin Host Client — Electron ↔ PluginHost
- **מטרה:** נקודת-קצה ב-Electron main process:
  - ספריית REST/SSE/SignalR client עם עטיפות TypeScript
  - spawn/kill lifecycle של PluginHost.exe (production build)
  - Retry logic, timeout handling, process respawning
  - IPC-exposed methods להפעלת פלאגינים (sync ל-renderer)
- **תלויות:** 0.1-Host  
- **סוג בדיקה:** Integration (Electron ↔ PluginHost אמיתי, `dotnet run`)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/main/clients/pluginHostClient.ts`, `src/main/main.ts` (spawn PluginHost)

---

## Phase 2 — מודל הגדרות ופרופילים (3 משימות)

**תלויות קודמות:** Phase 0

#### 2.1 – מדרג Override תלת-שכבתי
- **מטרה:** DTO + Manager + UI:
  - Global settings (global.json)
  - Per-Object overrides (object-level DTO)
  - Per-Part overrides (part-level DTO)
  - Resolve function (part > object > global)
- **תלויות:** Phase 0 (0.4, 0.5)  
- **סוג בדיקה:** Unit (pure resolve), UI integration  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/types/settings.ts`, `src/main/services/settingsManager.ts`, `src/renderer/components/SettingsPanel.tsx`

#### 2.2 – Config Wizard — הגדרת מדפסת מודרכת
- **מטרה:** Wizard UI (React) + IPC:
  - דף 1: בחירת יצרן (Anker/Anycubic/BambuLab/Creality/Prusa/RatRig/Voron)
  - דף 2: בחירת דגם (filtered by manufacturer)
  - דף 3: בחירת filament profile
  - דף 4: שמירה + validation
  - ביטול = לא כתיבה
- **תלויות:** 2.1  
- **סוג בדיקה:** Integration (IPC), Manual (UI flow)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/renderer/components/ConfigWizard.tsx`, `src/main/main.ts` (IPC handler)

#### 2.3 – ספריית Manufacturer Profiles
- **מטרה:** תיקיות בתוך `src/data/manufacturers/`:
  - `printers/*.json` — Anker/Anycubic/BambuLab/Creality/Prusa/RatRig/Voron
  - `filaments/*.json` — עבור כל יצרן
  - מנהל כבר קיים (2.2 משתמש בו); task זה = הוספת נתונים
- **תלויות:** Phase 0 (0.5)  
- **סוג בדיקה:** Integration (ספריית fixture אמיתית, טעינה + validation)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/data/manufacturers/*.json`

---

## Phase 3 — שכבת קישוריות (5 משימות)

**תלויות קודמות:** Phase 0

#### 3.1 – ממשק "חיבור מדפסת" מופשט
- **מטרה:** `src/types/printerConnection.ts` — חוזה:
  ```typescript
  interface IPrinterConnection {
    connect(auth): Promise<void>
    send(file): Promise<void>
    start/pause/stop(): Promise<void>
    getTelemetry(): Promise<Telemetry>
    getCameraStream(): Promise<Stream | Unsupported>
    rawPassthrough(gcode, confirm): Promise<void>
  }
  ```
- **תלויות:** —  
- **סוג בדיקה:** Unit (ממשק mock)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/types/printerConnection.ts`

#### 3.2 – מתאם Klipper/Moonraker (ראשון ב-P0)
- **מטרה:** `src/main/adapters/klipperAdapter.ts` עם:
  - HTTP client ל-Moonraker REST API
  - Authentication (local API key)
  - send-file, start/pause/stop
  - Telemetry normalization (push ל-event model אחיד)
  - Camera stream unsupported flag
- **תלויות:** 3.1  
- **סוג בדיקה:** Integration (mock Moonraker server, **לא mock HTTP client**)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/main/adapters/klipperAdapter.ts`

#### 3.3 – גילוי-רשת Bonjour
- **מטרה:** `src/main/services/printerDiscovery.ts`:
  - NPM: `bonjour` or `mdns` package
  - סקן רשת ל-`_http._tcp` + `_ssh._tcp`
  - הצגה ברשימת ממשקים זמינים בUI
- **תלויות:** Phase 0  
- **סוג בדיקה:** Integration (mock mDNS broadcaster בסביבת בדיקה)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/main/services/printerDiscovery.ts`, `src/renderer/components/PrinterDiscovery.tsx`

#### 3.4 – Raw G-code Passthrough + Confirmation Gate
- **מטרה:** ב-`klipperAdapter.ts`:
  - בדיקת flag "advanced mode" בהגדרות
  - שער אישור UI עם הנספח "זה עוקף בטיחות"
  - שליחה פעם אחת בלבד בלי re-confirmation בתוך 10 שניות
- **תלויות:** 3.1, 3.2  
- **סוג בדיקה:** Unit (gate logic) + Integration (UI confirmation)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/main/adapters/klipperAdapter.ts`, `src/renderer/components/RawGcodeConfirm.tsx`

#### 3.5 – נורמליזציית טלמטריה
- **מטרה:** מודל אירועים פנימי אחיד:
  ```typescript
  interface TelemetryEvent {
    timestamp: number
    event: 'nozzle_temp' | 'bed_temp' | 'print_progress' | ...
    value: number
  }
  ```
  - Moonraker push → מופה לאירוע
  - Moonraker poll (delta) → מופה לאירוע
  - UI קורא דרך IPC, לא עומד על פרוטוקול ספציפי
- **תלויות:** 3.2  
- **סוג בדיקה:** Unit (mapper)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/main/adapters/telemetryMapper.ts`, `src/main/main.ts` (telemetry IPC)

---

## Phase 4 — תצוגה 3D ו-UI בסיסי (4 משימות)

**תלויות קודמות:** Phase 0 (ברירה) + Phase 3 (לחלקם)

#### 4.1 – שדרוג רינדור PBR בסיסי
- **מטרה:** שדרוג `src/renderer/components/Tabs/ModelViewer.tsx` (Three.js קיים):
  - תאורה סביבתית (AmbientLight + DirectionalLight)
  - צללים בסיסיים (shadow maps)
  - פרמטרים: ambientIntensity, shadowMapSize
  - benchmark: FPS לא נופל תחת בדיקה גדולה (1M vertices)
- **תלויות:** —  
- **סוג בדיקה:** Manual (screenshot + FPS check)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/renderer/components/Tabs/ModelViewer.tsx`

#### 4.2 – Gizmo לציור-תמיכות (ידני)
- **מטרה:** UI hook (React + Three.js):
  - Brush tool בסיידבר מימין
  - Stroke drawing בתצוגה 3D → רשימת 3D points
  - IPC ל-manager (עדיין לא חיבור ל-engine, זה Phase 1)
  - Undo/Redo בסיסי
- **תלויות:** 0.3 (plugin manager), 4.1  
- **סוג בדיקה:** Integration (stroke → manager) + Manual (UX)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/renderer/components/Tabs/SupportBrushGizmo.tsx`, `src/main/main.ts` (handler)

#### 4.3 – מצבי בהיר/כהה (דרישת בסיס, לא ליטוש)
- **מטרה:** CSS + React state:
  - Toggle ב-settings
  - localStorage persistence
  - Tailwind dark: mode (in tsx className)
  - תיעוד ב-README
- **תלויות:** —  
- **סוג בדיקה:** Manual (toggle, restart, no regression)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/index.css`, `src/renderer/App.tsx`, `tailwind.config.ts`

#### 4.4 – ריבוי-מיטות/משטחים בפרויקט אחד
- **מטרה:** Manager + UI:
  - DTO עם array של beds/plates
  - UI tabs לכל bed
  - Add/Remove bed buttons
  - State persistence בקובץ project
- **תלויות:** Phase 0 (0.4, 0.5)  
- **סוג בדיקה:** Unit (manager + state), Integration (UI)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/types/project.ts`, `src/main/services/projectManager.ts`, `src/renderer/components/MainWindow.tsx`

---

## Phase 5 — אריזה וקבלה (3 משימות)

**תלויות קודמות:** Phase 0 + Phase 1 (אם בוצע)

#### 5.1 – אריזת Starter Extensions
- **מטרה:** bundle במערך `plugins/` בשורש:
  - `plugin-arcane/` — Arcane Engine (or placeholder עד Phase 1)
  - `plugin-profiles/` — Profile Importer/Exporter (§17.5)
  - `plugin-overhang/` — Overhang Detector (placeholder)
  - תיקיה `manifest.json` לכל אחד
  - PluginManager טוען אותם אוטומטית בהתחלה
- **תלויות:** Phase 0, Phase 1 (אם בוצע)  
- **סוג בדיקה:** Integration (first launch auto-loads)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `plugins/plugin-*/manifest.json`, `src/main/services/pluginManager.ts`

#### 5.2 – EULA / Disclaimer
- **מטרה:** UI modal בהתחלה ראשונה:
  - טקסט: "השימוש במוצר... באחריות המשתמש בלבד"
  - חובה לאישור לפני המשך
  - checkbox "לא להציג שוב" (שמור ב-localStorage)
- **תלויות:** —  
- **סוג בדיקה:** Manual (טקסט נקרא, לא ניתן לדלג)  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `src/renderer/components/EULA.tsx`, `src/renderer/App.tsx`

#### 5.3 – תרחיש קבלה End-to-End
- **מטרה:** בדיקת integration מלאה:
  1. ייבוא STL (fixture בדיקה)
  2. Select printer profile (Config Wizard)
  3. Slice (invoke PluginHost)
  4. Export G-code
  5. Connect printer (Moonraker mock)
  6. Send file + start print
  - כל שלב בלי שגיאה
  - וידוא קובצים נוצרים/משלחים
- **תלויות:** כל Phases  
- **סוג בדיקה:** Integration E2E  
- **סטטוס:** ⏳ לביצוע  
- **קובץ:** `test/e2e/acceptance.test.ts` (fixture)

---

## Phase 1 — מנוע החיתוך (5 משימות) ❌ **חסום ב-§0**

**תלויות קודמות:** Phase 0 + **החלטת רישוי ב-§0**

#### 1.1 – Arachne Perimeter Engine
- **מטרה:** Plugin בטלנט Arachne (variable width lines):
  - Parse STL → outline curves
  - Generate concentric perimeters בעובי דינמי
  - Gcode output
  - **תלוי ב-§0:** אם GPL → שימוש חוזר בקוד; אם Apache → יישום עצמאי
- **תלויות:** Phase 0, §0 decision  
- **סוג בדיקה:** Unit (boundary geometry), Snapshot match (fixture STL vs. known gcode)  
- **סטטוס:** ⏳ חסום ב-§0  
- **קובץ:** `kuziSlicer.PluginHost/plugins/plugin-arcane/Engine.cs` (or TS)

#### 1.2 – Infill Patterns + Sandwich Mode
- **מטרה:** Plugin:
  - Lightning, Adaptive Cubic, Gyroid, 3D Honeycomb, Rectilinear, Concentric
  - Sandwich mode: top/bottom dense, core sparse
  - Per-object override (§2.1)
- **תלויות:** Phase 0, 1.1, §0  
- **סוג בדיקה:** Unit (density coverage), Integration (per-object override)  
- **סטטוס:** ⏳ חסום ב-§0  
- **קובץ:** `plugin-arcane/Infill.cs`

#### 1.3 – Support Generation (Organic + Grid)
- **מטרה:** Plugin עם שני engines:
  - **Organic:** tree-like (default for overhangs)
  - **Grid:** rectilinear (default for boxes)
  - Auto-detect (based on geometry shape)
  - Manual override (via 4.2 gizmo)
- **תלויות:** Phase 0, 1.1, 4.2, §0  
- **סוג בדיקה:** Unit (overhang detection), Integration (user override)  
- **סטטוס:** ⏳ חסום ב-§0  
- **קובץ:** `plugin-arcane/Support.cs`

#### 1.4 – Wipe Tower (Multi-Material)
- **מטרה:** Plugin:
  - כיוון: ריבוי-חומרים דורש מגדל ניקוי
  - חישוב נפח (width × height × num_colors)
  - Position בפינת המישור
  - Gcode generation (retract, move, purge, retract back)
- **תלויות:** Phase 0, 1.1, §0  
- **סוג בדיקה:** Unit (volume calc)  
- **סטטוס:** ⏳ חסום ב-§0  
- **קובץ:** `plugin-arcane/WipeTower.cs`

#### 1.5 – Abstract Filament Source Model
- **מטרה:** DTO + Manager:
  - Unify AMS (BambuLab), Multi-Extruder (Elegoo), Single-Extruder (any)
  - All map to `FilamentSource[] { id, extruder, color, ... }`
  - Manager resolves at slice time
- **תלויות:** Phase 0, §0  
- **סוג בדיקה:** Unit (mapping)  
- **סטטוס:** ⏳ חסום ב-§0  
- **קובץ:** `src/types/filament.ts`, `src/main/services/filamentManager.ts`

---

## מפת תלויות — DAG (Directed Acyclic Graph)

```
┌─────────────────────────────────────────────────────────────┐
│ BLOCKING DECISION                                           │
│ §0: Licensing (GPL vs. Apache) — Phase 1 waits             │
└──────┬──────────────────────────────────────────────────────┘
       │
       │ (other phases proceed independently)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 0 — Architectural Foundation (foundation for ALL)    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  0.1: TypeScript Interfaces ───┐                          │
│  0.1-Host: .NET Skeleton ────┐ │                          │
│  0.2: Sandbox (Process)      │ ├──→ 0.3: Plugin Manager  │
│  0.4: Refactor gcodeGen  ────┼─┘                          │
│  0.5: Refactor profiles  ────┤                            │
│  0.6: Cleanup IPC  ────────┐ │                            │
│  0.7: Plugin Host Client ──┼─┤                            │
│                            └─┼→ All downstream tasks      │
└─────────────────────────────┤──────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌──────────────────────┐                   ┌──────────────────────┐
│ PHASE 2              │                   │ PHASE 3              │
│ Settings & Profiles  │                   │ Printer Connectivity │
├──────────────────────┤                   ├──────────────────────┤
│ 2.1: Override Stack  │                   │ 3.1: Abstract Iface  │
│ 2.2: Config Wizard   │                   │ 3.2: Klipper Adapter │
│ 2.3: Mfg. Profiles   │                   │ 3.3: Bonjour Discovery
│                      │                   │ 3.4: Raw Passthrough │
└──────────────────────┘                   │ 3.5: Telemetry Norm  │
        │                                   └──────────────────────┘
        │                                           │
        └───────────────────────┬───────────────────┘
                                │
        ┌───────────────────────┴───────────────────┐
        │                                           │
        ▼                                           ▼
┌──────────────────────┐                   ┌──────────────────────┐
│ PHASE 4              │                   │ PHASE 1              │
│ 3D View & UI         │                   │ Slicing Engine ⏳    │
├──────────────────────┤                   ├──────────────────────┤
│ 4.1: PBR Rendering   │                   │ [BLOCKED by §0]      │
│ 4.2: Support Gizmo ──┼──→ (waits for 1.3)│ 1.1: Arachne Engine  │
│ 4.3: Dark Mode       │                   │ 1.2: Infill Patterns │
│ 4.4: Multi-Bed       │                   │ 1.3: Support Gen     │
│                      │                   │ 1.4: Wipe Tower      │
└──────────────────────┘                   │ 1.5: Filament Model  │
        │                                   └──────────────────────┘
        │                                           │
        └───────────────────────┬───────────────────┘
                                │
                                ▼
                        ┌──────────────────────┐
                        │ PHASE 5              │
                        │ Acceptance & Package │
                        ├──────────────────────┤
                        │ 5.1: Starter Plugins │
                        │ 5.2: EULA/Disclaimer │
                        │ 5.3: E2E Acceptance  │
                        └──────────────────────┘
```

---

## סדר ביצוע מומלץ

| # | Phase | בנוי על | משך משוער | הערות |
|---|-------|---------|-----------|--------|
| 1️⃣ | Phase 0 | — | **5–6 שבועות** | קריטי, foundation. Unlock כל המשימות האחרות |
| 2️⃣ | Phase 2 | 0 | 2–3 שבועות | Settings/profiles — low complexity, high value |
| 3️⃣ | Phase 3 | 0 | 3–4 שבועות | Connectivity — mid complexity |
| 4️⃣ | Phase 4 | 0, 3 | 2–3 שבועות | UI/3D — parallel possible; 4.2 waits for decision on 1.3 |
| 5️⃣ | Phase 5 | 0, 1 (cond) | 1 שבוע | Acceptance — final only after others done |
| 🔄 | Phase 1 | 0, §0 | **⏸ BLOCKED** | **תלוי בהחלטה §0.** Run parallel to 2–5 ברגע שההחלטה תתקבל |

**Critical Path:** Phase 0 (5–6 שבועות) → Phase 2 (2–3) → Phase 3 (3–4) → Phase 5 (1) = **~12–14 שבועות** ל-P0 **ללא** Phase 1.  
**Total with Phase 1 (if GPL decision):** +6–8 שבועות (parallel).

---

## סיכומי משימות לפי שחקן

### TypeScript/Electron (kuziSlicer repo)
- **Phase 0:** 0.1, 0.4, 0.5, 0.6, 0.7
- **Phase 2:** 2.1, 2.2, 2.3
- **Phase 3:** 3.1, 3.2, 3.3, 3.4, 3.5
- **Phase 4:** 4.1, 4.2, 4.3, 4.4
- **Phase 5:** 5.2, 5.3
- **Phase 1 (if GPL):** 1.2, 1.4, 1.5 (support modeling)

### C#/.NET (kuziSlicer.PluginHost repo)
- **Phase 0:** 0.1-Host (✅ בוצע), 0.2 (⚠ בדיקות), 0.3
- **Phase 1 (if GPL):** 1.1, 1.3 (core engine logic)
- **Phase 5:** 5.1 (packaging)

### Infrastructure
- **Phase 0:** GitHub repos setup (PluginHost), build/CI pipeline
- **Phase 2–5:** CI/CD for tests, release automation

---

## פערים וסיכונים

| סיכון | השפעה | סבירות | פעולה |
|------|--------|--------|---------|
| §0 לא מתקבל לפי לוח הזמנים | P0 מתעכב 1–2 משבועות | בינונית | Track closely, escalate week 2 |
| PluginHost + Electron ipc תחזוקה גבוהה | Maintenance burden grows | בינונית | Integration tests + CI sanity checks |
| Moonraker mock server חסר | 3.2 בדיקה מתעכבת | נמוכה | Prepare docker-compose fixture |
| PBR rending FPS drop | 4.1 צריך optimization | נמוכה | Benchmark early, optimize if needed |
| Licenses מהפלאגינים unclear | Legal delay ב-Phase 1 | בינונית | Audit each dependency month 6 |

---

## פערי מידע

- **Exact PluginHost hosting/CI:** עדיין לא בחרנו GitHub owner/org ו-CI service (GitHub Actions vs. Azure).
- **Moonraker test fixture:** צריך docker-compose להרצה מקומית בבדיקות integration.
- **Arachne licensing details:** PR של OpenSCAD לא טרם סגור; דוקומנטציה של license לא ברורה לחלוטין.

---

## החלטות שנדרשות ממך

### 1. **§0 — רישוי מנוע החיתוך**
- **אפשרות A:** GPL (שימוש חוזר בקוד Arachne + PrusaSlicer)
  - **עלות:** kuziSlicer.PluginHost binary חייב להיות Apache-2.0, בלי linking ל-GPL plugin; נתונים גיוונים בקוד open-source.
  - **לוח:** P0 + Phase 1 = 12–14 שבועות (parallel Phase 1 from week 6).
  - **סיכון:** Arachne protocol might break with firmware updates.
- **אפשרות B:** Apache-2.0 (יישום עצמאי)
  - **עלות:** Phase 1 =+2–4 שבועות יישום חדש של מתמטיקה.
  - **לוח:** P0 + Phase 1 = 14–18 שבועות.
  - **יתרון:** בלי תלויות GPL, שליטה מלאה בקוד.

**עם מי:** בעל המוצר.  
**מתי:** לפני שבוע 1 של Phase 0, כדי שלא לחסום את Phase 1 flow.

### 2. **GitHub + CI לפלאגין-הוסט**
- **Create repo?** GitHub private/public? Under what owner?
- **CI service?** GitHub Actions (free), Azure Pipelines, other?
- **Maven?** Manual nuget versioning, or CI auto-versioning?

**עם מי:** DevOps/Infrastructure.  
**מתי:** שבוע 1, לפני phase 0.3–0.7.

### 3. **Artifact storage for plugins**
- **Central repository** (Phase 2: §17.4) — דורש hosting (Azure Blob, GitHub Releases, חדש).
- **P0 requirement?** ללא (bundled plugins כ-starter set); P1 requirement.
- **Confirm:** לא צריך ב-P0, דחה ל-Phase 5?

**עם מי:** בעל המוצר + infrastructure.  
**מתי:** שבוע 2 (plan ahead for P1).

---

## הצעד הבא

1. **עדכון §0 decision** לפי choice A/B למעלה — משפיע על Phase 1 timeline (תשובה דחופה, דצור לפני שבוע 1).

2. **Setup PluginHost repo + CI** — יוצר .gitignore, build pipeline, initial nuget restore (שבוע 1).

3. **Phase 0 kickoff — 3 משימות במקביל:**
   - 0.4 (GcodeGenerator refactor) — Implementor
   - 0.5 (ProfilesManager refactor) — Implementor
   - 0.6–0.7 (IPC cleanup + Client) — Implementor
   - **בדיקות:** Counter-model Validator writes tests.

4. **Phase 2 mockups** — Designer drafts Config Wizard UI (Figma/design artifact) (שבוע 2).

5. **Phase 3 research** — CAD Expert documents Moonraker API + Bonjour protocol (shaping 3.2–3.3) (שבוע 2–3).

6. **Track blockers:** PluginHost build status, §0 decision escalation if slipping.

---

**סטטוס:** טיוטה לביקורת Architect + Product Owner.  
**עדכון אחרון:** 2026-09-03 14:00 Asia/Jerusalem
