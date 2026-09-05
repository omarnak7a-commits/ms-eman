# figma-make-app

React + Vite + Tailwind CSS project running inside Figma Make.

## Development Server

A Vite development server is **already running** on `$PORT` (default 8443). You don't need to start it manually.

- Preview URL: The user can access the running app through the preview panel
- Hot reload: Changes to source files are reflected immediately

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

The React app lives in `frontend/` (Vercel builds it with
`cd frontend && npm install && npm run build`); the FastAPI app lives in
`backend/` and is exposed to Vercel through `api/index.py`.

- `frontend/src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `frontend/src/App.tsx` - Primary application component and the usual starting point for UI work
- `frontend/src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `frontend/index.html` - Vite HTML shell containing the `#root` element, the viewport meta tag, the ES5 boot watchdog, and the `src/main.tsx` module script
- `frontend/package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `frontend/vite.config.ts` - Vite configuration with React, Tailwind CSS v4, and Figma Make plugins plus the `@` alias for `src`
- `frontend/dist/` - GENERATED build output; git-ignored, produced by Vercel on every deploy
- `vercel.json` / `api/index.py` - deployment architecture (see README "Deployment architecture")

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `frontend/vite.config.ts`. `frontend/src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `frontend/src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`frontend/src/main.tsx` imports `frontend/src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.
