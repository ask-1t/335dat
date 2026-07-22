# 33.5℃ 音楽カタログ自動生成版

アルバムフォルダを`albums`へ追加するだけで、GitHub Pagesのカタログを
自動生成するサイト一式です。HTMLへ作品を1件ずつ書く必要はありません。

同梱した「Dear Sydney」で、以下を確認済みです。

- AAC-LCのM4Aをそのまま再生・ダウンロード
- M4Aから曲名、アーティスト、アルバム、曲順、年、再生時間を取得
- 各フォルダの`cover.png`を自動認識
- 2084×2084・約5.4MBのPNGを、サイト用WebPへ自動縮小
- 日本語、記号、空白を含むフォルダ名を安全な公開パスへ変換

## ふだんの更新方法

1. 新しいアルバムフォルダを`albums`へ入れます。
2. GitHub Desktopで「Commit to main」を押します。
3. 「Push origin」を押します。
4. 数分待つとサイトが更新されます。

`cover`のリネーム、M4AからMP3への変換、HTML編集は不要です。

## 最初の1回だけ行う設定

現在公開中のリポジトリの中身を、このフォルダの中身で置き換えます。
念のため、現在のリポジトリはZIPでバックアップしてから進めてください。

GitHubでリポジトリの`Settings`→`Pages`を開き、
「Build and deployment」の「Source」を`GitHub Actions`へ変更します。

ファイルをGitHub Desktopで送ると、上部の`Actions`に
「Build and deploy music catalog」が表示されます。緑のチェックになれば完了です。

## サイト名や説明を変更する

`site/config.json`だけを編集します。

```json
{
  "siteTitle": "33.5℃",
  "tagline": "Music for quiet moments.",
  "intro": "サイト上部の説明",
  "about": "プロフィール",
  "contactEmail": "",
  "supportUrl": "",
  "copyrightHolder": "33.5℃"
}
```

メールアドレスや支援URLを空欄にすると、その項目は表示されません。

## アルバムフォルダの規則

```text
albums/
├── アルバム名A/
│   ├── cover.png
│   ├── 曲1.m4a
│   └── 曲2.m4a
└── アルバム名B/
    ├── cover.jpg
    └── 曲1.m4a
```

- `cover.jpg`、`cover.png`、`cover.webp`などを自動認識します。
- アルバムごとに同じ`cover`という名前で構いません。
- M4AとMP3を認識します。
- 曲順は埋め込み情報を優先し、なければファイル名の数字を使用します。
- アルバム名や曲名は埋め込み情報を優先します。
- `description.txt`を入れると作品説明として表示します。
- ジャケットがない場合は、M4Aの埋め込み画像を探します。

## 容量について

GitHub Pagesの公開サイトは1GBが目安です。アルバムフォルダをすべて追加する前に、
音源フォルダ全体の容量を確認してください。ジャケットは自動で軽量化されますが、
M4Aは音質を変えず、そのまま公開します。

## 手元で動作確認する場合

Node.js 24をインストール済みなら、次を実行できます。

```sh
npm install
npm run build
npx serve dist
```

通常はGitHub Actionsが代わりに実行するため、手元で行う必要はありません。

## 重要

`albums`に入れたM4Aは公開ファイルになります。有料購入者だけへ渡す音源には
使用しないでください。また、公開権を持つ音源とアートワークだけを追加してください。
