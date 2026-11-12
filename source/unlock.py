#!/usr/bin/env python3
"""Unlock the site's data for maintenance. Usage: FT_PASS='family password' python3 unlock.py OUTDIR
Writes people.json, gallery.json and pages/*.jpg into OUTDIR (keep them off GitHub)."""
import os, sys, re, json, base64, pathlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
root = pathlib.Path(__file__).resolve().parent.parent; out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
cfg = json.loads((root/'source'/'site_config.json').read_text())
pw = re.sub(r'[^a-z0-9]', '', os.environ['FT_PASS'].lower())
key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=base64.b64decode(cfg['salt']), iterations=600000).derive(pw.encode())
aes = AESGCM(key)
def un(p): b = p.read_bytes(); return aes.decrypt(b[:12], b[12:], None)
(out/'people.json').write_bytes(un(root/'people.json.enc')); (out/'gallery.json').write_bytes(un(root/'gallery.json.enc'))
(out/'pages').mkdir(exist_ok=True)
for f in (root/'pages').glob('*.enc'): (out/'pages'/f.name[:-4]).write_bytes(un(f))
print('unlocked into', out)
