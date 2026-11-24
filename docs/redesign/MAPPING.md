| # | Design screen | Title | Code | Status | Notes |
|---|---|---|---|---|---|
| 1 | `Main` | יומן | `TraineeMobileView` (journal section) + `ui/GlassDock` | Done | Top bar rebuilt: safe-area aware, 44px glass actions, no clipping under the status bar/notch |
| 2 | `DatePicker` | בחירת תאריך · חודש / שנה | `journal/CalendarSheet` | Done | Month/year picker + "חזור להיום" |
| 3 | `JournalActivity` | יומן · פעילות וכרטיסי ארוחה | `TraineeMobileView` (activity + meal cards) | Done | Weekly ring cards, steps card, workout/cardio choice sections, sleep ± stepper; verified light/dark. Selections are gray (design draws them orange) |
| 4 | `JournalStates` | יומן · יום חסום / תשקיף / תזכורות | `TraineeMobileView` | Partial | Tokens + color rules; not re-verified |
| 5 | `AddMeal` | הוספת ארוחה | `AddMealDrawer` (hub) | Done | Keeps existing search bar and draft footer |
| 6 | `PhotoResult` | ניתוח תמונה AI | `AddMealDrawer` (photo tab) | Done | Capture tab (plate + nutrition-label) rebuilt: segmented mode, photo cards, glass actions, pinned "נתח את הצלחת"; result stage as before. Tested with an uploaded image, not a live AI call |
| 7 | `AiQuickContext` | דיוק מהיר לניתוח AI | `AiQuickContextPanel` | Done | Grouped chips by category, serving tools, personal chip, pinned analyse CTA; verified dark/light |
| 8 | `QuickLog` | תיאור במילים / קול | `AddMealDrawer` (text/voice tab) | Done | Large borderless field, sample chips, CTA + orange mic FAB; the design's live item preview is not implemented |
| 9 | `Barcode` | סריקת ברקוד | `BarcodeScannerModal` | Done | Viewfinder + result stage (product, kcal/macros, add / scan another). Per-unit stepper not included (quantity is edited in the meal items step) |
| 10 | `SavedMeals` | ארוחות שמורות והיסטוריה | `SavedMealsLibraryTab` | Done | Filter chips 40px in a scrollable row, emoji removed, neutral banners |
| 11 | `AiRecommend` | מה לאכול? | `AddMealDrawer` (recommend tab) | Done | Rebuilt: coach option cards with glass "בחר והוסף", macro-finisher card with orange remaining pill + "הצע 3 אחרות", learned-preference chips + input; verified light/dark |
| 12 | `MealItems` | מרכיבי הארוחה | `AddMealDrawer` (items step) | Done | Same result stage as PhotoResult |
| 13 | `MealTime` | שעת ארוחה | `TraineeMobileView` (meal-time sheet) | Done | Snap wheel (hours/minutes, CSS scroll-snap), now / by-menu shortcuts, 56px save. Snapping verified with mouse wheel; touch swipe not verifiable in the headless harness |
| 14 | `ServingTools` | כלים ויחידות מידה | `ServingToolsManagerModal` | Partial | Sheet + neutral instruction box; dense form kept |
| 15 | `AiSync` | ניתוח AI ברקע | `BackgroundAiSyncBanner` | Partial | Neutral tints |
| 16 | `Metrics` | מדדים | `TraineeMobileView` (metrics section) | Done | Weight/water/measurement cards, 52px weight entry, check-in section; verified light/dark. Week strip kept (edits past days) |
| 17 | `CheckIn` | מדדים · צ׳ק-אין שבועי | `TraineeMobileView` (check-in section) | Done | Weekly stats grid, 44px rating tiles, textarea, pinned actions; selection stays gray per color rules (design shows orange) |
| 18 | `StepsCard` | מד צעדים יומי | `DailyStepsCard` | Done | Rebuilt card: big count, target, progress, source chip, sync/manual actions, help card; verified with a synced-steps fixture. The design's source-picker list is not implemented (source is automatic) |
| 19 | `MeasureGuide` | מדריך מדידת היקפים | `BodyMeasurementGuide` | Done | Stepper per design: zone tabs, figure + numbered tips, single value input with "הבא", range validation; verified in wizard (light/dark). Region cards of OnbMeasure not built |
| 20 | `Profile` | פרופיל | `TraineeProfileView` + `ui/ThemeToggle` | Done | Identity header, theme toggle, 2×2 stat cards, readable meal history (date/time LTR, no ISO strings); push-settings card restyled; verified light/dark |
| 21 | `AuthLogin` | התחברות | `AuthGateView` | Done | Redesigned earlier on main |
| 22 | `AuthRegister` | הרשמת מתאמן | `AuthGateView` | Partial | Step counter fixed (RTL flip); same view otherwise |
| 23 | `AuthPending` | ממתין לאישור מאמן | `PendingApprovalView` (new, used by `app/page.tsx`) | Done | "בדוק שוב" re-fetches; paused accounts get their own copy |
| 24 | `ForceUpdate` | עדכון חובה | `AndroidForceUpdateGate` | Done | Full-screen layout, version cards, pinned actions (verified via temporary preview route, removed) |
| 25 | `OnboardingPersonal` | שאלון · פרטים אישיים | `TraineeOnboardingWizard` (step 1) | Done | Full-screen layout, 52px inputs |
| 26 | `OnbLifestyle` | שאלון · שגרה ושינה | `TraineeOnboardingWizard` (step 2) | Done | Unboxed groups, 40px chips, pinned back/next; verified dark at 390px (light spot-checked on the last step) |
| 27 | `OnbTraining` | שאלון · אימונים והליכות | `TraineeOnboardingWizard` (step 3) | Done | Unboxed groups, 40px chips, pinned back/next; verified dark at 390px (light spot-checked on the last step) |
| 28 | `OnbMeasure` | שאלון · היקפים | `TraineeOnboardingWizard` (step 4) | Partial | Pill zone tabs in the shared guide; design's per-region cards not built |
| 29 | `OnboardingNutrition` | שאלון · סגנון תזונה | `TraineeOnboardingWizard` (step 5) | Done | Unboxed groups, 40px chips, pinned back/next; verified dark at 390px (light spot-checked on the last step) |
| 30 | `OnbSensitivities` | שאלון · רגישויות והערות | `TraineeOnboardingWizard` (step 6) | Done | Unboxed groups, 40px chips, pinned back/next; verified dark at 390px (light spot-checked on the last step) |
| 31 | `Coach` | מאמן · מצבת מתאמנים | `CoachDashboardView` | Done | Header, flat group chips, search, cards per design |
| 32 | `CoachTrainee` | מאמן · תפריט ויומן של מתאמן | `CoachDashboardView` | Partial | Header + tabs; summary rows; long goal/observation forms reflowed to full-width blocks (not rebuilt) |
| 33 | `CoachMenu` | מאמן · תפריט מתאמן | `CoachDashboardView` | Not restructured | Color rules only |
| 34 | `CoachJournal` | מאמן · יומן אכילה ופידבק | `CoachDashboardView` | Partial | Reachable as the "יומן" tab of the trainee inspector; original journal cards |
| 35 | `CoachAccess` | מאמן · עריכת פרטי גישה | `CoachDashboardView` | Not restructured | Color rules only |
| 36 | `CoachAccounts` | מאמן · חשבונות ושיתוף | `CoachDashboardView` | Done | Invite-code card, status filter chips, account rows with expandable actions (share, activate/block, disconnect, reset password, delete); verified light/dark |
| 37 | `CoachShare` | מאמן · שיתוף מתאמן | `CoachDashboardView` | Not restructured | Color rules only |
| 38 | `CoachNewTrainee` | מאמן · פתיחת מתאמן חדש | `CoachDashboardView` | Not restructured | Modal is now a bottom sheet |
| 39 | `CoachNewGroup` | מאמן · קבוצה חדשה | `CoachDashboardView` | Not restructured | Modal is now a bottom sheet |
| 40 | `CoachGroupActions` | מאמן · פעולות קבוצתיות | `CoachDashboardView` | Partial | Controls stack full-width on phones, neutral card; original controls |
| 41 | `CoachTemplates` | מאמן · ספריית טמפלייטים | `CoachDashboardView` | Partial | Library cards + collapsible meal editor + assign panel; editor form itself is the original |
| 42 | `CoachLibrary` | מאמן · ספריית ארוחות ושאלות | `CoachSavedMealsPanel` | Partial | Cards and reply composer restyled (48px actions); original reply flow |
| 43 | `CoachAiPrefs` | מאמן · הנחיות AI וצ׳ק-אין | `CoachDashboardView` | Not restructured | Color rules only |
| 44 | `CoachAlerts` | מאמן · התראות בזמן אמת | `CoachAlertSettingsModal` | Partial | Bottom sheet; neutral checkbox |
| 45 | `CoachPush` | מאמן · שליחת פוש | `CoachPushModal` | Partial | Modal is now a bottom sheet |
| 46 | `CoachOnb1` | מאמן · הגדרה 1 | `CoachOnboardingWizard` | Done | Shared wizard layout; neutral selections; verified dark (light spot-checked on steps 3 and 5) |
| 47 | `CoachOnb2` | מאמן · הגדרה 2 | `CoachOnboardingWizard` | Done | Shared wizard layout; neutral selections; verified dark (light spot-checked on steps 3 and 5) |
| 48 | `CoachOnb3` | מאמן · הגדרה 3 | `CoachOnboardingWizard` | Partial | Same layout; dense settings form kept (verified dark/light) |
| 49 | `CoachOnb4` | מאמן · הגדרה 4 | `CoachOnboardingWizard` | Done | Shared wizard layout; neutral selections; verified dark (light spot-checked on steps 3 and 5) |
| 50 | `CoachOnb5` | מאמן · הגדרה 5 | `CoachOnboardingWizard` | Done | Shared wizard layout; neutral selections; verified dark (light spot-checked on steps 3 and 5) |
| 51 | `AdminApprovals` | מנהל · ממתינים לאישור | `CoachDashboardView` (pending queue) | Partial | Rebuilt as cards per design; not screenshot-verified (needs pending-trainee fixture) |
| 52 | `AdminCoaches` | מנהל · ניהול מאמנים | `CoachDashboardView` (admin section) | Partial | Header + table as stacked cards; original actions |
| 53 | `AdminChips` | מנהל · צ׳יפים גלובליים | `QuickChipsAdminPanel` | Done | Cards grouped by category, 52px inputs, removable chips |
| 54 | `AdminScrapers` | מנהל · סקרייפרים ומאגר מזון | `AdminScrapersPanel` | Partial | KPI grid, neutral banners, code snippets isolated; source rows unchanged |
| 55 | `AdminVersions` | מנהל · בקרת גרסאות | `CoachDashboardView` (admin section) | Partial | Mixed-direction strings isolated (bdi), 52px fields; original policy form |


## Open follow-ups

- AI correction ("תקן") on the result screen is UI only; backend not implemented. See `docs/redesign/TODO-ai-correction.md`.
