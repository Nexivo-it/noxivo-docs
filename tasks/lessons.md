# Noxivo Development Lessons

## Defensive Programming

- **Pattern**: MongoDB `.lean()` and Legacy Documents.
- **Problem**: Accessing properties on nested objects from `.lean()` queries (like `agency.whiteLabelDefaults.customDomain`) can cause `TypeError` if the document is missing that key, even if the schema marks it as `required`.
- **Solution**: ALWAYS use optional chaining (`?.`) and provide nullish coalescing (`?? null` or `?? {}`) when mapping results from `.lean()` or database results in general, especially in shared library code used by the dashboard.
- **Context**: Fixed a crash in `mapAgencySummary` in `apps/dashboard/lib/dashboard/agency-admin.ts`.
