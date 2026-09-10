# YouTube動画情報取得の実装メモ

## 処理の流れ

1. 入力画面が `POST /api/youtube/video` に URL を送る。
2. Route Handler が URL を解析し、通常動画の ID だけを受け付ける。
3. Route Handler がサーバー環境の `YOUTUBE_API_KEY` で YouTube Data API v3 の `videos.list` を `part=snippet,contentDetails` として呼ぶ。
4. 公開取得できない動画、ライブ中・配信予定、60分超をサーバーで拒否する。
5. 成功時だけ、画面にサムネイル、タイトル、チャンネル名、再生時間を表示する。URL編集時は確認情報を消して生成を無効にする。
6. 雑誌保存時は、確認済みの `videoId`、正規化 URL、タイトル、チャンネル名、秒数を既存の Supabase 保存 API に渡す。サムネイルは画面表示専用で保存しない。

## APIキーの扱い

`YOUTUBE_API_KEY` は `.env.local` のみに置く。クライアントコードから Google API へ直接アクセスせず、キーに `NEXT_PUBLIC_` を付けないため、ブラウザの JavaScript と通信内容には API キーが含まれない。

## Shorts 判定の制約

`/shorts/VIDEO_ID` の URL は解析時に必ず拒否する。一方、YouTube Data API v3 の `videos.list` が返す `snippet` と `contentDetails` には、動画が Shorts かどうかを確実に示す専用フィールドがない。そのため、Shorts を `https://www.youtube.com/watch?v=VIDEO_ID` として貼り付けられた場合に、100% の精度で Shorts と判定して拒否することはできない。
