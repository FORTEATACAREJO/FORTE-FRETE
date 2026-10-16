import importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('signing',Path(__file__).parents[1]/'scripts/android-signing.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class SigningTests(unittest.TestCase):
 def test_backup_rejects_git_tree(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);(root/'.git').mkdir()
   with self.assertRaises(RuntimeError):m.outside_repo(root/'backup')
 def test_upload_uses_stdin_not_arguments(self):
  payload={name:'test-secret-'+str(i) for i,name in enumerate(m.NAMES)}
  with patch.object(m,'run') as run:
   m.upload(payload)
   self.assertEqual(run.call_count,4)
   for call in run.call_args_list:
    self.assertFalse(any('test-secret-' in arg for arg in call.args[0]))
    self.assertTrue(call.kwargs['data'].startswith(b'test-secret-'))
 def test_backup_round_trip_with_disposable_key(self):
  payload=m.generate();password='disposable-test-password-only'
  sealed=m.encrypt(json.dumps(payload).encode(),password)
  self.assertNotIn(payload['FORTE_KEYSTORE_PASSWORD'].encode(),sealed)
  self.assertEqual(json.loads(m.encrypt(sealed,password,decrypt=True)),payload)
  with self.assertRaises(RuntimeError):m.encrypt(sealed,'incorrect-test-password',decrypt=True)
  altered=sealed[:-1]+bytes([sealed[-1]^1])
  with self.assertRaises(RuntimeError):m.encrypt(altered,password,decrypt=True)
if __name__=='__main__':unittest.main()
