"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { supabase } from "../supabase";
import styles from "./page.module.css";

const sampleVideo = {
  title: "小さな習慣が、毎日を変える理由",
  channel: "暮らしを整える研究室",
  minutes: 12,
  thumbnail: "YT",
};

const article = {
  title: "変化は、いつも小さな習慣から。",
  lead: "大きな目標を掲げる前に、今日の行動をほんの少し変えてみる。続けるための工夫は、意志の強さよりも、始めやすい環境にありました。",
  keyPoints: ["最初の一歩は、2分で終わるほど小さくする。", "続けたい行動は、すでにある習慣の直後に置く。", "できた日を数えるより、また始められる仕組みをつくる。"],
  memorableMoment: "「続かない」のではなく、始めるための距離が少し遠いだけかもしれません。",
  episode: "朝に本を読みたい人は、机を整えてから始めようとしがちです。けれど、前の晩に本を枕元へ置くだけなら数秒でできます。目覚めて本が視界に入れば、次の行動までの距離はぐっと短くなります。",
  discovery: "習慣は気合いで守る約束ではなく、毎日の景色に置く目印です。やる気が少ない日にも手が伸びる配置をつくれば、行動は特別な決意から日常の流れへ変わっていきます。",
  practicalPoints: ["明日やりたいことを、2分だけでできる形に書き換える。", "その行動に必要なものを、今夜のうちに見える場所へ置く。", "できなかった日は理由を責めず、次に始めるきっかけを一つ用意する。"],
  closing: "変化は、遠い場所にある大きな決断ではありません。今日の終わりに一冊の本を置くこと、その小さな準備から明日の景色は静かに変わり始めます。",
};

const generationSteps = ["動画を読んでいます", "記事を編集中", "雑誌を組版中"];
const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function toStoredArticle() {
  return { magazineTitle: article.title, lead: article.lead, keyPoints: article.keyPoints, memorableMoment: article.memorableMoment, episode: article.episode, discovery: article.discovery, practicalPoints: article.practicalPoints, closing: article.closing };
}

function formatSaved(minutes, durationSeconds = sampleVideo.minutes * 60) { return Math.max(0, Math.ceil(durationSeconds / 60) - minutes); }

export default function Home() {
  const [screen, setScreen] = useState("top");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoConfirmed, setVideoConfirmed] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [videoCheckState, setVideoCheckState] = useState("idle");
  const [urlError, setUrlError] = useState("");
  const [goal, setGoal] = useState("");
  const [readingMinutes, setReadingMinutes] = useState(5);
  const [agreed, setAgreed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [authState, setAuthState] = useState("loading");
  const [authError, setAuthError] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [currentMagazineId, setCurrentMagazineId] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyState, setHistoryState] = useState("idle");
  const [historyError, setHistoryError] = useState("");
  const videoCheckRequest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function establishAnonymousSession() {
      if (!supabase) {
        if (!cancelled) { setAuthState("error"); setAuthError("Supabaseの環境変数を設定すると、履歴を保存できます。"); }
        return;
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        if (!cancelled) { setAuthState("error"); setAuthError("匿名セッションを準備できませんでした。"); }
        return;
      }
      if (sessionData.session) {
        if (!cancelled) setAuthState("ready");
        return;
      }
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (!cancelled) {
        if (signInError) { setAuthState("error"); setAuthError("匿名サインインを開始できませんでした。SupabaseでAnonymous Sign-insを有効にしてください。"); }
        else setAuthState("ready");
      }
    }
    void establishAnonymousSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (screen !== "generating") return undefined;
    const first = window.setTimeout(() => setProgress(1), 700);
    const second = window.setTimeout(() => setProgress(2), 1400);
    return () => { window.clearTimeout(first); window.clearTimeout(second); };
  }, [screen]);

  async function requestApi(path, options = {}) {
    if (!supabase) throw new Error("Supabaseの環境変数を設定してください。");
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error("匿名セッションを確認できません。");
    const response = await fetch(path, {
      ...options,
      headers: {
        Authorization: "Bearer " + data.session.access_token,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responseBody.error || "処理に失敗しました。");
    return responseBody;
  }

  function handleUrlChange(value) {
    videoCheckRequest.current += 1;
    setVideoUrl(value); setVideoConfirmed(false); setVideoInfo(null); setVideoCheckState("idle"); setUrlError("");
  }

  async function confirmVideo() {
    const requestId = videoCheckRequest.current + 1;
    videoCheckRequest.current = requestId;
    setVideoConfirmed(false); setVideoInfo(null); setUrlError(""); setVideoCheckState("checking");
    try {
      const response = await fetch("/api/youtube/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoUrl.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (requestId !== videoCheckRequest.current) return;
      if (!response.ok || !result.video) {
        setUrlError(result.error || "動画情報を取得できませんでした。少し時間を置いて再試行してください。");
        return;
      }
      setVideoInfo(result.video); setVideoConfirmed(true);
    } catch {
      if (requestId === videoCheckRequest.current) setUrlError("動画情報を取得できませんでした。少し時間を置いて再試行してください。");
    } finally {
      if (requestId === videoCheckRequest.current) setVideoCheckState("idle");
    }
  }

  async function startGeneration(isRegeneration = false) {
    if (!isRegeneration && (!videoConfirmed || !goal.trim() || !agreed)) return;
    if (authState !== "ready") {
      setGenerationError(authError || "匿名サインインの準備が完了していません。");
      return;
    }
    setGenerationError(""); setProgress(0); setScreen("generating");
    try {
      let saveRequest;
      if (isRegeneration) {
        if (!currentMagazineId) throw new Error("保存先の雑誌が見つかりません。");
        saveRequest = requestApi("/api/magazines/" + currentMagazineId + "/regenerate", { method: "POST", body: JSON.stringify({ article: toStoredArticle() }) });
      } else {
        if (!videoInfo) throw new Error("動画を確認してから雑誌を作成してください。");
        saveRequest = requestApi("/api/magazines", {
          method: "POST",
          body: JSON.stringify({
            videoId: videoInfo.videoId,
            videoUrl: videoInfo.normalizedUrl,
            videoTitle: videoInfo.title,
            channelTitle: videoInfo.channelTitle,
            videoDurationSeconds: videoInfo.durationSeconds,
            readingMinutes,
            userGoal: goal,
            termsVersion: "v1.0",
            article: toStoredArticle(),
          }),
        });
      }
      const [saved] = await Promise.all([saveRequest, wait(2200)]);
      if (!isRegeneration) setCurrentMagazineId(saved.magazine.id);
      setScreen("preview");
    } catch (error) {
      setGenerationError(error.message || "履歴を保存できませんでした。");
      setScreen(isRegeneration ? "preview" : "create");
    }
  }

  async function loadHistory() {
    if (authState !== "ready") {
      setHistoryState("error"); setHistoryError(authError || "匿名サインインの準備が完了していません。"); return;
    }
    setHistoryState("loading"); setHistoryError("");
    try {
      const result = await requestApi("/api/magazines");
      setHistory(result.magazines); setHistoryState("ready");
    } catch (error) {
      setHistoryState("error"); setHistoryError(error.message || "履歴を読み込めませんでした。");
    }
  }

  function openHistory() { setScreen("history"); void loadHistory(); }

  async function deleteMagazine(id) {
    if (!window.confirm("この雑誌とすべての生成版を削除します。よろしいですか？")) return;
    try {
      await requestApi("/api/magazines/" + id, { method: "DELETE" });
      setHistory((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      setHistoryError(error.message || "履歴を削除できませんでした。");
    }
  }

  function resetToCreate() {
    setScreen("create"); setVideoConfirmed(false); setVideoUrl(""); setGoal(""); setAgreed(false);
    setVideoInfo(null); setVideoCheckState("idle"); setUrlError(""); setGenerationError(""); setCurrentMagazineId(null);
  }

  return <main className={styles.app}>
    <header className={styles.header}><button className={styles.logo} onClick={() => setScreen("top")} type="button">Yomazine</button><div className={styles.headerActions}><button className={styles.historyButton} onClick={openHistory} type="button">履歴</button><p>観る時間を、読む時間に。</p></div></header>
    {screen === "top" && <Landing onStart={() => setScreen("create")} />}
    {screen === "create" && <CreateMagazine videoUrl={videoUrl} videoInfo={videoInfo} videoConfirmed={videoConfirmed} videoCheckState={videoCheckState} urlError={urlError} goal={goal} readingMinutes={readingMinutes} agreed={agreed} generationError={generationError} authState={authState} authError={authError} onUrlChange={handleUrlChange} onConfirm={confirmVideo} onGoalChange={setGoal} onReadingMinutesChange={setReadingMinutes} onAgreedChange={setAgreed} onGenerate={() => startGeneration(false)} />}
    {screen === "generating" && <Generating progress={progress} />}
    {screen === "preview" && <Preview readingMinutes={readingMinutes} videoInfo={videoInfo} generationError={generationError} onRegenerate={() => startGeneration(true)} onCreatePdf={() => setScreen("complete")} />}
    {screen === "complete" && <Complete onCreateAnother={resetToCreate} onHistory={openHistory} />}
    {screen === "history" && <History items={history} status={historyState} error={historyError} onReload={loadHistory} onDelete={deleteMagazine} onCreate={() => setScreen("create")} />}
  </main>;
}

function Landing({ onStart }) {
  return <section className={styles.landing + " " + styles.enter}>
    <div className={styles.heroCopy}><p className={styles.eyebrow}>YOUTUBE TO READING</p><h1>観る時間を、<br />読む時間に。</h1><p className={styles.description}>YouTube動画を、落ち着いて読める小さな雑誌へ。気になる内容だけを、あなたのペースで読み直せます。</p><button className={styles.primaryButton} onClick={onStart} type="button">雑誌をつくる <span aria-hidden="true">→</span></button></div>
    <div className={styles.magazineStage} aria-label="Yomazineの雑誌見本"><div className={styles.backPage}><span>01</span><i /><i /><i /><small>SMALL STEPS<br />FOR EVERY DAY</small></div><div className={styles.coverPage}><span>YOMAZINE / 001</span><div className={styles.coverShape} /><h2>小さな<br />習慣の<br />つくりかた。</h2><p>READING ISSUE</p></div></div>
    <ol className={styles.flowList}><li><span>01</span>URLを入れる</li><li><span>02</span>読む目的を選ぶ</li><li><span>03</span>PDFで読む</li></ol>
  </section>;
}

function CreateMagazine(props) {
  const { videoUrl, videoInfo, videoConfirmed, videoCheckState, urlError, goal, readingMinutes, agreed, generationError, authState, authError, onUrlChange, onConfirm, onGoalChange, onReadingMinutesChange, onAgreedChange, onGenerate } = props;
  const ready = videoConfirmed && goal.trim().length > 0 && agreed && authState === "ready";
  return <section className={styles.formPage + " " + styles.enter}>
    <ProgressNav current={videoConfirmed ? 2 : 1} /><h1>読みたい動画を教えてください。</h1><p className={styles.sectionLead}>公開されている通常動画を1本選び、雑誌にしたい視点を決めます。</p>
    {(generationError || authState === "error") && <p className={styles.error} role="alert">{generationError || authError}</p>}
    {authState === "loading" && <p className={styles.fieldNote}>匿名ユーザー用の保存先を準備しています。</p>}
    <div className={styles.formBlock}><label htmlFor="video-url">YouTube動画のURL</label><div className={styles.urlRow}><input id="video-url" value={videoUrl} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." inputMode="url" /><button className={styles.secondaryButton} disabled={videoCheckState === "checking"} onClick={onConfirm} type="button">{videoCheckState === "checking" ? "確認中…" : "動画を確認する"}</button></div>{urlError && <p className={styles.error} role="alert">{urlError}</p>}</div>
    {videoConfirmed && videoInfo && <div className={styles.videoCard}><div className={styles.thumbnail}>{videoInfo.thumbnailUrl ? <Image alt="" height={96} src={videoInfo.thumbnailUrl} width={160} /> : <span aria-hidden="true">{sampleVideo.thumbnail}</span>}</div><div><p className={styles.videoLabel}>確認できた動画</p><h2>{videoInfo.title}</h2><p>{videoInfo.channelTitle} <span>／</span> {videoInfo.durationLabel}</p></div></div>}
    <div className={styles.formBlock}><label htmlFor="goal">この動画で知りたいこと</label><textarea id="goal" value={goal} onChange={(event) => onGoalChange(event.target.value.slice(0, 200))} placeholder="例：この動画から、明日試せる習慣を知りたい" maxLength="200" /><p className={styles.fieldNote}>記事の視点を決めるための必須項目です。</p></div>
    <fieldset className={styles.timeField}><legend>読書時間</legend><div className={styles.timeOptions}>{[3, 5, 10].map((minutes) => <button className={readingMinutes === minutes ? styles.timeSelected : styles.timeOption} key={minutes} onClick={() => onReadingMinutesChange(minutes)} type="button" aria-pressed={readingMinutes === minutes}><strong>約{minutes}分</strong><span>{minutes === 3 ? "要点をすばやく" : minutes === 5 ? "ちょうどよく読む" : "ゆっくり深く読む"}</span></button>)}</div></fieldset>
    <label className={styles.agreement}><input checked={agreed} onChange={(event) => onAgreedChange(event.target.checked)} type="checkbox" /><span>個人利用・非再配布に同意する</span></label><p className={styles.terms}>動画・音声・字幕は保存せず、匿名ユーザー本人だけが読める雑誌履歴を90日間保存します。</p>
    <button className={styles.primaryButton} disabled={!ready} onClick={onGenerate} type="button">雑誌の構成をつくる <span aria-hidden="true">→</span></button>
  </section>;
}

function ProgressNav({ current }) {
  return <ol className={styles.progressNav} aria-label="作成手順">{["動画を確認", "読書条件を選ぶ", "雑誌を生成"].map((label, index) => <li className={current >= index + 1 ? styles.currentNav : ""} key={label}>{index + 1}. {label}</li>)}</ol>;
}

function Generating({ progress }) {
  return <section className={styles.generating + " " + styles.enter} aria-live="polite"><div className={styles.loadingMark} aria-hidden="true"><span /></div><p className={styles.eyebrow}>CREATING YOUR MAGAZINE</p><h1>雑誌を編集中です。</h1><p>少しだけお待ちください。動画・音声・字幕は保存しません。</p><ol className={styles.generationList}>{generationSteps.map((step, index) => <li className={index <= progress ? styles.doneStep : ""} key={step}><span>{index < progress ? "✓" : index + 1}</span>{step}</li>)}</ol><small>生成には数十秒かかることがあります。</small></section>;
}

function Preview({ readingMinutes, videoInfo, generationError, onRegenerate, onCreatePdf }) {
  const durationSeconds = videoInfo?.durationSeconds || sampleVideo.minutes * 60;
  const durationLabel = videoInfo?.durationLabel || `${sampleVideo.minutes}分`;
  const channelTitle = videoInfo?.channelTitle || sampleVideo.channel;
  const saved = formatSaved(readingMinutes, durationSeconds);
  return <section className={styles.preview + " " + styles.enter}>
    {generationError && <p className={styles.error} role="alert">{generationError}</p>}
    <div className={styles.previewHero}><div className={styles.previewCover}><span>YOMAZINE / 001</span><div /><h2>小さな<br />習慣の<br />つくりかた。</h2><p>{channelTitle}</p></div><div className={styles.summary}><p className={styles.eyebrow}>PREVIEW</p><h1>{article.title}</h1><p className={styles.lead}>{article.lead}</p><ol className={styles.keyPoints}>{article.keyPoints.map((point, index) => <li key={point}><span>0{index + 1}</span>{point}</li>)}</ol><div className={styles.timeCard}><p>動画 <strong>{durationLabel}</strong> <span>→</span> 読書 約<strong>{readingMinutes}分</strong></p>{saved > 0 && <p><strong>{saved}分</strong>短縮できました</p>}</div></div></div>
    <article className={styles.article}><p className={styles.eyebrow}>FULL ARTICLE</p><h2>{article.title}</h2><p className={styles.articleLead}>{article.lead}</p><section><h3>印象に残ったこと</h3><blockquote>{article.memorableMoment}</blockquote></section><section><h3>小さな準備から始める</h3><p>{article.episode}</p></section><section><h3>続けられる景色をつくる</h3><p>{article.discovery}</p></section><section><h3>明日からの実践ポイント</h3><ul>{article.practicalPoints.map((point) => <li key={point}>{point}</li>)}</ul></section><section><h3>おわりに</h3><p>{article.closing}</p></section></article>
    <div className={styles.previewActions}><button className={styles.secondaryButton} onClick={onRegenerate} type="button">もう一度生成する</button><button className={styles.primaryButton} onClick={onCreatePdf} type="button">この内容でPDFを作る <span aria-hidden="true">→</span></button></div>
  </section>;
}

function Complete({ onCreateAnother, onHistory }) {
  return <section className={styles.complete + " " + styles.enter}><div className={styles.completeMark} aria-hidden="true">✓</div><p className={styles.eyebrow}>YOUR MAGAZINE IS READY</p><h1>雑誌ができました。</h1><p>PDFのダウンロードを開始しました。<br />PDFを開いたら、ブラウザを閉じて読書へ。</p><p className={styles.demoNote}>記事と履歴はサンプルデータで保存しています。</p><div className={styles.completeActions}><button className={styles.textButton} onClick={onCreateAnother} type="button">別の雑誌をつくる <span aria-hidden="true">→</span></button><button className={styles.textButton} onClick={onHistory} type="button">履歴を見る <span aria-hidden="true">→</span></button></div></section>;
}

function History({ items, status, error, onReload, onDelete, onCreate }) {
  return <section className={styles.historyPage + " " + styles.enter}><div className={styles.historyHeading}><div><p className={styles.eyebrow}>YOUR LIBRARY</p><h1>つくった雑誌</h1><p>このブラウザの匿名ユーザーが作成した履歴です。90日後に自動で削除されます。</p></div><button className={styles.primaryButton} onClick={onCreate} type="button">新しい雑誌をつくる <span aria-hidden="true">→</span></button></div>
    {status === "loading" && <p className={styles.historyNotice}>履歴を読み込んでいます。</p>}
    {status === "error" && <div className={styles.historyNotice}><p className={styles.error} role="alert">{error}</p><button className={styles.secondaryButton} onClick={onReload} type="button">もう一度読み込む</button></div>}
    {status === "ready" && items.length === 0 && <div className={styles.emptyHistory}><p>まだ雑誌はありません。</p><span>最初の一冊をつくると、ここから90日間いつでも読み返せます。</span></div>}
    {status === "ready" && items.length > 0 && <ul className={styles.historyList}>{items.map((item) => <li key={item.id}><div className={styles.historyIssue}><span>YOMAZINE</span><strong>{item.latestVersion?.article?.magazineTitle || item.video_title}</strong></div><div className={styles.historyInfo}><p className={styles.historyDate}>{new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(new Date(item.created_at))}</p><h2>{item.video_title}</h2><p>{item.channel_title} ／ 動画{item.video_minutes}分 → 読書約{item.reading_minutes}分</p><p className={styles.historyGoal}>「{item.user_goal}」</p></div><button className={styles.deleteButton} onClick={() => onDelete(item.id)} type="button">削除</button></li>)}</ul>}
  </section>;
}
