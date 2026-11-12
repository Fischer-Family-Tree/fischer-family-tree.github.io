#!/usr/bin/env python3
"""Re-lock only people.json and gallery.json into the site. Usage: FT_PASS=... relock_data.py SITE_DIR"""
import os, sys, re, json, base64, pathlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
site=pathlib.Path(sys.argv[1]); cfg=json.loads((site/'source'/'site_config.json').read_text())
pw=re.sub(r'[^a-z0-9]','',os.environ['FT_PASS'].lower())
aes=AESGCM(PBKDF2HMAC(algorithm=hashes.SHA256(),length=32,salt=base64.b64decode(cfg['salt']),iterations=600000).derive(pw.encode()))
for n in ['people.json','gallery.json']:
    iv=os.urandom(12); (site/(n+'.enc')).write_bytes(iv+aes.encrypt(iv,pathlib.Path('/home/claude',n).read_bytes(),None))
print('relocked')
