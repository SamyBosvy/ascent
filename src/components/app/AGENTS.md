# Shared app components
- Route create/edit share `RouteDialog` (type read-only when editing); CSV import goes through `CsvImportDialog` (papaparse, column mapping, 500-row batches) and accepts the Settings export format.
- Screen loading placeholders share ScreenSkeleton and respect reduced motion — loading semantics and shapes stay consistent.
- Review has a persistent polite answer region, an explicit reveal button and focus transitions to the rating group and next reveal control — touch and keyboard share the same flow.
- Insights tables are generated from the same data as their aria-hidden charts — assistive readers receive equivalent values.
- The ⌘K palette (`CommandPalette`) searches server-side with 5-result limits and excludes archived/deleted routes unless toggled; app shortcuts stay silent while any dialog is open.
- Empty lists share illustrated Empty and existing-flow actions; loading/errors/onboarding win — no misleading empties.
- Today time logging reuses QuickCapture's outbox/lock — no competing write flow.
- Editable overlays share ResponsiveDialog, latching mode while open and guarding dirty/saving closes; footers live outside scrollable forms — resize preserves input and keyboard space preserves Save.
- MobileNavigation owns mobile destinations and keyboard/drawer visibility; global bottom-nav dimensions drive shell padding, safe areas and session/toast clearance — fixed controls never cover the last action.
