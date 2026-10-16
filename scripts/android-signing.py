"""Prepare Android upload signing and an encrypted recovery copy.

Never writes a plaintext key to the repository or prints credentials.
Requires keytool, openssl and an authenticated GitHub CLI with secrets permission.
"""
import argparse, base64, getpass, hashlib, hmac, json, os, secrets, shutil, subprocess, tempfile
from pathlib import Path

NAMES=('FORTE_KEYSTORE_BASE64','FORTE_KEYSTORE_PASSWORD','FORTE_KEY_ALIAS','FORTE_KEY_PASSWORD')
REPO='FORTEATACAREJO/FORTE-FRETE'

def run(args, *, data=None, env=None):
    result=subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env)
    if result.returncode: raise RuntimeError('Falha na ferramenta '+Path(args[0]).name+'. Nenhuma credencial foi exibida.')
    return result.stdout

def preflight():
    missing=[name for name in ('keytool','openssl','gh') if not shutil.which(name)]
    if missing: raise RuntimeError('Ferramentas ausentes: '+', '.join(missing)+'.')
    run(['gh','auth','status'])

def outside_repo(path):
    path=path.expanduser().resolve()
    if any((parent/'.git').exists() for parent in (path,*path.parents)):
        raise RuntimeError('O backup deve ficar fora de qualquer repositório Git.')
    return path

def encrypt(payload,password,*,decrypt=False):
    prefix=b'FORTE-SIGNING-V1\n'
    if decrypt:
        try:
            header,tag,payload=payload.split(b'\n',2)
            if header+b'\n'!=prefix:raise ValueError()
            key=hashlib.pbkdf2_hmac('sha256',password.encode(),prefix+payload[:32],600000)
            expected=hmac.new(key,prefix+payload,hashlib.sha256).hexdigest().encode()
            if not hmac.compare_digest(tag,expected):raise ValueError()
        except ValueError:raise RuntimeError('Senha incorreta ou backup inválido/alterado.') from None
    env=os.environ.copy();env['FORTE_BACKUP_PASSPHRASE']=password
    args=['openssl','enc','-aes-256-cbc','-pbkdf2','-iter','600000','-pass','env:FORTE_BACKUP_PASSPHRASE']
    if decrypt:args.append('-d')
    else:args.append('-salt')
    result=run(args,data=payload,env=env)
    if decrypt:return result
    key=hashlib.pbkdf2_hmac('sha256',password.encode(),prefix+result[:32],600000)
    tag=hmac.new(key,prefix+result,hashlib.sha256).hexdigest().encode()
    return prefix+tag+b'\n'+result

def generate():
    password=secrets.token_urlsafe(36);alias='forte-frete-upload'
    env=os.environ.copy();env['FORTE_TEMP_KEY_PASSWORD']=password
    with tempfile.TemporaryDirectory(prefix='forte-signing-') as folder:
        key=Path(folder)/'upload.jks'
        run(['keytool','-genkeypair','-noprompt','-storetype','JKS','-keystore',str(key),'-alias',alias,'-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Forte Frete, O=Forte Atacarejo Ltda, C=BR','-storepass:env','FORTE_TEMP_KEY_PASSWORD','-keypass:env','FORTE_TEMP_KEY_PASSWORD'],env=env)
        run(['keytool','-list','-keystore',str(key),'-alias',alias,'-storepass:env','FORTE_TEMP_KEY_PASSWORD'],env=env)
        return dict(zip(NAMES,(base64.b64encode(key.read_bytes()).decode(),password,alias,password)))

def upload(payload):
    if set(payload)!=set(NAMES) or any(not isinstance(v,str) or not v for v in payload.values()):
        raise RuntimeError('Backup inválido: os quatro campos de assinatura são obrigatórios.')
    # Credentials go through stdin, never command-line arguments or terminal output.
    for name in NAMES:run(['gh','secret','set',name,'--repo',REPO],data=payload[name].encode())

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--preflight',action='store_true')
    group.add_argument('--backup-dir',type=Path)
    group.add_argument('--restore',type=Path)
    args=parser.parse_args()
    preflight()
    if args.preflight:
        print('Ferramentas e autenticação disponíveis. A permissão de escrita de secrets será verificada no envio.');return
    password=getpass.getpass('Senha do backup criptografado (mínimo 16 caracteres): ')
    if len(password)<16:raise RuntimeError('Use uma senha de backup com pelo menos 16 caracteres.')
    if args.restore:
        payload=json.loads(encrypt(args.restore.read_bytes(),password,decrypt=True));upload(payload)
    else:
        if getpass.getpass('Confirme a senha do backup: ')!=password:raise RuntimeError('As senhas não coincidem.')
        folder=outside_repo(args.backup_dir);folder.mkdir(mode=0o700,parents=True,exist_ok=True)
        backup=folder/'ForteFrete-upload-key.enc'
        if backup.exists():raise RuntimeError('Já existe um backup. Use --restore; não gere outra chave para o mesmo aplicativo.')
        # Refuse key rotation even when a local backup was lost.
        current=json.loads(run(['gh','secret','list','--repo',REPO,'--json','name']))
        if any(x['name'] in NAMES for x in current):raise RuntimeError('O repositório já possui secrets de assinatura. Restaure a chave existente; não a substitua.')
        payload=generate();sealed=encrypt(json.dumps(payload).encode(),password)
        # Verify the recovery copy before it is written and before touching GitHub.
        if json.loads(encrypt(sealed,password,decrypt=True))!=payload:raise RuntimeError('Falha ao conferir o backup.')
        with open(backup,'xb') as file:
            os.chmod(backup,0o600);file.write(sealed);file.flush();os.fsync(file.fileno())
        try:upload(payload)
        except RuntimeError as error:
            raise RuntimeError('Envio incompleto. O backup criptografado está salvo; corrija o acesso e use --restore. Não gere outra chave.') from error
        print('Backup criptografado salvo em '+str(backup))
    listed=json.loads(run(['gh','secret','list','--repo',REPO,'--json','name']))
    if not set(NAMES).issubset({x['name'] for x in listed}):raise RuntimeError('A lista do GitHub não confirmou os quatro secrets.')
    print('Quatro secrets confirmados. Execute o workflow Android para validar a assinatura do AAB.')

if __name__=='__main__':
    try:main()
    except (RuntimeError,ValueError,OSError) as error:
        print(str(error),file=__import__('sys').stderr);raise SystemExit(1)
