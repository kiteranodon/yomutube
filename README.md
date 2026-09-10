# Yomazine

YouTube動画を、落ち着いて読める小さな雑誌へ変えるPC向けWebアプリです。現在は画面フローと記事表示をサンプルデータで実装しています。YouTube、Gemini、PDFの実処理はまだ接続していません。

## 起動方法

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## 確認手順

1. 「雑誌をつくる」を選ぶ。
2. 通常のYouTube動画URL（例: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`）を入力し、「動画を確認する」を選ぶ。
3. 知りたいことを入力し、読書時間を選び、同意チェックを入れる。
4. 「雑誌の構成をつくる」を選ぶと、生成中の3段階表示の後にサンプル記事のプレビューを表示する。
5. プレビューで記事全文、重要ポイント3つ、動画時間・読書時間・短縮時間を確認する。「この内容でPDFを作る」は、現時点では完了画面へ進むサンプル動作です。

品質確認には次を実行します。

```bash
npm run lint
npm run build
```

## Supabaseの設定とマイグレーション適用

アプリは起動時にSupabase Authの匿名サインインを行います。匿名ユーザーはSupabase上では `authenticated` ロールになり、RLSによって自分の履歴だけを読み書きできます。

1. Supabaseプロジェクトを作成し、Dashboardの **Authentication → Providers → Anonymous** で **Enable Anonymous Sign-Ins** を有効にする。
2. Dashboardの **Integrations → Cron** でpg_cronを有効にする。
3. Supabase CLIを使う場合は、プロジェクト直下で次を実行する。初回はブラウザで認証を完了する。

   ```bash
   npx supabase login
   npx supabase link --project-ref <SupabaseのProject Ref>
   npx supabase db push
   ```

   `supabase/migrations/.sq202609100001_create_yomazine_schemal`（テーブル・RLS・削除関数）、`supabase/migrations/202609100002_schedule_retention_cleanup.sql`（毎日00:15 JSTの削除Cron）、`supabase/migrations/202609110001_fix_video_url_constraint.sql`（有効なYouTube URLを保存できるようにする修正）が順に適用される。

   CLIを使わない場合は、SQL Editorで上記3ファイルを番号順に実行する。2本目はpg_cron有効化後に実行する。
4. `.env.example` を参考に、以下を `.env.local` に設定して開発サーバーを再起動する。

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   YOUTUBE_API_KEY=
   GEMINI_API_KEY=
   ```

   `NEXT_PUBLIC_` を付けるのはSupabaseのURLと匿名キーだけである。YouTube・Geminiキー、`SUPABASE_SERVICE_ROLE_KEY` は絶対にブラウザへ渡さない。

## 履歴とRLSの確認手順

1. アプリで雑誌を作成し、ヘッダーの「履歴」から自分の1冊だけが表示されることを確認する。再生成すると同じ雑誌の `magazine_versions` に新しい版が保存される。
2. 履歴の「削除」を選び、一覧から消えることを確認する。親の `magazines` を削除するため、子の生成版も連鎖削除される。
3. 通常ブラウザとシークレットウィンドウを開く。匿名サインインは別ユーザーになるため、片方で作成した履歴がもう片方の履歴画面に表示されないことを確認する。
4. Supabase DashboardのTable Editorで、どちらの匿名ユーザーにも他方の `magazines`／`magazine_versions` が見えないことを確認する。Route Handlerは匿名ユーザーのJWTで問い合わせ、`service_role`を使用しないため、RLSは一覧・作成・再生成・削除の全操作に適用される。

成功履歴は匿名ユーザーごとに90日間保存します。失敗・中断した生成版は24時間後に削除され、PDF、AI画像、動画・音声・字幕、生のAI応答は保存しません。
