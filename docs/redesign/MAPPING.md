| # | Design screen | Title | Code | Status | Notes |
|---|---|---|---|---|---|
| 1 | `Main` | יומן | `TraineeMobileView` (journal section) + `ui/GlassDock` | Done | Legacy top bar (logo/user/logout/sync) kept — see "Not matched" |
| 2 | `DatePicker` | בחירת תאריך · חודש / שנה | `journal/CalendarSheet` | Done | Month/year picker + "חזור להיום" |
| 3 | `JournalActivity` | יומן · פעילות וכרטיסי ארוחה | `TraineeMobileView` (activity + meal cards) | Partial | Tokens, color rules, hit areas; card layout not re-verified against design |
| 4 | `JournalStates` | יומן · יום חסום / תשקיף / תזכורות | `TraineeMobileView` | Partial | Tokens + color rules; not re-verified |
| 5 | `AddMeal` | הוספת ארוחה | `AddMealDrawer` (hub) | Done | Keeps existing search bar and draft footer |
| 6 | `PhotoResult` | ניתוח תמונה AI | `AddMealDrawer` (photo tab) | Partial | Color rules/tokens; layout is the old tabbed sheet, not the full-screen photo-first layout |
| 7 | `AiQuickContext` | דיוק מהיר לניתוח AI | `AiQuickContextPanel` | Partial | Neutral tints; layout unchanged |
| 8 | `QuickLog` | תיאור במילים / קול | `AddMealDrawer` (text/voice tab) | Done | Large borderless field, sample chips, CTA + orange mic FAB; the design's live item preview is not implemented |
| 9 | `Barcode` | סריקת ברקוד | `BarcodeScannerModal` | Done | Viewfinder + neutral controls. Result stepper from the design is not in this modal (result goes to the draft as before) |
| 10 | `SavedMeals` | ארוחות שמורות והיסטוריה | `SavedMealsLibraryTab` | Partial | Neutral tints; layout unchanged |
| 11 | `AiRecommend` | מה לאכול? | `AddMealDrawer` (recommend tab) | Partial | Color rules; layout unchanged |
| 12 | `MealItems` | מרכיבי הארוחה | `AddMealDrawer` (items step) | Partial | Color rules; layout unchanged |
| 13 | `MealTime` | שעת ארוחה | `TraineeMobileView` (meal-time sheet) | Partial | Wheel/snap behavior not changed |
| 14 | `ServingTools` | כלים ויחידות מידה | `ServingToolsManagerModal` | Partial | Modal is now a bottom sheet; layout unchanged |
| 15 | `AiSync` | ניתוח AI ברקע | `BackgroundAiSyncBanner` | Partial | Neutral tints |
| 16 | `Metrics` | מדדים | `TraineeMobileView` (metrics section) | Partial | Week strip kept (edits past days); card order differs from design |
| 17 | `CheckIn` | מדדים · צ׳ק-אין שבועי | `TraineeMobileView` (check-in section) | Done | Weekly stats grid, 44px rating tiles, textarea, pinned actions; selection stays gray per color rules (design shows orange) |
| 18 | `StepsCard` | מד צעדים יומי | `DailyStepsCard` | Partial | Neutral buttons/tokens; layout unchanged |
| 19 | `MeasureGuide` | מדריך מדידת היקפים | `BodyMeasurementGuide` | Partial | Tokens only |
| 20 | `Profile` | פרופיל | `TraineeProfileView` + `ui/ThemeToggle` | Partial | Theme toggle (system/dark/light) present; layout partially restyled |
| 21 | `AuthLogin` | התחברות | `AuthGateView` | Done | Redesigned earlier on main |
| 22 | `AuthRegister` | הרשמת מתאמן | `AuthGateView` | Partial | Same view; not re-verified |
| 23 | `AuthPending` | ממתין לאישור מאמן | `PendingApprovalView` (new, used by `app/page.tsx`) | Done | "בדוק שוב" re-fetches; paused accounts get their own copy |
| 24 | `ForceUpdate` | עדכון חובה | `AndroidForceUpdateGate` | Partial | Tokens only; native-only, not renderable in browser |
| 25 | `OnboardingPersonal` | שאלון · פרטים אישיים | `TraineeOnboardingWizard` (step 1) | Done | Full-screen layout, 52px inputs |
| 26 | `OnbLifestyle` | שאלון · שגרה ושינה | `TraineeOnboardingWizard` (step 2) | Partial | Shares wrapper restyle; step not individually verified |
| 27 | `OnbTraining` | שאלון · אימונים והליכות | `TraineeOnboardingWizard` (step 3) | Partial | Shares wrapper restyle; step not individually verified |
| 28 | `OnbMeasure` | שאלון · היקפים | `TraineeOnboardingWizard` (step 4) | Partial | Shares wrapper restyle; step not individually verified |
| 29 | `OnboardingNutrition` | שאלון · סגנון תזונה | `TraineeOnboardingWizard` (step 5) | Partial | Neutral selections; not individually verified |
| 30 | `OnbSensitivities` | שאלון · רגישויות והערות | `TraineeOnboardingWizard` (step 6) | Partial | Neutral selections; not individually verified |
| 31 | `Coach` | מאמן · מצבת מתאמנים | `CoachDashboardView` | Partial | Dock from earlier work; section nav is now flat scrollable chip rows; trainee cards/filters still the old layout |
| 32 | `CoachTrainee` | מאמן · תפריט ויומן של מתאמן | `CoachDashboardView` | Not restructured | Color rules only |
| 33 | `CoachMenu` | מאמן · תפריט מתאמן | `CoachDashboardView` | Not restructured | Color rules only |
| 34 | `CoachJournal` | מאמן · יומן אכילה ופידבק | `CoachDashboardView` | Not restructured | Color rules only |
| 35 | `CoachAccess` | מאמן · עריכת פרטי גישה | `CoachDashboardView` | Not restructured | Color rules only |
| 36 | `CoachAccounts` | מאמן · חשבונות ושיתוף | `CoachDashboardView` | Not restructured | Color rules only |
| 37 | `CoachShare` | מאמן · שיתוף מתאמן | `CoachDashboardView` | Not restructured | Color rules only |
| 38 | `CoachNewTrainee` | מאמן · פתיחת מתאמן חדש | `CoachDashboardView` | Not restructured | Modal is now a bottom sheet |
| 39 | `CoachNewGroup` | מאמן · קבוצה חדשה | `CoachDashboardView` | Not restructured | Modal is now a bottom sheet |
| 40 | `CoachGroupActions` | מאמן · פעולות קבוצתיות | `CoachDashboardView` | Not restructured | Color rules only |
| 41 | `CoachTemplates` | מאמן · ספריית טמפלייטים | `CoachDashboardView` | Not restructured | Color rules only |
| 42 | `CoachLibrary` | מאמן · ספריית ארוחות ושאלות | `CoachSavedMealsPanel` | Not restructured | Neutral tints |
| 43 | `CoachAiPrefs` | מאמן · הנחיות AI וצ׳ק-אין | `CoachDashboardView` | Not restructured | Color rules only |
| 44 | `CoachAlerts` | מאמן · התראות בזמן אמת | `CoachAlertSettingsModal` | Partial | Bottom sheet; neutral checkbox |
| 45 | `CoachPush` | מאמן · שליחת פוש | `CoachPushModal` | Partial | Modal is now a bottom sheet |
| 46 | `CoachOnb1` | מאמן · הגדרה 1 | `CoachOnboardingWizard` | Not restructured | Color rules only |
| 47 | `CoachOnb2` | מאמן · הגדרה 2 | `CoachOnboardingWizard` | Not restructured | Color rules only |
| 48 | `CoachOnb3` | מאמן · הגדרה 3 | `CoachOnboardingWizard` | Not restructured | Color rules only |
| 49 | `CoachOnb4` | מאמן · הגדרה 4 | `CoachOnboardingWizard` | Not restructured | Color rules only |
| 50 | `CoachOnb5` | מאמן · הגדרה 5 | `CoachOnboardingWizard` | Not restructured | Color rules only |
| 51 | `AdminApprovals` | מנהל · ממתינים לאישור | `CoachDashboardView` (pending queue) | Partial | Rebuilt as cards per design; not screenshot-verified (needs pending-trainee fixture) |
| 52 | `AdminCoaches` | מנהל · ניהול מאמנים | `CoachDashboardView` (admin section) | Partial | Table renders as stacked cards on phones; header/actions not rebuilt |
| 53 | `AdminChips` | מנהל · צ׳יפים גלובליים | `QuickChipsAdminPanel` | Not restructured | Color rules only |
| 54 | `AdminScrapers` | מנהל · סקרייפרים ומאגר מזון | `AdminScrapersPanel` | Not restructured | Neutral tints |
| 55 | `AdminVersions` | מנהל · בקרת גרסאות | `CoachDashboardView` (admin section) | Not restructured | Color rules only |
