# דוח התקדמות — Plugin Platform ו-kuziSlicer.store

**עודכן:** 2026-09-06  
**יעד:** ערכות התחלה ודמו לכל סוג פלאגין, זרם לוגים לדיבוג, וקטלוג `kuziSlicer.store` ציבורי עם CI ו-GitHub Pages.

## TL;DR

- החלטת §0 נסגרה: פלאגיני מנוע המבוססים על PS/OS/Arachne יפותחו תחת `GPL-3.0-or-later`, בכפוף ל-audit מקור והפצה.
- היישום מחולק לחוזים ותבניות, observability, חנות סטטית ו-CI, ולבסוף אינטגרציה ואימות.
- סטטוסי המסמך מתעדכנים רק לאחר build/test או אימות GitHub בפועל.

## גרף משימות

```text
P0 החלטת GPLv3 ───────────────┐
                              ├─> P1 חוזים + תבניות ──> P4 אינטגרציה ואימות
מיפוי סוגי פלאגינים ─────────┘              │
                                             ├─> P2 זרם לוגים
                                             └─> P3 kuziSlicer.store + CI/Pages
```

## התקדמות לפי Phase

| Phase | משימה | תיאור | סטטוס |
|---|---|---|---|
| P0 — החלטות | GPLv3 | בחירת `GPL-3.0-or-later` עבור קוד מנוע נגזר ועדכון PRD/HLD/workplan | ✅ הושלם |
| P0 — החלטות | גבול רישוי | שמירת Host/ליבה כתהליכים נפרדים והוספת gate ל-audit משפטי של אריזה והפצה | ✅ הושלם |
| P1 — Developer Experience | מיפוי סוגים | התאמת `engine`, `importer`, `exporter`, `tool`, `rapid printer extension` לחוזים הקיימים | ✅ הושלם |
| P1 — Developer Experience | Startup projects | פרויקט מינימלי ניתן להרצה לכל סוג פלאגין | ✅ הושלם |
| P1 — Developer Experience | Demo templates | דוגמת קלט/פלט, manifest, הוראות build/run/test לכל סוג | ✅ הושלם |
| P2 — Observability | Log stream | אירועי לוג מובנים, SSE ו-SignalR לצפייה קלה בדיבוג | ✅ הושלם |
| P2 — Observability | בדיקות | בדיקות correlation, תאימות JSON, truncation והעברת אירועי log | ✅ 12/12 Core; 32/32 בפתרון |
| P3 — Store | אתר קטלוג | אתר סטטי, schema, חמש דוגמאות פלאגינים ו-validation | ✅ הושלם |
| P3 — Store | CI | GitHub Actions לבדיקת הקטלוג וה-build | ✅ ירוק |
| P3 — Store | GitHub Pages | `amitkuzi/kuziSlicer.store` ציבורי ו-deployment ב-GitHub Pages | ✅ חי |
| P4 — Integration | Host ↔ templates | smoke test מול PluginHost לכל ארבע תבניות process-based | ✅ 4/4 עברו |
| P4 — Integration | kuziSlicer Simple/Advanced | build מלא + 42 בדיקות rapid printer extension | ✅ עבר |
| P4 — Handoff | מסירת המשך | handoff מסודר רק אם נתקלים בהתראת usage/context של 90% ומעלה | ⏳ לא נדרש כרגע |

## קריטריוני סיום

- לכל סוג פלאגין יש starter שנבנה, רץ ומדגים את החוזה שלו.
- ניתן לצרוך לוגים מובנים דרך SSE ולפחות ערוץ realtime נוסף, ללא חשיפת secrets.
- CI ירוק ב-PluginHost וב-`kuziSlicer.store`.
- אתר Pages ציבורי נגיש ומציג קטלוג תקין.
- build ובדיקות kuziSlicer עוברים, ומצבי Simple/Advanced נשארים שמישים.

## ראיות אימות

- `npm run test:plugintemplates`: חמישה manifests וארבעה תהליכי .NET עברו.
- `npm run test:printerextensions`: ‏42 בדיקות עברו.
- `npm run build`: Electron main/preload ו-Vite עברו.
- `dotnet test`: כל 32 בדיקות פתרון PluginHost עברו; Core ‏12/12.
- `kuziSlicer.store npm run check`: validation, ‏3/3 בדיקות ו-build של חמש רשומות עברו.
- GitHub Actions: CI ו-Pages deployment עברו; האתר זמין ב-`https://amitkuzi.github.io/kuziSlicer.store/`.
- חוב קיים: `Microsoft.OpenApi 2.0.0` מדווח כ-NU1903; יש לעדכן תלות בנפרד.
