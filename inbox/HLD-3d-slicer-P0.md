# HLD: kuziSlicer — עיצוב-על ל-P0 (MVP)

**סטטוס:** טיוטה לאישור (טרם עבר Validator, טרם עבר ל-inbox)
**מקור:** [PRD-סליסר-3D-מאוחד.md](../../inbox/PRD-סליסר-3D-מאוחד.md)
**תכולה:** מסמך זה מכסה **P0 בלבד** (§16 ב-PRD). P1/P2 יתוכננו בנפרד לאחר ש-P0 יציב — בהתאם להמלצת ה-PRD למקד את ה-MVP במנוע ליבה, לא בבידול.
**מצב קוד קיים:** שני ריפואים כעת:
- `D:\Development\kuziSlicer` (Electron/TS) — `StlParser`/`GcodeGenerator` (מעבר יחיד, לא Arachne), `profilesManager` (טעינה/ייבוא JSON/YAML, כולל ממיר/מייבא פרופילים שכבר נוסף), טאבים ב-UI (`ModelViewer`, `PrinterManagement`, `GcodeViewer`, `PrintSettings`).
- `D:\Development\kuziSlicer.PluginHost` (C#/.NET, ריפו git נפרד, לא-Push) — **חדש**, שלד Plugin Host (REST+SSE+SignalR), ראו §1.1. `dotnet build`: 0 שגיאות. `dotnet test`: 6/6 עברו.

ה-HLD בונה על שניהם, לא מתחיל מאפס.

---

## 0. החלטת רישוי — נפתרה

**החלטת בעל המוצר (2026-09-06):** להשתמש בנתיב Arachne/PS התואם **GPL-3.0-or-later**. Phase 1 אינו חסום עוד בהחלטת §0 ויכול להתחיל לאחר חוזי Phase 0 ותבניות הפלאגינים. כל קוד נגזר נושא LICENSE והודעות צד-שלישי משלו.

**גבול הרישוי:** הבידוד הארכיטקטוני של Plugin Host קיים בפועל (ראו §1.1), אך ההנחה ש-GPL מוגבל לפלאגין היא מודל הנדסי בלבד. Release ציבורי נשאר מותנה ב-audit משפטי של linking, אריזה והפצה.

---

## 1. ארכיטקטורת-על

```
kuziSlicer (Electron — src/main, src/renderer)
   │
   ▼
IPC (main.ts / preload)         ← controller, ללא לוגיקה עסקית
   │
   ▼
Core Services (src/main/services)
   ├─ Manager  (orchestration, DI)
   ├─ Engine   (pure logic — STL math, gcode math)
   └─ Accessor (userData files, profiles storage)
   │
   │  REST (control) + SSE (progress) + SignalR (progress + cancel)
   ▼
kuziSlicer.PluginHost  (ריפו נפרד — ראו §1.1)
   │  stdio, JSON-lines
   ▼
Plugins (כל אחד תהליך OS נפרד, Manager+Engine+Accessor פנימיים)
   ├─ Arcane Engine (slicing: perimeters/infill/support)
   ├─ Profile Importer/Exporter
   └─ Overhang Detector
```

- כל שכבת ליבה (Manager/Engine/Accessor) — לפי §18.5 ב-PRD, מתורגם מ-`csharp-standards`.
- מנוע החיתוך, מייבא הפרופילים וזיהוי ה-overhang **נבנים כפלאגינים מהיום הראשון** (§17.1) — לא retrofit. שאר קוד ה-P0 (IPC, UI, connectivity) נשאר בליבת kuziSlicer.
- כיוון תלות קבוע: `IPC → Manager → Engine`, `Manager → Accessor`. Engine אף פעם לא נוגע ב-IO. כלל זה חל בשתי הליבות בנפרד — גם ב-kuziSlicer (TypeScript) וגם ב-kuziSlicer.PluginHost (C#).

### 1.1 Plugin Host — תהליך ו-ריפו נפרד

**שינוי מהגרסה הקודמת של ה-HLD:** הפלאגינים לא רצים כ-worker בתוך תהליך ה-Electron. הם רצים בתוך שירות נפרד — **`kuziSlicer.PluginHost`** — ריפו .NET/C# עצמאי ב-`D:\Development\kuziSlicer.PluginHost` (כבר נוצר, שלד בנוי, בדיקות ירוקות — ראו §5).

**למה תהליך נפרד ולא רק sandbox בתוך אותו process:** ראו הדיון המלא בצ'אט — בקצרה, GPLv3 "נדבק" דרך **linking**, לא דרך הרצה כתת-תהליך עם תקשורת arm's-length (stdio/socket/HTTP). `worker_threads` באותו Node process הוא אזור אפור-מסוכן; תהליך OS נפרד לגמרי הוא הדרך הבטוחה לשמור על "רק הפלאגין GPLv3, לא כל kuziSlicer". זה גם מחזק את דרישת ה-fault isolation מ-§17.2 ב-PRD (קריסת פלאגין = קריסת תהליך-בן, לא של Electron).

**תעלות תקשורת בין kuziSlicer ל-PluginHost (כל השלוש קיימות בשלד):**
| תעלה | שימוש |
|---|---|
| REST (`POST /api/plugins/{id}/invoke`) | קריאות קצרות, מישור-בקרה (רשימת פלאגינים, הרצה שמחזירה רק תוצאה סופית) |
| SSE (`GET /api/plugins/{id}/stream`) | סטרימינג התקדמות ל-Electron main process ללא תלות ב-SignalR client |
| SignalR (`/hubs/plugins`, method `InvokeStream`) | סטרימינג עשיר + ביטול-פעולה יזום (חיתוך ארוך שהמשתמש רוצה לעצור) |

**פרוטוקול Host↔Plugin:** `Process.Start` (תהליך-בן אמיתי) + JSON-lines על stdio. מתועד ב-`kuziSlicer.PluginHost/plugins/README.md`.

**רישוי:** kuziSlicer.PluginHost עצמו — Apache-2.0 (לא מקשר קוד GPL). כל תיקיית-פלאגין נושאת LICENSE משלה; Arcane Engine יפותח תחת GPL-3.0-or-later בהתאם להחלטת §0.

---

## 2. שלבים (Phases) ומפת משימות

כל Phase הוא נדבך עצמאי-לבדיקה (buildable increment). סדר מומלץ: השלמת חוזי Phase 0, ואז Phase 1 רץ במקביל ל-2 → 3 → 4 → 5.

### Phase 0 — שלד ארכיטקטוני (Manager/Engine/Accessor + Plugins)
תשתית-בסיס נדרשת לפני שקוד P0 נוסף נכתב, כי כל קוד עתידי כבר פלאגין (§18 ב-PRD).

| # | משימה | שכבה | תלות | סטטוס |
|---|---|---|---|---|
| 0.1 | ממשקי TypeScript גרסתיים לכל סוג פלאגין (engine/importer/overhang) — קלט/פלט, manifest permissions (§18.1) — ב-kuziSlicer | חוזה | — | לביצוע |
| 0.1-Host | ✅ **בוצע:** שלד `kuziSlicer.PluginHost` — `PluginHost.Contracts` (DTOs: `PluginManifest`, `PluginInvokeRequest/Result`, `PluginProgressEvent`), `PluginHost.Core` (Manager/Engine/Accessor), `PluginHost.Api` (REST+SSE+SignalR) | חוזה+ליבה | — | **בוצע**, ראו §5 |
| 0.2 | Sandbox: תהליך OS נפרד לכל פלאגין, הרשאות מוצהרות מראש, fault isolation (§17.2) | ליבה (PluginHost) | 0.1-Host | ✅ בוצע (`PluginProcessAccessor`) |
| 0.3 | Plugin Manager: load/unload דינמי, enable/disable, מטא-דאטה (§17.3) — ללא מאגר ענן (זה P2) | ליבה (PluginHost) | 0.1-Host, 0.2 | ⚠ חלקי — רשימה/הרצה קיימות (`PluginManager`), enable/disable ו-hot-unload עדיין לביצוע |
| 0.4 | פירוק `gcodeGenerator.ts` הקיים ל-Manager (אורקסטרציה) + Engine (מתמטיקה טהורה) ב-kuziSlicer, שקורא ל-PluginHost דרך REST/SignalR במקום להריץ מקומית | ליבה (kuziSlicer) | 0.1, 0.7 | לביצוע |
| 0.5 | פירוק `profilesManager.ts` ל-Accessor (קריאה/כתיבה גולמית) + Manager | ליבה (kuziSlicer) | 0.1 | לביצוע |
| 0.6 | ניקוי `main.ts`: `ipcMain.handle` נשאר controller בלבד, קורא ל-Manager | ליבה | 0.4, 0.5 | לביצוע |
| 0.7 | קליינט PluginHost ב-Electron main process: עטיפת REST/SSE/SignalR מול `kuziSlicer.PluginHost`, כולל הרצת התהליך של ה-Host עצמו (spawn/lifecycle) כשהאפליקציה עולה | ליבה (kuziSlicer) | 0.1-Host | לביצוע |

**בדיקות Phase 0:**
| משימה | סוג בדיקה | מה נבדק | תוצאה |
|---|---|---|---|
| 0.1-Host | Unit (Engine: `PluginManifestValidator`) — 3 בדיקות | manifest תקין עובר; license חסר / version לא-semver נדחים עם שגיאה מפורשת | ✅ 3/3 עברו |
| 0.1-Host | Unit (Manager: `PluginManager`, עם fakes ל-Accessor/Process) — 3 בדיקות | plugin-id לא-קיים → כשל יחיד; manifest לא-תקין → כשל בלי הרצת תהליך; manifest תקין → אירועי process מועברים כלשונם | ✅ 3/3 עברו |
| 0.1-Host (Build) | Build מלא של הפתרון (4 פרויקטים) | 0 שגיאות קומפילציה | ✅ עבר (2 אזהרות NuGet advisory לא-קשורות) |
| 0.2 | Integration (עדיין לביצוע — נדרש plugin-דמה אמיתי) | פלאגין שקורס/exit לא-0 לא מפיל את ה-Host; stderr מדווח בהודעת השגיאה | ⏳ לביצוע — הלוגיקה קיימת ב-`PluginProcessAccessor` (exit code handling) אך אין עדיין בדיקת integration עם exe אמיתי |
| 0.3 | Unit נוסף לכשה-enable/disable ייכתב | disable מונע קריאה לפלאגין | ⏳ לביצוע |
| 0.4, 0.5 | Unit ל-Engine (pure, ללא doubles); Unit ל-Manager (Accessor/Engine מדומים) | ההתנהגות הקיימת (STL→gcode, טעינת פרופיל) לא נשברה אחרי הפירוק — regression מול הפלט הנוכחי | ⏳ לביצוע |
| 0.6 | Integration | קריאת IPC מקצה-לקצה מחזירה את אותה תוצאה כמו לפני השינוי | ⏳ לביצוע |
| 0.7 | Integration (Electron main ↔ PluginHost אמיתי, `dotnet run`) | REST invoke מחזיר תוצאה; SSE/SignalR stream מגיע ל-renderer; ביטול פעולה מ-UI עוצר את הפלאגין | ⏳ לביצוע |

> תוצאות הבדיקה של `kuziSlicer.PluginHost` דווחו בצ'אט בזמן אמת בעת הבנייה: `dotnet build` → 0 שגיאות; `dotnet test` → 6/6 עברו, 0 נכשלו. אותה מדיניות דיווח (מס' שרצו/עברו/נכשלו, בכל פעם) תמשיך לכל משימה הבאה ב-kuziSlicer עצמו.

---

### Phase 2 — מודל הגדרות ופרופילים (§8)

| # | משימה | תלות |
|---|---|---|
| 2.1 | מדרג override תלת-שכבתי: גלובלי → פר-אובייקט → פר-חלק (טיפוסי DTO, לא רק UI) | Phase 0 |
| 2.2 | Config Wizard — הגדרת מדפסת ראשונית מודרכת (מסך + IPC) | 2.1 |
| 2.3 | ספריית פרופילי-יצרנים מרובה (Anker/Anycubic/BambuLab/Creality/Prusa/RatRig/Voron) — משתמש בממיר/מייבא שכבר קיים בקוד, לא נבנה מחדש | Phase 0 |

**בדיקות:**
| משימה | סוג בדיקה | מה נבדק |
|---|---|---|
| 2.1 | Unit (Engine: פונקציית resolve-override טהורה) | סדר עדיפויות פר-חלק > פר-אובייקט > גלובלי; ערך חסר נופל בחזרה כראוי |
| 2.2 | Integration (IPC מלא) + מקרי-קצה (ביטול אשף, מדפסת לא-מזוהה) | אשף שומר פרופיל תקין בסיום; ביטול לא כותב state חלקי |
| 2.3 | Integration (קריאת קבצי fixture אמיתיים לכל יצרן) | כל פרופיל-יצרן נטען ומאומת מול סכימה |

---

### Phase 3 — שכבת קישוריות (§9) — מתאם יחיד: Klipper/Moonraker

| # | משימה | תלות |
|---|---|---|
| 3.1 | ממשק "חיבור מדפסת" מופשט: connect/auth/send-file/start-pause-stop/telemetry/`getCameraStream()->unsupported`/raw passthrough | Phase 0 |
| 3.2 | מתאם Klipper/Moonraker (הראשון והיחיד ב-P0 — נטול-סיכון שחיקת-אישורים) | 3.1 |
| 3.3 | גילוי-רשת Bonjour למדפסות מקומיות | 3.1 |
| 3.4 | Raw G-code passthrough — שער אישור "מתקדם/לא בטוח" מפורש לפני שליחה | 3.1, 3.2 |
| 3.5 | נורמליזציית טלמטריה בסיסית למודל אירועים פנימי אחד (גם אם מתאם יחיד כרגע — כדי לא לנעול UI לפרוטוקול Moonraker) | 3.2 |

**בדיקות:**
| משימה | סוג בדיקה | מה נבדק |
|---|---|---|
| 3.1 | Unit | הממשק המופשט מתנהג זהה מול מתאם מדומה (fake adapter) |
| 3.2 | Integration (מול Moonraker אמיתי בסביבת בדיקה/mock server מתועד — **לא** מוקאים HTTP client עצמו) | connect/send-file/start/stop מוחזרים נכון; ניתוק רשת מטופל בלי קריסה |
| 3.3 | Integration | גילוי מדפסת מדומה ברשת מקומית מוצג ברשימה |
| 3.4 | Unit + Integration | שליחה ללא אישור מפורש נחסמת; עם אישור — נשלחת פעם אחת בלבד |
| 3.5 | Unit | poll-delta ממופה נכון לאירוע פנימי אחיד |

---

### Phase 4 — תצוגת תלת-ממד ו-UI בסיסי (§11, §12)

| # | משימה | תלות |
|---|---|---|
| 4.1 | שדרוג רינדור PBR בסיסי (תאורה סביבתית, צללים) על גבי `ModelViewer.tsx` הקיים | — |
| 4.2 | Gizmo לציור-תמיכות (ידני) — hook UI בלבד; מתחבר למנוע התמיכות כש-Phase 1 מוכן | 0.3 |
| 4.3 | מצבי בהיר/כהה — **דרישת בסיס**, לא ליטוש (תוקן ב-PRD כפער עקביות) | — |
| 4.4 | ריבוי-מיטות/משטחים בפרויקט אחד | Phase 0 |

**בדיקות:**
| משימה | סוג בדיקה | מה נבדק |
|---|---|---|
| 4.1 | ידני/חזותי (רינדור אינו לוגיקה טהורה — לא unit-testable משמעותית) | screenshot ידני לפני/אחרי, אין רגרסיה בביצועי FPS על מודל בדיקה גדול |
| 4.2 | Integration (UI) | ציור stroke מייצר רשימת נקודות תקינה שנשלחת ל-manager |
| 4.3 | ידני | מעבר ערכה לא משאיר רכיב "תקוע" בצבע הישן; נשמר בין הפעלות |
| 4.4 | Unit (Manager) + Integration | הוספת/הסרת מיטה בפרויקט לא פוגעת במיטות אחרות; state נשמר נכון |

---

### Phase 5 — אריזה וקבלה (Acceptance)

| # | משימה | תלות |
|---|---|---|
| 5.1 | אריזת סט תוספי ברירת-מחדל (Arcane Engine, Profile Importer, Overhang Detector) כ"starter extensions" מותקנים אוטומטית (§17.5) | Phase 0, 1 |
| 5.2 | טקסט EULA/הבהרת-אחריות (§17.8) במסך הפעלה ראשונה | — |
| 5.3 | **תרחיש קבלה מקצה-לקצה:** ייבוא STL → הגדרת פרופיל → חיתוך → ייצוא G-code → חיבור מדפסת → שליחה | כל השלבים |

**בדיקות:**
| משימה | סוג בדיקה |
|---|---|
| 5.1 | Integration — הפעלה ראשונה כוללת את שלושת התוספים פעילים בלי התקנה ידנית |
| 5.2 | ידני — הטקסט מוצג ולא ניתן לדלג בלי אישור |
| 5.3 | Integration מקצה-לקצה (E2E) — התרחיש השלם רץ ללא שגיאה על מודל STL בדיקה אמיתי + Moonraker מדומה |

---

### Phase 1 — מנוע החיתוך (§2–§5) — **מאושר ליישום GPLv3**

| # | משימה | תלות |
|---|---|---|
| 1.1 | Arachne — קווי היקף לרוחב-קו משתנה | Phase 0 + audit מקור/רישיון |
| 1.2 | ספריית מילוי משותפת (Lightning/Adaptive Cubic/Gyroid/3D Honeycomb/Rectilinear/Concentric) + מצב סנדוויץ' כברירת מחדל | Phase 0 |
| 1.3 | מנוע תמיכות organic+grid, זיהוי אוטומטי + עקיפה בציור (מתחבר ל-4.2) | 1.1, 4.2 |
| 1.4 | Wipe Tower (ברירת מחדל לריבוי-חומרים) | Phase 0 |
| 1.5 | מודל "מקור-פילמנט מופשט" בסיסי | Phase 0 |

**בדיקות:**
| משימה | סוג בדיקה | מה נבדק |
|---|---|---|
| 1.1 | Unit (Engine טהור) | רוחב-קו משתנה נכון על גיאומטריות פינה חדה/דקה; קובץ STL בדיקה עם fixture ידוע → פלט G-code deterministic מושווה ל-snapshot |
| 1.2 | Unit לכל דפוס מילוי + Unit למצב סנדוויץ' (צפיפות שכבות עליונות/תחתונות שונה מהליבה) | כיסוי שכבתי נכון, אין חורים בגבול צפיפות |
| 1.3 | Unit (זיהוי אוטומטי על מודל תלוי-ידוע) + Integration (ציור ידני דורס זיהוי אוטומטי) | תמיכה מיוצרת רק היכן שנדרש; עקיפה ידנית מכבדת stroke מ-4.2 |
| 1.4 | Unit | נפח ניקוי מחושב תואם למספר החלפות חומר בעבודה |
| 1.5 | Unit | AMS/ריבוי-אקסטרודר/יחיד — כולם ממופים לאותו מודל מקור-פילמנט |

---

## 3. אסטרטגיית בדיקות (מדיניות קבועה, לא רק לטבלאות למעלה)

מאמצים ישירות את §18.4 ב-PRD (`csharp-standards` מתורגם):

- **Engine** = unit בלבד, ללא doubles (פונקציות טהורות).
- **Manager** = unit עם Accessor/Engine מדומים.
- **Accessor / IPC** = integration מול אחסון אמיתי / צינור IPC מלא. **אסור למוקק קובץ/HTTP client/driver** — אם צריך, זו בדיקת integration.
- כל method ציבורי חדש, כל תיקון-באג (בדיקה כושלת קודם), כל שינוי לוגיקת Engine — מחייבים בדיקה.
- שערים: כל הבדיקות עוברות לפני שהפלאגין/השירות נחשב "גמור"; PR שמשנה התנהגות בלי בדיקה נדחה כברירת מחדל.

**דיווח תוצאות בדיקה:** בסיום כל משימה (לא רק כל Phase) אדווח כאן בצ'אט: מס' בדיקות שרצו / עברו / נכשלו, ואילו נכשלו ולמה — **בכל פעם**, גם כשהכול ירוק.

---

## 4. שאלות פתוחות לאישור

1. **§0 — נפתר:** נבחר GPL-3.0-or-later עבור מנוע Arachne/PS. נותר audit מקור והפצה לפני הכנסת קוד צד-שלישי ולפני release.
2. סדר הביצוע: השלמת חוזי Phase 0 ותבניות, ואז Phase 1 במקביל ל-2 → 3 → 4 → 5.
3. **חדש — `kuziSlicer.PluginHost`:** הריפו נוצר מקומית (`D:\Development\kuziSlicer.PluginHost`) עם `git init` + commit ראשון, **לא נדחף** לשום remote (GitHub/אחר). לאשר: (א) האם ליצור remote (GitHub) עבורו, ותחת איזה owner/org? (ב) האם הריפו הזה נכנס לאותה מדיניות רישוי כמו kuziSlicer עצמו (§17.9) — Apache-2.0 מוצע ב-README, לאשר או לשנות.
4. חלוקת ה-Manager/Engine/Accessor עכשיו קיימת **בשתי שפות/ריפואים** (TypeScript ב-kuziSlicer, C# ב-PluginHost) שמדברים דרך REST/SSE/SignalR. זה תואם ל-§18.5 בפרד (שתי הצדדים בונים מחדש את שלוש השכבות פנימית) — לאשר שזו אכן הכוונה, לא צורך לאחד לריפו אחד.

---

**ממתין לאישורך לפני תחילת מימוש.**
