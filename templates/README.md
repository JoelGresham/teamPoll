# Poll Templates

This directory contains poll templates that can be shared and version-controlled in git.

## What's Included

- **poll-templates.json**: Contains poll questions and structure (NO responses or user data)
- Templates include only original polls (no reruns)
- Only unfinished polls are included (so they can be used as templates)

## Usage

### Exporting Templates

1. Go to the Admin Dashboard
2. Click "Export Templates" button
3. This will download a `poll-templates.json` file with all current unfinished, non-rerun polls

### Importing Templates

1. Go to the Admin Dashboard
2. Click "Import Templates" button
3. Select a `poll-templates.json` file
4. The templates will be imported as new polls ready to use

## Version Control

- ✅ **Commit to git**: Poll templates (questions, structure)
- ❌ **Exclude from git**: Database files, responses, user data

This allows teams to:
- Share poll templates across environments
- Version control poll questions
- Import standardized polls without recreating them manually
