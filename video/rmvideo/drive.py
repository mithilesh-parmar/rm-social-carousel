"""Optional Google Drive upload (build --upload-drive). No credentials live in the repo.

Auth, first match wins:
  1. GDRIVE_ACCESS_TOKEN   - an OAuth access token with drive.file scope
  2. GOOGLE_APPLICATION_CREDENTIALS - a service-account JSON (needs `pip install google-auth`);
     share the target folder with the service account's email.
Target folder: --drive-folder <id> or GDRIVE_FOLDER_ID.
"""
import json
import mimetypes
import os
import urllib.request

def _token():
    if os.environ.get('GDRIVE_ACCESS_TOKEN'):
        return os.environ['GDRIVE_ACCESS_TOKEN']
    sa = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
    if sa:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
        cr = service_account.Credentials.from_service_account_file(sa, scopes=['https://www.googleapis.com/auth/drive.file'])
        cr.refresh(Request())
        return cr.token
    raise RuntimeError('Drive upload needs GDRIVE_ACCESS_TOKEN or GOOGLE_APPLICATION_CREDENTIALS (never commit either)')

def upload(path, folder_id=None, name=None):
    folder_id = folder_id or os.environ.get('GDRIVE_FOLDER_ID')
    if not folder_id:
        raise RuntimeError('Drive upload needs --drive-folder or GDRIVE_FOLDER_ID')
    tok = _token()
    meta = {'name': name or os.path.basename(path), 'parents': [folder_id]}
    mime = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    # resumable session (works for large videos)
    req = urllib.request.Request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
                                 data=json.dumps(meta).encode(), method='POST',
                                 headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json; charset=UTF-8',
                                          'X-Upload-Content-Type': mime})
    with urllib.request.urlopen(req) as r:
        loc = r.headers['Location']
    with open(path, 'rb') as fh:
        data = fh.read()
    req = urllib.request.Request(loc, data=data, method='PUT', headers={'Content-Type': mime})
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read().decode())
    return res.get('id')
