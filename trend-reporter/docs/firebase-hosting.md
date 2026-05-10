# Firebase Hosting

GitHub Actionsで収集した `public/data/*.json` とWebアプリをFirebase Hostingへdeployできます。

## 挙動

`collect.yml` は次の順番で動きます。

1. collectorで `public/data/*.json` を生成
2. `public/index.html` と `public/assets/*` を含む `public/` をFirebase Hostingへdeploy
3. GitHub Pagesにも同じ `public/` をdeploy

Webアプリは `./data/latest.json` を相対パスで読みます。そのためFirebase HostingでもGitHub Pagesでも同じコードで動きます。

## 必要なFirebase設定

GitHub repositoryに以下を設定します。

Repository Variable:

| Name | 内容 |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase project ID |

Repository Secret:

| Name | 内容 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Hosting deploy権限を持つサービスアカウントJSON |

未設定の場合、GitHub ActionsはFirebase deployだけスキップします。

## GitHub CLIで設定

Firebase project IDとサービスアカウントJSONがある場合:

```bash
npm run configure:firebase -- OWNER/REPO your-firebase-project-id ./service-account.json
```

project IDだけ先に設定する場合:

```bash
npm run configure:firebase -- OWNER/REPO your-firebase-project-id
```

サービスアカウントJSONを後から設定する場合:

```bash
gh secret set FIREBASE_SERVICE_ACCOUNT --repo OWNER/REPO < service-account.json
```

## ローカルdeploy

Firebase CLIでログイン済みの場合:

```bash
npm run collect
npx firebase-tools@latest deploy --only hosting --project your-firebase-project-id
```

## キャッシュ設定

`firebase.json` では `/data/**` を `no-cache, no-store` にしています。これにより、GitHub Actionsが生成した最新JSONがFirebase上のWebアプリに反映されやすくなります。
