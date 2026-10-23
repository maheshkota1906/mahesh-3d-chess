# Mahesh 3D Chess Arena

3D browser chess with computer opponent, legal chess rules via chess.js, custom GLB upload, clock, move history, and online rooms.

## Project structure

- `public/` — browser app, styles, and HDR environment
- `api/rooms.js` — Vercel serverless endpoint for online rooms
- `migrations/0001_create_chess_rooms.sql` — Supabase database schema
- `vercel.json` — Vercel project configuration

## Deploy to Vercel

1. Upload the entire contents of this project folder to the root of a new GitHub repository. Preserve `public/`, `api/`, and `migrations/` as folders.
2. Create a Supabase project at https://supabase.com/ .
3. In Supabase SQL Editor, run the full SQL in `migrations/0001_create_chess_rooms.sql`.
4. In Supabase Project Settings → API, copy the Project URL and the `service_role` secret. Keep the service-role key private.
5. Import the GitHub repository at https://vercel.com/new .
6. In Vercel Project Settings → Environment Variables, add `SUPABASE_URL` (the project URL) and `SUPABASE_SERVICE_ROLE_KEY` (the service-role secret) for Production, Preview, and Development as needed. Redeploy after adding them. Never put the service-role key in frontend code or commit it to GitHub.
7. Open the deployed URL and test computer mode, then create a room in one browser and join its code from a second browser/device.

## Notes / limitations

- Online room updates use short polling rather than Hatchable's event service.
- Multiplayer requires the Supabase table and Vercel environment variables above; without them, room endpoints intentionally return a setup error.
- Sound files were not present in the original upload. Computer mode uses remote Chess.com sound URLs; the original app references local `/sounds/` files for online mode, so local online-mode sound assets still need to be added or that behavior adjusted.
- The computer opponent is a lightweight heuristic, not a full-strength chess engine.
- Custom GLB models are loaded locally in the visitor's browser and are not uploaded to the server.
- This project is separate from the Academy project.
