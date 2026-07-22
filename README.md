# 音楽ポートフォリオ・スターター

GitHub Pagesで公開できる、依存ライブラリ不要の静的サイトです。
ブラウザ標準の音声プレイヤー、MP3ダウンロード、作品カタログ、
スマートフォン向けレイアウトを含みます。

## 最初に変更する場所

`index.html`をテキストエディタで開き、以下を検索して置き換えます。

- `ARTIST NAME`：アーティスト名
- `hello@example.com`：問い合わせ先
- `First Collection`、`Second Collection`：作品名
- 作品説明、曲名、再生時間、発表年、カタログ番号

ページ上部のタイトルと検索結果に出る説明は、`<head>`内の
`<title>`と`meta name="description"`で変更できます。

## MP3の差し替え

1. `audio`フォルダのサンプルMP3を削除または残したままにします。
2. 自分のMP3を`audio`フォルダに入れます。
3. `index.html`内のファイル名を変更します。

1曲につき、同じファイル名を次の2か所へ記入します。

```html
<source src="audio/01-first-light.mp3" type="audio/mpeg">
<a class="download-link" href="audio/01-first-light.mp3" download>
```

ファイル名は、半角英数字・数字・ハイフンを推奨します。

## ジャケットの差し替え

1. JPEG、PNG、WebP、SVGの画像を`images`フォルダに入れます。
2. `index.html`の画像ファイル名と代替テキストを変更します。

```html
<img
  src="images/your-cover.jpg"
  alt="作品名のジャケット"
  width="1200"
  height="1200"
>
```

正方形・1200×1200px前後が扱いやすい大きさです。

## 曲を追加する

`index.html`内の`<li class="track">`から対応する`</li>`までを複製し、
曲番号、曲名、時間、MP3のファイル名を変更します。

## 作品を追加する

`index.html`内の`<article class="release">`から対応する`</article>`までを
複製し、ジャケット、作品情報、収録曲を変更します。

## 制作支援リンクを有効にする

`index.html`の`id="support"`が付いたsectionを探します。

1. `<section ... hidden>`の`hidden`だけを削除します。
2. `https://example.com/support`を実際のStripe Payment Linksなどに変更します。
3. 上部ナビゲーションにも表示する場合は、Aboutのリンクの後に
   `<a href="#support">Support</a>`を追加します。

決済情報はGitHub Pages上で入力させず、決済サービスのページへ移動させてください。

## 配色を変更する

`styles.css`先頭の色だけを変更すると、全体の配色が変わります。

```css
:root {
  --background: #e8e5de;
  --surface: #f6f3ec;
  --text: #242521;
  --muted: #686b63;
  --accent: #4f6255;
  --border: #cac7be;
}
```

## 手元で確認する

最も簡単なのは`index.html`をダブルクリックしてブラウザで開く方法です。
ブラウザによる違いを避けるには、このフォルダで次のコマンドを実行します。

```sh
python3 -m http.server 8000
```

その後、ブラウザで`http://localhost:8000`を開きます。

## GitHub Pagesで公開する

1. GitHubに公開リポジトリを作ります。
2. このREADMEがあるフォルダの「中身」をリポジトリ直下へアップロードします。
3. リポジトリの`Settings`→`Pages`を開きます。
4. Sourceを`Deploy from a branch`にします。
5. Branchを`main`、フォルダを`/(root)`にして保存します。

リポジトリ名を`ユーザー名.github.io`にすると、公開URLは
`https://ユーザー名.github.io/`になります。

## ファイル一覧

```text
index.html              サイト本体
styles.css              色・文字・レイアウト
script.js               同時再生防止と年号の自動更新
404.html                ページが見つからない場合の表示
favicon.svg             ブラウザタブのアイコン
robots.txt              検索エンジン向け設定
.nojekyll               GitHub Pages向け設定
images/                 ジャケット画像
audio/                  MP3ファイル
```

## 公開前チェック

- サンプル音源を自分のMP3へ差し替えた
- アーティスト名、作品名、説明、メールアドレスを変更した
- PCとスマートフォンで全曲を再生した
- ダウンロードボタンを確認した
- 自分が公開権を持つ音源・画像だけを使用した
- 著作権・再利用条件を記載した
- 支援リンクを使う場合、実際に少額決済をテストした

MP3は公開リポジトリから誰でも取得できます。有料作品は試聴版だけを置き、
購入者限定ファイルの配布には外部のデジタル商品販売サービスを使用してください。
