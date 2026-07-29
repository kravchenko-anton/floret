import {
  mergeAdjacentHighlights,
  normalizeHighlightItems,
  snapToWordBounds,
} from './highlight-normalize';
import {
  cleanCaptionText,
  formatAsSentenceScript,
  splitIntoSentences,
} from './script-format';
import { formatChapterHeader } from './chapters';

describe('cleanCaptionText', () => {
  it('removes music tags, arrows, and sound cues', () => {
    expect(
      cleanCaptionText(
        'How to get [music] whatever you want. >> [music] >> ask. (laughter)',
      ),
    ).toBe('How to get whatever you want. ask.');
  });

  it('drops segments that are only noise', () => {
    expect(cleanCaptionText('>> [music] <<')).toBe('');
  });

  it('cleans a long noisy Jim Rohn-style caption blob', () => {
    const dirty =
      'Asking [music] is the beginning of receiving. >> [music] >> Receiving is automatic. >> [laughter] >> Have you got the picture?';
    expect(cleanCaptionText(dirty)).toBe(
      'Asking is the beginning of receiving. Receiving is automatic. Have you got the picture?',
    );
  });
});

describe('script-format', () => {
  it('strips caption noise from analyze script lines', () => {
    const text = formatAsSentenceScript(
      {
        videoId: 'x',
        segments: [
          { text: 'How to get [music] whatever you want.', duration: 1000, offset: 0 },
          { text: '>> ask.', duration: 1000, offset: 1000 },
          { text: '[music]', duration: 500, offset: 2000 },
        ],
        text: 'How to get [music] whatever you want. >> ask. [music]',
      },
      [],
    );

    expect(text).toBe('How to get whatever you want.\nask.');
  });

  it('splits into one sentence per line', () => {
    const text = formatAsSentenceScript(
      {
        videoId: 'x',
        segments: [
          { text: 'Hello there.', duration: 1000, offset: 0 },
          { text: 'How are you?', duration: 1000, offset: 1000 },
        ],
        text: 'Hello there. How are you?',
      },
      [],
    );

    expect(text).toBe('Hello there.\nHow are you?');
  });

  it('falls back to one segment per line for unpunctuated ASR', () => {
    const text = formatAsSentenceScript(
      {
        videoId: 'x',
        segments: [
          {
            text: 'one of the keys to apple is',
            duration: 2000,
            offset: 0,
          },
          {
            text: "apple's an incredibly collaborative company",
            duration: 2500,
            offset: 2000,
          },
          {
            text: "we're organized like a startup",
            duration: 2000,
            offset: 4500,
          },
        ],
        text: "one of the keys to apple is apple's an incredibly collaborative company we're organized like a startup",
      },
      [],
    );

    expect(text).toBe(
      [
        'one of the keys to apple is',
        "apple's an incredibly collaborative company",
        "we're organized like a startup",
      ].join('\n'),
    );
  });

  it('inserts chapter headers with two spaces using ms offsets', () => {
    const text = formatAsSentenceScript(
      {
        videoId: 'x',
        segments: [
          { text: 'Opening line.', duration: 1000, offset: 0 },
          // 90s in ms — must land in Main chapter (60s)
          { text: 'Later line.', duration: 1000, offset: 90_000 },
        ],
        text: 'Opening line. Later line.',
      },
      [
        { startSec: 0, title: 'Intro' },
        { startSec: 60, title: 'Main' },
      ],
    );

    expect(text).toContain(formatChapterHeader(0, 'Intro'));
    expect(text).toContain('0:00  Intro');
    expect(text).toContain('1:00  Main');
    expect(text).toMatch(/0:00 {2}Intro\n\nOpening line\./);
    expect(text).toMatch(/1:00 {2}Main\n\nLater line\./);
  });

  it('buckets unpunctuated segments into chapters by ms offset', () => {
    const text = formatAsSentenceScript(
      {
        videoId: 'x',
        segments: [
          { text: 'intro talk', duration: 2000, offset: 0 },
          { text: 'main idea here', duration: 2000, offset: 65_000 },
        ],
        text: 'intro talk main idea here',
      },
      [
        { startSec: 0, title: 'Intro' },
        { startSec: 60, title: 'Main' },
      ],
    );

    expect(text).toBe('0:00  Intro\n\nintro talk\n\n1:00  Main\n\nmain idea here');
  });

  it('omits chapter headers when fewer than 2 chapters', () => {
    const text = formatAsSentenceScript(
      {
        videoId: 'x',
        segments: [{ text: 'Only one.', duration: 1000, offset: 0 }],
        text: 'Only one.',
      },
      [{ startSec: 0, title: 'Intro' }],
    );

    expect(text).toBe('Only one.');
    expect(text).not.toContain('Intro');
  });
});

describe('splitIntoSentences', () => {
  it('handles ellipsis and punctuation', () => {
    expect(splitIntoSentences('One. Two! Three?')).toEqual([
      'One.',
      'Two!',
      'Three?',
    ]);
  });
});

describe('highlight-normalize', () => {
  const text =
    'frequency, and amplitude in clear way. But search a song with a raw spectrum.';

  it('snaps mid-word offsets to word bounds', () => {
    // start at the 'q' inside "frequency"
    const freq = text.indexOf('frequency');
    const snapped = snapToWordBounds(text, freq + 3, freq + 20);
    expect(snapped).not.toBeNull();
    expect(text[snapped!.start]).toBe('f');
    expect(text.slice(snapped!.start, snapped!.end)).toMatch(/^frequency/);
  });

  it('resolves unique quote first', () => {
    const quote = 'But search a song with a raw spectrum.';
    const highlights = normalizeHighlightItems(
      [{ type: 'rehook', start: 0, end: 3, quote }],
      text,
    );
    expect(highlights).toHaveLength(1);
    expect(highlights[0]!.quote).toBe(quote);
    expect(highlights[0]!.start).toBe(text.indexOf(quote));
  });

  it('merges adjacent same-type highlights', () => {
    const sample = 'most likely looking for.';
    const merged = mergeAdjacentHighlights(
      [
        { type: 'rehook', start: 0, end: 10, quote: 'most like' },
        { type: 'rehook', start: 10, end: sample.length, quote: 'ly looking for.' },
      ],
      sample,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.quote).toBe(sample);
  });

  it('skips chapter header-only ranges', () => {
    const script = '0:00  Intro\n\nHello world.';
    const highlights = normalizeHighlightItems(
      [
        {
          type: 'hook',
          start: 0,
          end: '0:00  Intro'.length,
          quote: '0:00  Intro',
        },
      ],
      script,
    );
    expect(highlights).toHaveLength(0);
  });
});
