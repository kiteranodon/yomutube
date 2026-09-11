# Yomazine

YouTube の公開通常動画を、落ち着いて読める小さな雑誌へ変える PC 向け Web アプリです。Next.js App Router と JavaScript で作られており、動画情報の取得には YouTube Data API v3、履歴の保存には Supabase を使います。

動画・音声・字幕そのものは保存しません。記事生成では、確認済みの公開YouTube URLをGeminiへ直接渡します。Geminiの生レスポンスは保存せず、Zodで構造と文字数を検証した記事JSONだけを履歴へ保存します。PDFは現在プレビューのみです。

## 起動方法

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## YouTube Data API v3 の設定

動画情報を取得するには Google アカウントが必要です。API キーはブラウザへ送らず、Next.js の Route Handler だけが使います。

1. [Google Cloud Console](https://console.cloud.google.com/) を開き、Google アカウントでログインします。
2. 画面上部のプロジェクト選択から **新しいプロジェクト** を選び、分かりやすい名前（例: `yomazine`）を入力して **作成** します。作成後、そのプロジェクトが選択されていることを確認します。
3. 左上のメニューから **API とサービス → ライブラリ** を開き、`YouTube Data API v3` を検索します。詳細画面で **有効にする** を選びます。
4. **API とサービス → 認証情報** を開き、上部の **認証情報を作成 → API キー** を選びます。表示されたキーをコピーします。
5. 同じ画面で作成したキーの名前を選び、**API の制限** を **キーを制限** にします。`YouTube Data API v3` だけを選んで **保存** します。これにより、そのキーを他の Google API に使えなくできます。
6. プロジェクト直下の `.env.local` を開き、次の `=` の後ろにキーを貼り付けます。引用符は不要です。

   ```bash
   YOUTUBE_API_KEY=ここにコピーしたAPIキーを貼り付ける
   ```

7. `.env.local` を保存したら、起動中の `npm run dev` を `Ctrl + C` で止めて、もう一度 `npm run dev` を実行します。環境変数は開発サーバーの起動時に読み込まれるため、再起動が必要です。

YouTube Data API v3 は、Google Cloud プロジェクトで API を有効化してから利用します。利用量は Cloud Console の **API とサービス → 有効な API とサービス → YouTube Data API v3 → 割り当て** で確認できます。[YouTube の公式概要](https://developers.google.com/youtube/v3/getting-started) と [Google Cloud の API キー制限ガイド](https://docs.cloud.google.com/docs/authentication/api-keys) も参照してください。

### API キーを公開しない理由

API キーを GitHub に公開すると、第三者があなたの割り当て（クォータ）を使い切ったり、許可された API をあなたのプロジェクトとして呼び出したりする可能性があります。`.env.local` は `.gitignore` で除外済みです。キーは README、ソースコード、スクリーンショット、コミットに書かないでください。誤って公開した場合は、Cloud Console でそのキーを削除または再生成し、新しいキーに差し替えます。

このアプリでは `YOUTUBE_API_KEY` をサーバー専用の環境変数として使用します。`NEXT_PUBLIC_YOUTUBE_API_KEY` は作成しないでください。

## 動画の確認方法

1. トップ画面の **雑誌をつくる** を選びます。
2. 公開されている通常動画の URL を貼り、**動画を確認する** を選びます。
3. 成功すると、サムネイル、タイトル、チャンネル名、再生時間が表示されます。
4. URL を編集すると確認結果は破棄され、**雑誌の構成をつくる** は再確認するまで選べなくなります。
5. 知りたいことを入力し、読書時間と同意を選ぶと、確認済みの動画タイトル・チャンネル名・再生時間が従来の Supabase 履歴保存処理へ渡されます。

受け付ける URL は次の形式です。末尾に `utm_source` や `si` などの追跡パラメータが付いていてもかまいません。

```text
https://www.youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
```

次のものは画面で拒否します。

- URL の形式が違う、または動画 ID を取り出せないもの
- `https://www.youtube.com/shorts/...` 形式
- `list=` パラメータを含む再生リスト URL
- 非公開、削除済み、存在しない動画
- ライブ中・配信予定の動画
- 60 分を超える動画

### 動作確認の例

| 確認したい内容 | 操作 | 期待する結果 |
| --- | --- | --- |
| 通常動画 | 例として `https://www.youtube.com/watch?v=dQw4w9WgXcQ` を貼る | 動画情報カードが表示される |
| 短尺 URL | `https://www.youtube.com/shorts/dQw4w9WgXcQ` を貼る | Shorts は対象外というエラーが URL 欄の下に表示される |
| ライブ／配信予定 | YouTube のライブ中または配信予定ページで **共有** から通常の `watch?v=` URL をコピーして貼る | ライブ配信・配信予定は雑誌にできないというエラーが表示される |
| 60 分超 | 60 分を超える公開通常動画の `watch?v=` URL を貼る | 60 分以内の動画を選ぶよう案内される |
| URL 編集後 | 正常な動画を確認してから URL 欄を1文字編集する | 動画カードが消え、生成ボタンが無効になる |

### Shorts の制約

`/shorts/` 形式の URL は、URL を解析する段階で確実に拒否します。

ただし YouTube Data API v3 には「この動画は Shorts である」と示す専用の確実な項目がありません。そのため、Shorts を通常の `watch?v=` URL として貼り付けた場合、Shorts だと 100% 判定して拒否することはできません。この制約は [実装メモ](./実装メモ_YouTube動画情報取得.md) にも記載しています。

### エラー時の対処

- **動画が見つからない**: 公開済みの通常動画 URL か、動画が削除・非公開になっていないかを確認します。
- **API キー未設定**: `.env.local` の `YOUTUBE_API_KEY=` の値を確認し、開発サーバーを再起動します。
- **YouTube API の利用上限**: Cloud Console の **割り当て** で使用量を確認し、リセット後に再試行します。必要なら YouTube API Services のクォータ増量申請を検討します。
- **取得できない**: ネットワークや一時的な API エラーの可能性があります。少し時間を置いて再試行します。技術的な API エラー本文は画面に表示しません。

## Supabase の設定と履歴確認

アプリは起動時に Supabase Auth の匿名サインインを行います。匿名ユーザーは Supabase 上では `authenticated` ロールになり、RLS によって自分の履歴だけを読み書きできます。

1. Supabase プロジェクトを作成し、Dashboard の **Authentication → Providers → Anonymous** で **Enable Anonymous Sign-Ins** を有効にします。
2. Dashboard の **Integrations → Cron** で pg_cron を有効にします。
3. Supabase CLI を使う場合は、プロジェクト直下で次を実行します。初回はブラウザで認証を完了します。

   ```bash
   npx supabase login
   npx supabase link --project-ref <SupabaseのProject Ref>
   npx supabase db push
   ```

   `supabase/migrations/202609100001_create_yomazine_schema.sql`（テーブル・RLS・削除関数）、`supabase/migrations/202609100002_schedule_retention_cleanup.sql`（毎日00:15 JST の削除 Cron）、`supabase/migrations/202609110001_fix_video_url_constraint.sql`（有効な YouTube URL を保存できるようにする修正）、`supabase/migrations/202609110002_expand_generation_failure_codes.sql`（Geminiの固定失敗コード）が順に適用されます。

   CLI を使わない場合は、SQL Editor で上記3ファイルを番号順に実行します。2本目は pg_cron 有効化後に実行します。
4. `.env.example` を参考に、以下を `.env.local` に設定して開発サーバーを再起動します。

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   YOUTUBE_API_KEY=
   GEMINI_API_KEY=
   GEMINI_MODEL=gemini-3.8-flash
   GEMINI_IMAGE_MODEL=
   ```

   `NEXT_PUBLIC_` を付けるのは Supabase の URL と匿名キーだけです。YouTube・Gemini キー、`SUPABASE_SERVICE_ROLE_KEY` は絶対にブラウザへ渡しません。

履歴確認では、雑誌を作成してヘッダーの **履歴** から自分の1冊だけが表示されることを確認します。再生成すると同じ雑誌の `magazine_versions` に新しい版が保存されます。通常ブラウザとシークレットウィンドウでは匿名ユーザーが別になるため、互いの履歴は表示されません。

成功履歴は匿名ユーザーごとに90日間保存します。失敗・中断した生成版は24時間後に削除され、PDF、AI画像、動画・音声・字幕、生の AI 応答は保存しません。

## Gemini 記事生成の設定

記事の生成は `POST /api/magazines/generate` からだけ実行します。ブラウザは確認済み動画のスナップショットを送りますが、Route HandlerはYouTube Data API v3で動画ID・正規化URL・タイトル・チャンネル名・再生時間をもう一度確認し、サーバー側の情報だけを保存・Gemini入力に使います。

`.env.local` に次を設定して、開発サーバーを再起動してください。

```bash
GEMINI_API_KEY=AIStudioで作成したGemini_APIキー
GEMINI_MODEL=gemini-3.8-flash
```

`GEMINI_API_KEY` と `GEMINI_MODEL` はRoute Handlerだけが読むサーバー専用設定です。`NEXT_PUBLIC_GEMINI_API_KEY` は作成しないでください。指定するモデルは、公開YouTube URLを入力として扱えるGeminiモデルにしてください。Geminiの返却はリクエスト中のメモリでJSONとして解析し、Zodの必須フィールド・配列数・項目別文字数・読書時間別の総文字数の検証を通過した場合だけ `succeeded` 版へ保存します。

## Gemini AI画像生成の設定

記事生成後、`POST /api/magazines/[id]/illustrations` が表紙用・本文用のオリジナルイラストを生成します。`.env.local` の `GEMINI_IMAGE_MODEL` に、画像出力をサポートするGeminiモデル名を設定してください。画像データはRoute Handlerのレスポンスとブラウザのプレビュー内だけに置き、Supabase・Storage・履歴には保存しません。画像生成に失敗しても記事と履歴はそのまま利用でき、プレビューから画像だけ再生成できます。

## 品質確認

```bash
npm run lint
npm run build
```
