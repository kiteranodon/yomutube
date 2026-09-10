"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

const sampleVideo = {
  title: "小さな習慣が、毎日を変える理由",
  channel: "暮らしを整える研究室",
  minutes: 12,
  thumbnail: "YT",
};

const article = {
  title: "変化は、いつも小さな習慣から。",
  lead:
    "大きな目標を掲げる前に、今日の行動をほんの少し変えてみる。続けるための工夫は、意志の強さよりも、始めやすい環境にありました。",
  keyPoints: [
    "最初の一歩は、2分で終わるほど小さくする。",
    "続けたい行動は、すでにある習慣の直後に置く。",
    "できた日を数えるより、また始められる仕組みをつくる。",
  ],
  memorableMoment:
    "「続かない」のではなく、始めるための距離が少し遠いだけかもしれません。",
  episode:
    "朝に本を読みたい人は、机を整えてから始めようとしがちです。けれど、前の晩に本を枕元へ置くだけなら数秒でできます。目覚めて本が視界に入れば、次の行動までの距離はぐっと短くなります。",
  discovery:
    "習慣は気合いで守る約束ではなく、毎日の景色に置く目印です。やる気が少ない日にも手が伸びる配置をつくれば、行動は特別な決意から日常の流れへ変わっていきます。",
  practicalPoints: [
    "明日やりたいことを、2分だけでできる形に書き換える。",
    "その行動に必要なものを、今夜のうちに見える場所へ置く。",
    "できなかった日は理由を責めず、次に始めるきっかけを一つ用意する。",
  ],
  closing:
    "変化は、遠い場所にある大きな決断ではありません。今日の終わりに一冊の本を置くこと、その小さな準備から明日の景色は静かに変わり始めます。",
};

const generationSteps = ["動画を読んでいます", "記事を編集中", "雑誌を組版中"];

function formatSaved(minutes) {
  return Math.max(0, sampleVideo.minutes - minutes);
}

export default function Home() {
  const [screen, setScreen] = useState("top");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoConfirmed, setVideoConfirmed] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [goal, setGoal] = useState("");
  const [readingMinutes, setReadingMinutes] = useState(5);
  const [agreed, setAgreed] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (screen !== "generating") return undefined;

    const first = window.setTimeout(() => setProgress(1), 700);
    const second = window.setTimeout(() => setProgress(2), 1400);
    const complete = window.setTimeout(() => setScreen("preview"), 2200);

    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
      window.clearTimeout(complete);
    };
  }, [screen]);

  function confirmVideo() {
    const value = videoUrl.trim();
    let parsed;

    try {
      parsed = new URL(value);
    } catch {
      setVideoConfirmed(false);
      setUrlError("YouTubeの通常動画URLを入力してください。");
      return;
    }

    const isYouTube = ["youtube.com", "www.youtube.com"].includes(parsed.hostname);
    const videoId = parsed.searchParams.get("v");

    if (parsed.pathname.startsWith("/shorts/")) {
      setVideoConfirmed(false);
      setUrlError("Shortsは現在対象外です。");
      return;
    }

    if (!isYouTube || parsed.pathname !== "/watch" || !/^[A-Za-z0-9_-]{11}$/.test(videoId || "")) {
      setVideoConfirmed(false);
      setUrlError("YouTubeの通常動画URLを入力してください。");
      return;
    }

    if (parsed.searchParams.has("list")) {
      setVideoConfirmed(false);
      setUrlError("再生リストではなく、通常動画のURLを入力してください。");
      return;
    }

    setUrlError("");
    setVideoConfirmed(true);
  }

  function startGeneration() {
    if (!videoConfirmed || !goal.trim() || !agreed) return;
    setProgress(0);
    setScreen("generating");
  }

  function resetToCreate() {
    setScreen("create");
    setVideoConfirmed(false);
    setVideoUrl("");
    setGoal("");
    setAgreed(false);
    setUrlError("");
  }

  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <button className={styles.logo} onClick={() => setScreen("top")} type="button">
          Yomazine
        </button>
        <p>観る時間を、読む時間に。</p>
      </header>

      {screen === "top" && <Landing onStart={() => setScreen("create")} />}
      {screen === "create" && (
        <CreateMagazine
          videoUrl={videoUrl}
          videoConfirmed={videoConfirmed}
          urlError={urlError}
          goal={goal}
          readingMinutes={readingMinutes}
          agreed={agreed}
          onUrlChange={(value) => {
            setVideoUrl(value);
            setVideoConfirmed(false);
            setUrlError("");
          }}
          onConfirm={confirmVideo}
          onGoalChange={setGoal}
          onReadingMinutesChange={setReadingMinutes}
          onAgreedChange={setAgreed}
          onGenerate={startGeneration}
        />
      )}
      {screen === "generating" && <Generating progress={progress} />}
      {screen === "preview" && (
        <Preview
          readingMinutes={readingMinutes}
          onRegenerate={startGeneration}
          onCreatePdf={() => setScreen("complete")}
        />
      )}
      {screen === "complete" && <Complete onCreateAnother={resetToCreate} />}
    </main>
  );
}

function Landing({ onStart }) {
  return (
    <section className={`${styles.landing} ${styles.enter}`}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>YOUTUBE TO READING</p>
        <h1>観る時間を、<br />読む時間に。</h1>
        <p className={styles.description}>
          YouTube動画を、落ち着いて読める小さな雑誌へ。気になる内容だけを、あなたのペースで読み直せます。
        </p>
        <button className={styles.primaryButton} onClick={onStart} type="button">
          雑誌をつくる <span aria-hidden="true">→</span>
        </button>
      </div>
      <div className={styles.magazineStage} aria-label="Yomazineの雑誌見本">
        <div className={styles.backPage}>
          <span>01</span><i /><i /><i />
          <small>SMALL STEPS<br />FOR EVERY DAY</small>
        </div>
        <div className={styles.coverPage}>
          <span>YOMAZINE / 001</span><div className={styles.coverShape} />
          <h2>小さな<br />習慣の<br />つくりかた。</h2><p>READING ISSUE</p>
        </div>
      </div>
      <ol className={styles.flowList}>
        <li><span>01</span>URLを入れる</li><li><span>02</span>読む目的を選ぶ</li><li><span>03</span>PDFで読む</li>
      </ol>
    </section>
  );
}

function CreateMagazine(props) {
  const { videoUrl, videoConfirmed, urlError, goal, readingMinutes, agreed, onUrlChange, onConfirm, onGoalChange, onReadingMinutesChange, onAgreedChange, onGenerate } = props;
  const ready = videoConfirmed && goal.trim().length > 0 && agreed;
  return (
    <section className={`${styles.formPage} ${styles.enter}`}>
      <ProgressNav current={videoConfirmed ? 2 : 1} />
      <h1>読みたい動画を教えてください。</h1>
      <p className={styles.sectionLead}>公開されている通常動画を1本選び、雑誌にしたい視点を決めます。</p>
      <div className={styles.formBlock}>
        <label htmlFor="video-url">YouTube動画のURL</label>
        <div className={styles.urlRow}>
          <input id="video-url" value={videoUrl} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." inputMode="url" />
          <button className={styles.secondaryButton} onClick={onConfirm} type="button">動画を確認する</button>
        </div>
        {urlError && <p className={styles.error} role="alert">{urlError}</p>}
      </div>
      {videoConfirmed && <div className={styles.videoCard}>
        <div className={styles.thumbnail} aria-hidden="true"><span>{sampleVideo.thumbnail}</span></div>
        <div><p className={styles.videoLabel}>確認できた動画（サンプル表示）</p><h2>{sampleVideo.title}</h2><p>{sampleVideo.channel} <span>／</span> {sampleVideo.minutes}分</p></div>
      </div>}
      <div className={styles.formBlock}>
        <label htmlFor="goal">この動画で知りたいこと</label>
        <textarea id="goal" value={goal} onChange={(event) => onGoalChange(event.target.value.slice(0, 200))} placeholder="例：この動画から、明日試せる習慣を知りたい" maxLength="200" />
        <p className={styles.fieldNote}>記事の視点を決めるための必須項目です。</p>
      </div>
      <fieldset className={styles.timeField}>
        <legend>読書時間</legend><div className={styles.timeOptions}>
          {[3, 5, 10].map((minutes) => <button className={readingMinutes === minutes ? styles.timeSelected : styles.timeOption} key={minutes} onClick={() => onReadingMinutesChange(minutes)} type="button" aria-pressed={readingMinutes === minutes}>
            <strong>約{minutes}分</strong><span>{minutes === 3 ? "要点をすばやく" : minutes === 5 ? "ちょうどよく読む" : "ゆっくり深く読む"}</span>
          </button>)}
        </div>
      </fieldset>
      <label className={styles.agreement}><input checked={agreed} onChange={(event) => onAgreedChange(event.target.checked)} type="checkbox" /><span>個人利用・非再配布に同意する</span></label>
      <p className={styles.terms}>動画・音声・字幕は保存せず、生成物の第三者への配布・販売はしません。</p>
      <button className={styles.primaryButton} disabled={!ready} onClick={onGenerate} type="button">雑誌の構成をつくる <span aria-hidden="true">→</span></button>
    </section>
  );
}

function ProgressNav({ current }) {
  return <ol className={styles.progressNav} aria-label="作成手順">{["動画を確認", "読書条件を選ぶ", "雑誌を生成"].map((label, index) => <li className={current >= index + 1 ? styles.currentNav : ""} key={label}>{index + 1}. {label}</li>)}</ol>;
}

function Generating({ progress }) {
  return <section className={`${styles.generating} ${styles.enter}`} aria-live="polite">
    <div className={styles.loadingMark} aria-hidden="true"><span /></div><p className={styles.eyebrow}>CREATING YOUR MAGAZINE</p><h1>雑誌を編集中です。</h1><p>少しだけお待ちください。動画は保存しません。</p>
    <ol className={styles.generationList}>{generationSteps.map((step, index) => <li className={index <= progress ? styles.doneStep : ""} key={step}><span>{index < progress ? "✓" : index + 1}</span>{step}</li>)}</ol><small>生成には数十秒かかることがあります。</small>
  </section>;
}

function Preview({ readingMinutes, onRegenerate, onCreatePdf }) {
  const saved = formatSaved(readingMinutes);
  return <section className={`${styles.preview} ${styles.enter}`}>
    <div className={styles.previewHero}>
      <div className={styles.previewCover}><span>YOMAZINE / 001</span><div /><h2>小さな<br />習慣の<br />つくりかた。</h2><p>暮らしを整える研究室</p></div>
      <div className={styles.summary}><p className={styles.eyebrow}>PREVIEW</p><h1>{article.title}</h1><p className={styles.lead}>{article.lead}</p>
        <ol className={styles.keyPoints}>{article.keyPoints.map((point, index) => <li key={point}><span>0{index + 1}</span>{point}</li>)}</ol>
        <div className={styles.timeCard}><p>動画 <strong>{sampleVideo.minutes}分</strong> <span>→</span> 読書 約<strong>{readingMinutes}分</strong></p>{saved > 0 && <p><strong>{saved}分</strong>短縮できました</p>}</div>
      </div>
    </div>
    <article className={styles.article}><p className={styles.eyebrow}>FULL ARTICLE</p><h2>{article.title}</h2><p className={styles.articleLead}>{article.lead}</p>
      <section><h3>印象に残ったこと</h3><blockquote>{article.memorableMoment}</blockquote></section>
      <section><h3>小さな準備から始める</h3><p>{article.episode}</p></section>
      <section><h3>続けられる景色をつくる</h3><p>{article.discovery}</p></section>
      <section><h3>明日からの実践ポイント</h3><ul>{article.practicalPoints.map((point) => <li key={point}>{point}</li>)}</ul></section>
      <section><h3>おわりに</h3><p>{article.closing}</p></section>
    </article>
    <div className={styles.previewActions}><button className={styles.secondaryButton} onClick={onRegenerate} type="button">もう一度生成する</button><button className={styles.primaryButton} onClick={onCreatePdf} type="button">この内容でPDFを作る <span aria-hidden="true">→</span></button></div>
  </section>;
}

function Complete({ onCreateAnother }) {
  return <section className={`${styles.complete} ${styles.enter}`}><div className={styles.completeMark} aria-hidden="true">✓</div><p className={styles.eyebrow}>YOUR MAGAZINE IS READY</p><h1>雑誌ができました。</h1><p>PDFのダウンロードを開始しました。<br />PDFを開いたら、ブラウザを閉じて読書へ。</p><p className={styles.demoNote}>現在は画面遷移を確認するためのサンプル表示です。</p><button className={styles.textButton} onClick={onCreateAnother} type="button">別の雑誌をつくる <span aria-hidden="true">→</span></button></section>;
}
