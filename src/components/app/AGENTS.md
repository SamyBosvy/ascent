# Shared app components
- Route create/edit share `RouteDialog` (type read-only when editing); CSV import goes through `CsvImportDialog` (papaparse, column mapping, 500-row batches) and accepts the Settings export format.
- Screen loading placeholders share ScreenSkeleton and respect reduced motion — loading semantics and shapes stay consistent.
- Review has a persistent polite answer region, an explicit reveal button and focus transitions to the rating group and next reveal control — touch and keyboard share the same flow.
- Insights tables are generated from the same data as their aria-hidden charts — assistive readers receive equivalent values.
- The ⌘K palette (`CommandPalette`) searches server-side with 5-result limits and excludes archived/deleted routes unless toggled; app shortcuts stay silent while any dialog is open.
