# Yomazine

> 観る時間を、読む時間に。

Yomazine（ヨマジン）は、公開されている YouTube の通常動画を、落ち着いて読める日本語の雑誌へ変換する PC 向け Web アプリです。動画 URL と「知りたいこと」、希望する読書時間を入力すると、Gemini が記事を構成し、オリジナルイラスト入りの縦書き PDF としてダウンロードできます。

動画・音声・字幕、Gemini の生レスポンス、生成画像、PDF は保存しません。Zod で検証を通過した記事 JSON と動画情報だけを、Supabase の匿名ユーザーごとの履歴として保存します。

## プロジェクトの概要

主な機能は次のとおりです。

- YouTube URL の形式チェックと、YouTube Data API v3 による動画情報の取得
- Shorts URL、再生リスト、ライブ配信、非公開動画、60 分超の動画の除外
- ユーザーの関心と読書時間に合わせた Gemini による日本語記事生成
- Gemini による表紙・本文用イラストの生成（失敗時は代替レイアウトを使用）
- A4 縦書き・最大 10 ページの PDF をブラウザで生成してダウンロード
- Supabase Auth の匿名サインインと、RLS で保護された生成履歴の保存
- 成功履歴の 90 日保存と、失敗・中断した生成版の 24 時間後削除

処理の流れは以下のとおりです。

```text
YouTube URL を入力
  -> 動画情報を確認
  -> 知りたいこと・読書時間を指定
  -> Gemini で記事を生成
  -> イラストと記事をプレビュー
  -> ブラウザ内で PDF を生成・ダウンロード
```

対応 URL は `https://www.youtube.com/watch?v=VIDEO_ID` と `https://youtu.be/VIDEO_ID` です。スマートフォン対応、メール会員登録、他端末との履歴同期、PDF のクラウド保存は現在の対象外です。

## 使用している主な技術

| 分類 | 技術 | 用途 |
| --- | --- | --- |
| フレームワーク | Next.js 16.3.4（App Router / JavaScript） | 画面、Route Handler、開発・本番ビルド |
| UI | React 19.2.8 / CSS Modules | 画面とスタイル |
| AI | Google Gen AI SDK（`@google/genai`）/ Gemini API | YouTube 動画を基にした記事・イラスト生成 |
| 動画情報 | YouTube Data API v3 | タイトル、チャンネル、再生時間などの取得 |
| DB・認証 | Supabase / Supabase Auth / PostgreSQL | 匿名認証、記事履歴、RLS、保存期限の管理 |
| PDF | `pdf-lib` / `@pdf-lib/fontkit` | 日本語フォントを埋め込んだ縦書き PDF の生成 |
| バリデーション | Zod 4 | Gemini が返す記事 JSON の構造・文字数検証 |
| 品質管理 | ESLint 9 / eslint-config-next | 静的解析 |

## 必要な環境

- Node.js 20.9 以上
- npm（`package-lock.json` を使用）
- モダンな PC ブラウザ
- Google Cloud プロジェクトと YouTube Data API v3 の API キー
- Google AI Studio で発行した Gemini API キー
- Supabase プロジェクト
- Supabase CLI（マイグレーションを CLI で適用する場合のみ。`npx` で実行可能）

## 必要な環境変数

`.env.example` をコピーして、プロジェクト直下の `.env.local` に値を設定します。

```bash
cp .env.example .env.local
```

| 変数名 | 公開範囲 | 必須 | 説明 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ブラウザ・サーバー | 必須 | Supabase の Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ブラウザ・サーバー | 必須 | Supabase の匿名キー（publishable / anon key） |
| `YOUTUBE_API_KEY` | サーバーのみ | 必須 | YouTube Data API v3 の API キー |
| `GEMINI_API_KEY` | サーバーのみ | 必須 | Gemini API キー |
| `GEMINI_MODEL` | サーバーのみ | 必須 | 公開 YouTube URL 入力に対応した記事生成モデル |
| `GEMINI_IMAGE_MODEL` | サーバーのみ | 画像生成に必須 | 画像出力に対応した Gemini モデル |

設定例（値は各サービスで取得したものに置き換えてください）:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
YOUTUBE_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
GEMINI_IMAGE_MODEL=
```

`YOUTUBE_API_KEY` と `GEMINI_API_KEY` に `NEXT_PUBLIC_` を付けないでください。`NEXT_PUBLIC_` 付きの値はブラウザ向け JavaScript に含まれます。また、`SUPABASE_SERVICE_ROLE_KEY` はこのアプリでは使用せず、`.env.local` にも設定しません。`.env.local` は Git の追跡対象外です。

環境変数を変更したときは、開発サーバーを再起動してください。

## コマンド一覧

| コマンド | 内容 |
| --- | --- |
| `npm ci` | lockfile に固定された依存パッケージを再現可能な形でインストール |
| `npm install` | 依存パッケージをインストール・更新 |
| `npm run dev` | 開発サーバーを起動（`http://localhost:3000`） |
| `npm run lint` | ESLint による静的解析 |
| `npm run build` | 本番用ビルドを作成 |
| `npm run start` | ビルド済みアプリを本番モードで起動 |
| `npx supabase login` | Supabase CLI にログイン |
| `npx supabase link --project-ref <PROJECT_REF>` | ローカルと Supabase プロジェクトを接続 |
| `npx supabase db push` | `supabase/migrations/` の未適用マイグレーションを反映 |
| `node scripts/generate-pagination-layout-checks.mjs` | PDF のページ送り・見出し配置の確認用 PDF を生成 |
| `node scripts/generate-section-layout-check.mjs` | PDF の本文セクション配置の確認用 PDF を生成 |
| `node scripts/generate-small-kana-layout-check.mjs` | 縦書き小書き仮名の確認用 PDF を生成 |

## ディレクトリ構成

```text
yomutube/
├── app/
│   ├── api/
│   │   ├── magazines/              # 雑誌の生成・取得・再生成・画像生成 API
│   │   └── youtube/video/          # YouTube 動画情報の確認 API
│   ├── globals.css                 # グローバルスタイル
│   ├── layout.js                   # ルートレイアウト
│   ├── page.js                     # メイン画面と画面遷移
│   └── page.module.css             # メイン画面のスタイル
├── lib/
│   ├── magazine-validation.js      # 記事 JSON の Zod スキーマと検証
│   ├── supabase-request.js         # API 側の匿名ユーザー認証
│   ├── yomazine-pdf.js             # 縦書き PDF の組版・生成
│   └── youtube-video.js            # URL 解析と YouTube API 呼び出し
├── public/
│   └── fonts/                      # PDF に埋め込む Noto Sans/Serif JP
├── scripts/                        # PDF レイアウト確認用スクリプト
├── supabase/
│   └── migrations/                 # DB、RLS、保存期限 Cron の SQL
├── output/pdf/                     # レイアウト確認スクリプトの出力先
├── .env.example                    # 環境変数のひな形
├── next.config.mjs                 # Next.js 設定
├── supabase.js                     # ブラウザ用 Supabase クライアント
├── package.json                    # 依存関係と npm scripts
└── README.md
```

## 開発環境の構築方法

### 1. リポジトリと依存パッケージを準備する

```bash
git clone <REPOSITORY_URL>
cd yomutube
npm ci
cp .env.example .env.local
```

### 2. YouTube Data API v3 を設定する

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成します。
2. **API とサービス → ライブラリ** で YouTube Data API v3 を有効にします。
3. **API とサービス → 認証情報** で API キーを発行します。
4. キーの **API の制限** を YouTube Data API v3 のみに設定します。
5. キーを `.env.local` の `YOUTUBE_API_KEY` に設定します。

詳細は [YouTube Data API の概要](https://developers.google.com/youtube/v3/getting-started) と [Google Cloud の API キー制限ガイド](https://docs.cloud.google.com/docs/authentication/api-keys) を参照してください。

### 3. Gemini API を設定する

1. Google AI Studio で API キーを発行します。
2. `.env.local` の `GEMINI_API_KEY` に設定します。
3. 公開 YouTube URL 入力に対応するモデルを `GEMINI_MODEL` に設定します。
4. 画像出力に対応するモデルを `GEMINI_IMAGE_MODEL` に設定します。

`GEMINI_IMAGE_MODEL` が未設定、または画像生成に失敗した場合でも、記事生成と画像なしの PDF 作成は利用できます。

### 4. Supabase を設定する

1. Supabase でプロジェクトを作成します。
2. Dashboard の **Authentication → Providers → Anonymous** で匿名サインインを有効にします。
3. Dashboard の **Integrations → Cron** で pg_cron を有効にします。
4. Project URL と匿名キーを `.env.local` の `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY` に設定します。
5. マイグレーションを適用します。

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

CLI を使わない場合は、Supabase の SQL Editor で `supabase/migrations/` 内の SQL 4 ファイルをファイル名順に実行してください。保存期限 Cron を作成する `202609100002_schedule_retention_cleanup.sql` は、pg_cron の有効化後に実行します。

### 5. アプリを起動して確認する

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開き、次を確認します。

1. 公開されている 60 分以内の通常動画 URL を入力し、動画情報を確認します。
2. 「知りたいこと」、読書時間、同意を入力して記事を生成します。
3. プレビューと履歴を確認し、PDF をダウンロードします。
4. 変更を提出する前に品質チェックを実行します。

```bash
npm run lint
npm run build
```

## トラブルシューティング

### 環境変数を設定したのに反映されない

- `.env.local` が `package.json` と同じ階層にあるか確認してください。
- 変数名のタイプミスや値の前後の不要な空白を確認してください。
- `npm run dev` を `Ctrl + C` で停止し、再起動してください。
- 秘密鍵に `NEXT_PUBLIC_` を付けて解決しようとしないでください。

### 動画情報を取得できない

- URL が通常動画の `watch?v=` または `youtu.be/` 形式か確認してください。
- `/shorts/`、`list=` を含む再生リスト、ライブ中・配信予定、非公開・削除済み、60 分超の動画は対象外です。
- Google Cloud で YouTube Data API v3 が有効か、API キーが同 API に許可されているか確認してください。
- Cloud Console の **割り当て** でクォータを確認してください。
- YouTube Data API には Shorts を示す確実な専用項目がないため、Shorts を通常の `watch?v=` URL で入力した場合は判定できないことがあります。

### 匿名サインインまたは履歴保存に失敗する

- `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を確認してください。
- Supabase の Anonymous Sign-Ins が有効か確認してください。
- `supabase/migrations/` の 4 ファイルがすべて適用済みか確認してください。
- 通常ウィンドウとシークレットウィンドウは別の匿名ユーザーになるため、履歴は共有されません。

### 記事を生成できない

- `GEMINI_API_KEY` と `GEMINI_MODEL` を確認し、開発サーバーを再起動してください。
- `GEMINI_MODEL` が公開 YouTube URL を入力として扱えるモデルか確認してください。
- 対象動画が Gemini から参照可能な公開動画か確認してください。
- Gemini の一時的な障害や利用上限の場合は、時間を置いて再試行してください。

### イラストを生成できない

- `GEMINI_IMAGE_MODEL` が画像出力対応モデルか確認してください。
- イラスト生成だけを再試行できます。失敗したままでも代替レイアウトで PDF を作成できます。
- 生成画像は履歴に保存されないため、履歴から記事を開くたびに再生成されます。

### PDF のダウンロードが始まらない

- ブラウザのダウンロード許可、ポップアップ／自動ダウンロード設定を確認してください。
- ブラウザのダウンロード一覧を確認してください。
- 記事が最大 10 ページに収まらない場合は、省略せずエラーにする仕様です。記事を再生成してください。
- PDF 作成中に失敗した場合は、プレビュー画面から再試行してください。

### ビルドに失敗する

- Node.js が 20.9 以上か `node -v` で確認してください。
- `npm ci` を再実行して、`package-lock.json` と依存関係を揃えてください。
- 先に `npm run lint` を実行し、表示されたファイルと行を修正してください。
- ビルド時に必要な環境変数が設定されているか確認してください。

## データとセキュリティ

- YouTube と Gemini の API キーは Route Handler だけが使用します。
- Route Handler は、ブラウザから受け取った動画情報を信用せず、YouTube Data API で再検証します。
- 匿名ユーザーは Supabase 上で `authenticated` ロールとなり、RLS により自分の履歴だけを読み書きできます。
- 検証済みの記事 JSON と動画情報は 90 日間保存します。失敗・中断した生成版は 24 時間後に削除します。
- 動画・音声・字幕、Gemini の生レスポンス、AI 画像、PDF、行動分析ログは保存しません。
- API キーを誤って公開した場合は、対象サービスで直ちにキーを無効化・再発行してください。

詳細仕様は [要件定義書_Yomazine.md](./要件定義書_Yomazine.md)、[データ設計書_Yomazine.md](./データ設計書_Yomazine.md)、[画面設計書_Yomazine.md](./画面設計書_Yomazine.md)、[YouTube 動画情報取得の実装メモ](./実装メモ_YouTube動画情報取得.md) を参照してください。
