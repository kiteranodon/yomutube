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

## Supabase接続を次に行う手順

1. Supabaseプロジェクトを作成し、Authenticationで **Anonymous Sign-ins** を有効にする。
2. `supabase/migrations/202609100001_create_yomazine_schema.sql`、続けて `supabase/migrations/202609100002_schedule_retention_cleanup.sql` をSupabaseへ適用する。2本目の前にDashboardでpg_cronを有効にする。
3. `.env.example` を参考に `.env.local` へ `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定する。`YOUTUBE_API_KEY` と `GEMINI_API_KEY` はサーバー専用の値として設定する。
4. 起動時に匿名サインインを行い、Next.js Route Handlerからユーザーのセッションを引き継いで履歴を読み書きする。`service_role`、YouTubeキー、Geminiキーをクライアントへ渡さない。

成功履歴は匿名ユーザーごとに90日間保存します。失敗・中断した生成版は24時間後に削除され、PDF、AI画像、動画・音声・字幕、生のAI応答は保存しません。
