#!/bin/bash

# 1. Add key data files (JSONs containing news, settlements, borders, etc.)
#    and the media folder (images/videos downloaded by main.py)
git add index.html mobile.html news_feed.json settlements.json strategic.json syria.json factions.json
git add media/

# 2. Check if there are changes to commit
if git diff-index --quiet HEAD --; then
    echo "⚠️ No changes detected. Map is already up to date."
else
    # 3. Commit with a timestamp
    timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    git commit -m "Map Data Update: $timestamp"

    # 4. Push to GitHub
    echo "🚀 Pushing update to GitHub..."
    git push

    echo "✅ Success! GitHub Pages will refresh in 1-2 minutes."
fi
