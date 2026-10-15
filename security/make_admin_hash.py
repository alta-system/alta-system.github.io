"""Run on your own machine; plaintext password is never written or printed."""
import getpass,hashlib,secrets
p=getpass.getpass('管理者パスワード（15〜128文字）: ')
if not 15<=len(p)<=128:raise SystemExit('長さを確認してください')
if p!=getpass.getpass('もう一度: '):raise SystemExit('一致しません')
salt=secrets.token_hex(32)
print('ADMIN_PASSWORD_SALT='+salt)
print('ADMIN_PASSWORD_HASH='+hashlib.pbkdf2_hmac('sha256',p.encode(),bytes.fromhex(salt),100000).hex())
