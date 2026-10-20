import hashlib
from importlib.resources import files
import json
import posixpath
import re
import unittest

import rocket_demo


class AssetTests(unittest.TestCase):
    def test_local_module_imports_and_vendor_integrity_are_complete(self):
        self.assertTrue(hasattr(rocket_demo, 'ASSETS'), 'Static asset manifest is required')
        assets = rocket_demo.ASSETS
        self.assertIn('/modules/renderer-3d.mjs', assets)
        self.assertIn('/vendor/three/three.core.js', assets)
        for url,(name,mime) in assets.items():
            resource=files('rocket_ui').joinpath(name)
            self.assertTrue(resource.is_file(), name)
            if url.endswith(('.mjs','.js')):
                self.assertIn('javascript',mime)
                source=resource.read_text(encoding='utf-8')
                imports=re.findall(r"(?:from\s*|import\s*\()\s*['\"]([^'\"]+)['\"]",source)
                for dependency in imports:
                    if dependency.startswith('.'):
                        self.assertIn(posixpath.normpath(posixpath.join(posixpath.dirname(url),dependency)),assets)
        manifest=json.loads(files('rocket_ui').joinpath('vendor/three/manifest.json').read_text())
        self.assertEqual(manifest['version'],'0.186.1')
        for name,checksum in manifest['files'].items():
            data=files('rocket_ui').joinpath('vendor/three',name).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(),checksum)
