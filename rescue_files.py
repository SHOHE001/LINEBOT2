import requests
import json
import sys

client_id = "1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com"
client_secret = "v6V3fKV_zWU7iw1DrpO1rknX"
refresh_token = "YOUR_OAUTH_REFRESH_TOKEN"

token_url = "https://oauth2.googleapis.com/token"

def get_access_token():
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }
    r = requests.post(token_url, data=payload)
    r.raise_for_status()
    return r.json()["access_token"]

try:
    access_token = get_access_token()
except Exception as e:
    print(f"Error getting access token: {e}")
    sys.exit(1)

headers = {"Authorization": f"Bearer {access_token}"}

def list_trashed_files():
    files = []
    page_token = None
    while True:
        url = "https://www.googleapis.com/drive/v3/files"
        params = {
            "q": "trashed = true and mimeType != 'application/vnd.google-apps.folder'",
            "fields": "nextPageToken, files(id, name)",
            "pageSize": 1000
        }
        if page_token:
            params["pageToken"] = page_token
        
        r = requests.get(url, headers=headers, params=params)
        r.raise_for_status()
        data = r.json()
        files.extend(data.get("files", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return files

try:
    all_trashed = list_trashed_files()
except Exception as e:
    print(f"Error listing trashed files: {e}")
    sys.exit(1)

keywords = ["GMT", "Recording", "録音", "WP制作", "2025", "2026"]
target_files = [f for f in all_trashed if any(k in f["name"] for k in keywords)]

restored_names = []
for f in target_files:
    file_id = f["id"]
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
    try:
        r = requests.patch(url, headers=headers, json={"trashed": False})
        if r.status_code == 200:
            restored_names.append(f["name"])
        else:
            print(f"Failed to restore {f['name']}: {r.text}")
    except Exception as e:
        print(f"Error restoring {f['name']}: {e}")

if restored_names:
    print("RESCUED_FILES_START")
    for name in restored_names:
        print(name)
    print("RESCUED_FILES_END")
else:
    print("No matching files found in trash.")
