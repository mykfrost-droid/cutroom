# Cutroom working instructions

## Source of truth
- The canonical project is https://github.com/mykfrost-droid/cutroom on branch main.
- Start each task by checking the latest remote state and local changes. Synchronize before editing; preserve user edits and resolve conflicts without overwriting them.
- Work from the repository source files. Do not use an old ZIP, scratch copy, or hosted Sites deployment as the source of truth.

## Delivery
- Make the requested changes in the repository, run checks appropriate to the change, then commit and push the completed work to GitHub.
- Verify the resulting remote commit. Report its short SHA, checks performed, and any limitations.
- If local Git operations are unavailable, use the connected GitHub integration to read and commit the intended files. Tell the user when their local checkout needs a pull.
- Do not claim a change is available on GitHub until the remote write has succeeded. Report any blocked commit or push clearly.
- Do not force-push, discard user changes, or publish to a separate host unless the user requests it.

## Run locally
- Pull main in VS Code: git pull --ff-only origin main
- Serve the repository directory: npx serve .
- Open the printed localhost URL. Hard-refresh after JavaScript changes.
- The application source is index.html, style.css, app.js, media-import.js, and video-export.js. The ZIP is an old distribution artifact, not application source.
