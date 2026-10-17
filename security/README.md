# 共通パスワード方式（個人アカウントは廃止）

## 今のGitHub Pagesの入口
GitHub → Settings → Secrets and variables → Actions → New repository secret に
`ALTA_VIEW_PASSWORD` を登録します。推測されにくい16文字以上を推奨します。
チャットやソースコードには貼り付けないでください。
次回の定期実行または手動実行で入口画面が有効になります。
これはUI上の制限です。公開JSON・公開リポジトリの閲覧は防ぎません。

## Cloudflare側で保護する場合（まだ未設定）
`worker.mjs` は個人アカウントなしの共通パスワード認証です。
- 暗号化runtime secret `ALTA_SITE_PASSWORD`：16文字以上（最大128文字）。
- 暗号化runtime secret `ALTA_SESSION_SECRET`：ランダムな32文字以上の別の秘密値。
- `RATE_LIMITER` binding：ログイン試行をIPごとに60秒10回などに制限。利用するCloudflare環境でbindingの対応と料金を確認して構成します。
- 設定不足は503で閉じます。現時点でCloudflare保護済みとは表示しません。
- Secure / HttpOnly / SameSite cookie、12時間の有効期限、同一オリジンPOST検証。
- パスワードまたはセッション秘密値を変更すると既存の認証は失効。
- /admin とユーザー管理APIは404。D1のユーザーデータベースは不要です。
- GitHub ActionsのCloudflare用Secretsを登録しただけでは上記runtime設定は入りません。
- Cloudflare公開前に、JSON・アーカイブへの未認証アクセスが拒否されることを確認してください。
- 公開GitHub Pages・公開リポジトリがある限り、そちらのデータは閲覧できます。完全な非公開化は別途必要です。

無料枠を超えて自動課金する設定や有料サービスはこの変更では追加していません。
旧アカウント用のschemaと管理者ハッシュ生成スクリプトは廃止します。
参考：https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
