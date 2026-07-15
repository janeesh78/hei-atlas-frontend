'use client';

import { useState } from 'react';
import { sendNoteFeedback } from '@/lib/auth';

interface Props {
  /** The saved encounter this note came from (may be null if save is still in flight). */
  encounterId?: string | null;
  /** Which output format was generated — useful for analytics. */
  outputFormat?: string;
  /** Fires once feedback is successfully submitted, so a parent can hide the widget. */
  onDone?: () => void;
}

type Phase = 'idle' | 'thanks' | 'down-form' | 'sending' | 'sent';

export default function ThumbsFeedback({ encounterId, outputFormat, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (rating: 'up' | 'down', feedback?: string) => {
    setError(null);
    try {
      await sendNoteFeedback({
        rating,
        encounter_id: encounterId,
        output_format: outputFormat,
        feedback_text: feedback,
      });
      if (rating === 'up') {
        setPhase('thanks');
      } else {
        setPhase('sent');
      }
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send.');
      setPhase(rating === 'down' ? 'down-form' : 'idle');
    }
  };

  if (phase === 'thanks') {
    return (
      <div className="text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-button px-3 py-2">
        Thanks — glad this was useful.
      </div>
    );
  }

  if (phase === 'sent') {
    return (
      <div className="text-[13px] text-ink bg-canvas border border-rule rounded-button px-3 py-2">
        Thanks for the feedback. We&apos;ll review and improve this.
      </div>
    );
  }

  if (phase === 'down-form' || phase === 'sending') {
    return (
      <div className="rounded-button border border-rule bg-canvas px-3 py-3 space-y-2">
        <p className="text-[13px] text-ink">
          Sorry this note missed the mark. What went wrong?
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g., missing prior therapy, wrong format, hallucinated finding…"
          rows={3}
          className="ds-input w-full text-[13px] resize-none"
          disabled={phase === 'sending'}
          autoFocus
        />
        {error && (
          <p className="text-[12px] text-red-700">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { setPhase('idle'); setText(''); }}
            className="btn-ghost text-[13px] px-3 py-1.5"
            disabled={phase === 'sending'}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => { setPhase('sending'); await submit('down', text.trim() || undefined); }}
            className="btn-primary text-[13px] px-3 py-1.5"
            disabled={phase === 'sending'}
          >
            {phase === 'sending' ? 'Sending…' : 'Send feedback'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-[13px] text-muted">
      <span>Was this note useful?</span>
      <button
        type="button"
        onClick={() => submit('up')}
        aria-label="Thumbs up"
        className="w-8 h-8 rounded-full border border-rule flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
          <path d="M7 8.5V16h7.4a1.6 1.6 0 0 0 1.58-1.34l.8-4.8A1.6 1.6 0 0 0 15.2 8h-3.8V5.4A1.4 1.4 0 0 0 10 4c-.4 0-.75.24-.9.6L7 8.5Z" strokeLinejoin="round" />
          <path d="M4 8.5H7V16H4a.6.6 0 0 1-.6-.6V9.1A.6.6 0 0 1 4 8.5Z" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setPhase('down-form')}
        aria-label="Thumbs down"
        className="w-8 h-8 rounded-full border border-rule flex items-center justify-center hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
          <path d="M13 11.5V4H5.6A1.6 1.6 0 0 0 4.02 5.34l-.8 4.8A1.6 1.6 0 0 0 4.8 12h3.8v2.6A1.4 1.4 0 0 0 10 16c.4 0 .75-.24.9-.6L13 11.5Z" strokeLinejoin="round" />
          <path d="M16 11.5H13V4h3a.6.6 0 0 1 .6.6v6.3a.6.6 0 0 1-.6.6Z" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
