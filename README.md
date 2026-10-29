# Main Deck — Shared Team Tasks

An independent, modified version of Main Deck with a shared team task board.

> This project is based on [Main Deck](https://github.com/Utharam/Main-Deck), originally created by Utharam. This version is maintained by SERA06 and is not the official upstream project.

🌐 **Live app:** [https://sera06.github.io/main-deck-team-tasks/](https://sera06.github.io/main-deck-team-tasks/)

---

## What it does

Main Deck brings everyday work into one browser-based workspace. It combines personal planning tools with a team task board.

### Personal workspace

- Organize projects, milestones, tasks, calls, emails, meetings, and reminders.
- Capture quick thoughts on the Sticky Notes board.
- Keep recurring procedures in the SOP section.
- Use the dashboard and focus tools to plan the workday.
- Install the app as a Progressive Web App (PWA), where supported.

### Shared Team Tasks

- Create an account and a team, or join a team with its invite code.
- Create tasks and assign them to team members.
- View shared team tasks after signing in.
- Team task data is stored in the configured Supabase project. Members who join a team can currently update or delete that team's shared tasks.

## Data and privacy

- Personal Main Deck data is stored in the browser on the device where it was entered. It is not automatically shared with teammates.
- Team Tasks uses Supabase for sign-in and shared task storage. Its data is available to the authenticated members of the relevant team under the configured database policies.
- Clearing browser data can remove locally stored personal information. Use the app's export option if you need a backup.
- The Supabase publishable key is intended for browser use when Row Level Security (RLS) is correctly configured. **Never put a Supabase `service_role` or secret key in frontend code or a public repository.**

## Deploy your own copy

1. Create a Supabase project.
2. In Supabase **SQL Editor**, run [`supabase/team_tasks.sql`](supabase/team_tasks.sql).
3. Configure the app's Supabase project URL and publishable key in `js/supabase-config.js`.
4. In Supabase **Authentication → URL Configuration**, set your deployed site URL and add it to the allowed redirect URLs.
5. Publish the repository with GitHub Pages from the `main` branch and the repository root (`/(root)`).
6. Open the deployed site, create an account, create a team, and share its invite code with intended teammates.

Keep RLS enabled and review the policies in the SQL file before using the board with real team data. Do not share invite codes publicly.

## Run locally

Serve the repository with a local web server; opening `index.html` directly with a `file://` URL may prevent browser modules or authentication redirects from working correctly.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in a browser. Team sign-in also requires a valid Supabase configuration and the local URL to be allowed in Supabase Authentication settings.

## Technology

- HTML, CSS, and JavaScript ES modules
- IndexedDB for personal, device-local data
- Supabase Auth and database for shared team tasks
- Service worker and web app manifest for PWA support

## Attribution and license

This repository contains modifications to Main Deck by Utharam. Please retain the original project's copyright and license notices when redistributing the copied work. The upstream README identifies the project as MIT-licensed; verify the current upstream license and include its license text and required notices in this repository. This attribution statement does not replace the license terms.
