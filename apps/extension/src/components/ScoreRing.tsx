import { useEffect, useState } from 'react';

export function ScoreRing({ score }: { score: number | null }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (score === null) {
      setDisplay(0);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(score);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / 750);
      setDisplay(Math.round(score * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    setDisplay(0);
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);
  const tone =
    score === null
      ? 'unknown'
      : score >= 75
        ? 'low'
        : score >= 45
          ? 'moderate'
          : 'high';
  return (
    <div
      className={`score-ring ${tone}`}
      role="img"
      aria-label={
        score === null
          ? 'Privacy indicator unavailable because coverage is insufficient'
          : `Privacy indicator ${score} out of 100. Higher means fewer observed exposure signals.`
      }
    >
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle className="ring-track" cx="64" cy="64" r="53" />
        <circle
          className="ring-value"
          cx="64"
          cy="64"
          r="53"
          strokeDasharray={2 * Math.PI * 53}
          strokeDashoffset={2 * Math.PI * 53 * (1 - display / 100)}
        />
      </svg>
      <div className="score-number">
        <strong>{score === null ? '—' : display}</strong>
        <small>{score === null ? 'UNKNOWN' : 'OUT OF 100'}</small>
      </div>
    </div>
  );
}
