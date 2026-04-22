# Noxivo Engine SDK Documentation

This is the developer documentation for the Noxivo Workflow Engine, built with Docusaurus.

## Structure

- `docs/`: Markdown/MDX source files.
- `docs/api-reference/`: Generated API documentation from OpenAPI.
- `static/openapi.json`: The source OpenAPI specification.

## Local Development

From the root of the project:

```bash
pnpm --filter @noxivo/workflow-engine-docs start
```

## Updating API Documentation

To update the API documentation when routes change:

1. Generate the new OpenAPI spec:
   ```bash
   pnpm --filter @noxivo/workflow-engine gen-openapi
   ```
2. Generate the Docusaurus MDX files:
   ```bash
   pnpm --filter @noxivo/workflow-engine-docs docusaurus gen-api-docs engine
   ```
3. Build the docs:
   ```bash
   pnpm --filter @noxivo/workflow-engine-docs build
   ```
