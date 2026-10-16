"""Cloud signing with a sealed recovery file and a GitHub Secret passphrase.

Only the encrypted envelope and public certificate may be committed. Never put
the passphrase in workflow inputs, repository variables, chat or artifacts.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('signing', Path(__file__).with_name('android-signing.py'))
signing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signing)
SEALED = Path('store/android-upload-key.enc')
CERT = Path('store/android-upload-cert.der')
SECRET = 'FORTE_SIGNING_BACKUP_PASSWORD'


def passphrase():
    value = os.environ.get(SECRET, '')
    classes = sum((any(c.islower() for c in value), any(c.isupper() for c in value),
                   any(c.isdigit() for c in value), any(not c.isalnum() for c in value)))
    if not 32 <= len(value) <= 256 or len(set(value)) < 12 or classes < 3 or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise RuntimeError('Use uma senha exclusiva de 32 a 256 caracteres, com pelo menos três entre maiúsculas, minúsculas, números e símbolos; sem repetições simples nem quebras de linha. Guarde uma cópia separada.')
    return value


def validated(payload):
    if not isinstance(payload, dict) or set(payload) != set(signing.NAMES):
        raise RuntimeError('Backup de assinatura inválido.')
    if any(not isinstance(v, str) or not v or '\n' in v or '\r' in v for v in payload.values()):
        raise RuntimeError('Backup de assinatura inválido.')
    try:
        raw = base64.b64decode(payload['FORTE_KEYSTORE_BASE64'], validate=True)
    except ValueError:
        raise RuntimeError('Chave de assinatura inválida.') from None
    if not raw or len(raw) > 100_000:
        raise RuntimeError('Tamanho de chave inválido.')
    return raw


def export_certificate(payload, key_path):
    env = os.environ.copy()
    env['FORTE_TEMP_KEY_PASSWORD'] = payload['FORTE_KEYSTORE_PASSWORD']
    return signing.run(['keytool', '-exportcert', '-keystore', str(key_path),
                        '-alias', payload['FORTE_KEY_ALIAS'], '-storepass:env',
                        'FORTE_TEMP_KEY_PASSWORD'], env=env)


def legacy():
    return {name: os.environ.get(name, '') for name in signing.NAMES}


def bootstrap():
    if SEALED.exists() or CERT.exists():
        raise RuntimeError('Já existe material de assinatura. Não gere outra chave; restaure a senha/backup existentes.')
    if any(legacy().values()):
        raise RuntimeError('Secrets de assinatura anteriores encontrados. Não substitua a chave existente.')
    password = passphrase()
    payload = signing.generate()
    sealed = signing.encrypt(json.dumps(payload).encode(), password)
    if json.loads(signing.encrypt(sealed, password, decrypt=True)) != payload:
        raise RuntimeError('Falha ao verificar a recuperação da chave.')
    with tempfile.TemporaryDirectory(prefix='forte-public-cert-') as folder:
        key = Path(folder) / 'upload.jks'
        key.write_bytes(validated(payload))
        key.chmod(0o600)
        certificate = export_certificate(payload, key)
    SEALED.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents silent replacement even outside the workflow.
    with SEALED.open('xb') as output:
        output.write(sealed)
    with CERT.open('xb') as output:
        output.write(certificate)
    print('Backup criptografado e certificado público preparados. SHA-256 do certificado: ' + hashlib.sha256(certificate).hexdigest())


def prepare():
    payload = legacy()
    count = sum(bool(value) for value in payload.values())
    encrypted_mode = SEALED.exists() or bool(os.environ.get(SECRET))
    if count and encrypted_mode:
        raise RuntimeError('Dois métodos de assinatura configurados. Escolha a chave existente; não alterne automaticamente.')
    if count not in (0, 4):
        raise RuntimeError('Configuração antiga de assinatura incompleta; são necessários os quatro Secrets.')
    if not count and not encrypted_mode:
        return False
    if encrypted_mode:
        if not SEALED.is_file() or not CERT.is_file():
            raise RuntimeError('Execute primeiro o workflow manual de preparação da chave. Backup ou certificado ausente.')
        payload = json.loads(signing.encrypt(SEALED.read_bytes(), passphrase(), decrypt=True))
    raw = validated(payload)
    key = Path(os.environ['RUNNER_TEMP']) / 'forte-upload.jks'
    try:
        with key.open('xb') as output:
            os.chmod(key, 0o600)
            output.write(raw)
        certificate = export_certificate(payload, key)
        if encrypted_mode and certificate != CERT.read_bytes():
            raise RuntimeError('Certificado não corresponde ao backup. Assinatura cancelada.')
        values = {name: payload[name] for name in signing.NAMES if name != 'FORTE_KEYSTORE_BASE64'}
        values['FORTE_KEYSTORE_FILE'] = str(key)
        # Derived passwords are not automatically masked by Actions.
        for name, value in values.items():
            if name != 'FORTE_KEYSTORE_FILE':
                escaped = value.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
                print('::add-mask::' + escaped, flush=True)
        with open(os.environ['GITHUB_ENV'], 'a') as output:
            for name, value in values.items():
                output.write(name + '=' + value + '\n')
        return True
    except Exception:
        key.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['bootstrap', 'prepare'])
    args = parser.parse_args()
    if args.action == 'bootstrap':
        bootstrap()
    else:
        signed = prepare()
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write('signed=' + str(signed).lower() + '\n')
            output.write('artifact=' + ('ForteFrete-PlayStore-AAB-Assinado' if signed else 'ForteFrete-AAB-Sem-Assinatura') + '\n')
        print('Assinatura preparada.' if signed else 'Assinatura pendente. AAB sem assinatura não é publicável.')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Do not print exception payloads, decrypted JSON, passwords or tool stderr.
        print('Falha na preparação da assinatura. Confira o Secret, o backup e o certificado; nenhuma credencial foi exibida.', file=sys.stderr)
        raise SystemExit(1)
