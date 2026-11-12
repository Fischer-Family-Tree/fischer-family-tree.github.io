#!/usr/bin/env python3
"""Build the locked live site. Usage: make_live.py OUTDIR BACKEND_URL  (family password read from env FT_PASS)"""
import os, sys, json, hashlib, base64, pathlib, subprocess, shutil
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
out = pathlib.Path(sys.argv[1]); backend = sys.argv[2] if len(sys.argv) > 2 else ''
import re
pw = re.sub(r'[^a-z0-9]','',os.environ['FT_PASS'].lower())
cfgp = pathlib.Path('/home/claude/site_src/site_config.json')
salt = base64.b64decode(json.loads(cfgp.read_text())['salt']) if cfgp.exists() else os.urandom(16)
cfg = {'backend': backend, 'encrypted': True, 'preview': False, 'salt': base64.b64encode(salt).decode()}
cfgp.write_text(json.dumps(cfg))
key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=600000).derive(pw.encode())
aes = AESGCM(key)
def lock(src, dst):
    iv = os.urandom(12); dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(iv + aes.encrypt(iv, pathlib.Path(src).read_bytes() if not isinstance(src, bytes) else src, None))
out.mkdir(parents=True, exist_ok=True)
for old in out.glob('pages/*.enc'): pass
subprocess.run([sys.executable, '/home/claude/site_src/build_site.py', str(out)], check=True)
lock('/home/claude/people.json', out/'people.json.enc')
lock('/home/claude/gallery.json', out/'gallery.json.enc')
lock(b'ok', out/'check.enc')
for f in sorted(pathlib.Path('/home/claude/pages').glob('*.jpg')): lock(f, out/'pages'/(f.name+'.enc'))
(out/'.nojekyll').write_text('')
(out/'robots.txt').write_text('User-agent: *\nDisallow: /\n')
print('FAMKEY', hashlib.sha256(('fischer:'+pw).encode()).hexdigest())
