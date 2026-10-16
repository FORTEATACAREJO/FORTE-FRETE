"""Exercise cloud preparation with disposable credentials, never production keys."""
import contextlib
import importlib.util
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cloud_signing', Path(__file__).parents[1] / 'scripts/android-signing-ci.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class CloudSigningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.disposable = m.signing.generate()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        env = {name: '' for name in m.signing.NAMES}
        env.update({m.SECRET: '', 'RUNNER_TEMP': str(self.root),
                    'GITHUB_ENV': str(self.root/'environment'), 'GITHUB_OUTPUT': str(self.root/'output')})
        self.env = patch.dict(os.environ, env)
        self.env.start(); self.addCleanup(self.env.stop)
        self.sealed = patch.object(m, 'SEALED', self.root/'upload.enc')
        self.cert = patch.object(m, 'CERT', self.root/'certificate.der')
        self.sealed.start(); self.cert.start()
        self.addCleanup(self.sealed.stop); self.addCleanup(self.cert.stop)

    def bootstrap(self):
        os.environ[m.SECRET] = 'Only-disposable-Tests-Password-12345!'
        with patch.object(m.signing, 'generate', return_value=self.disposable), contextlib.redirect_stdout(io.StringIO()):
            m.bootstrap()

    def test_missing_or_partial_configuration_never_claims_signed(self):
        self.assertFalse(m.prepare())
        os.environ[m.SECRET] = 'Only-disposable-Tests-Password-12345!'
        with self.assertRaises(RuntimeError): m.prepare()
        os.environ[m.SECRET] = ''
        os.environ['FORTE_KEY_ALIAS'] = 'partial'
        with self.assertRaises(RuntimeError): m.prepare()

    def test_short_or_simple_password_rejected_before_key_generation(self):
        for value in ('short', 'A'*40, 'lowercaseonlywithoutnumbersandsymbols'):
            os.environ[m.SECRET] = value
            with patch.object(m.signing, 'generate') as generate:
                with self.assertRaises(RuntimeError): m.bootstrap()
                generate.assert_not_called()

    def test_cloud_roundtrip_and_credential_masking(self):
        self.bootstrap()
        output = io.StringIO()
        with contextlib.redirect_stdout(output): self.assertTrue(m.prepare())
        values = dict(line.split('=',1) for line in (self.root/'environment').read_text().splitlines())
        self.assertEqual(values['FORTE_KEYSTORE_PASSWORD'], self.disposable['FORTE_KEYSTORE_PASSWORD'])
        self.assertEqual(Path(values['FORTE_KEYSTORE_FILE']).stat().st_mode & 0o777, 0o600)
        self.assertIn('::add-mask::' + self.disposable['FORTE_KEYSTORE_PASSWORD'], output.getvalue())
        self.assertNotIn(self.disposable['FORTE_KEYSTORE_PASSWORD'].encode(), m.SEALED.read_bytes())
        self.assertFalse(list(self.root.glob('*.jks')) == [])

    def test_existing_key_refuses_rotation_and_mixed_modes(self):
        self.bootstrap()
        with patch.object(m.signing, 'generate') as generate:
            with self.assertRaises(RuntimeError): m.bootstrap()
            generate.assert_not_called()
        os.environ['FORTE_KEY_ALIAS'] = 'legacy'
        with self.assertRaises(RuntimeError): m.prepare()

    def test_bad_password_tampering_and_certificate_mismatch_fail_closed(self):
        self.bootstrap()
        password = os.environ[m.SECRET]
        os.environ[m.SECRET] = 'Different-Test-Password-Only-67890!'
        with self.assertRaises(RuntimeError): m.prepare()
        self.assertFalse((self.root/'forte-upload.jks').exists())
        os.environ[m.SECRET] = password
        sealed = m.SEALED.read_bytes()
        m.SEALED.write_bytes(sealed[:-1] + bytes([sealed[-1]^1]))
        with self.assertRaises(RuntimeError): m.prepare()
        m.SEALED.write_bytes(sealed)
        m.CERT.write_bytes(b'not-the-certificate')
        with self.assertRaises(RuntimeError): m.prepare()
        self.assertFalse((self.root/'forte-upload.jks').exists())


if __name__ == '__main__':
    unittest.main()
