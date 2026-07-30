import {
  mergeAdjacentHighlights,
  normalizeHighlightItems,
  snapToWordBounds,
} from './highlight-normalize';
import {
  buildIndexedScriptDraft,
  buildScriptDraft,
  cleanCaptionText,
  formatAsSentenceScript,
  formatScriptFromLineEnds,
  formatScriptWithBoundedLines,
  isChapterHeaderLine,
  isCurrentScriptFormat,
  MAX_SCRIPT_LINE_WORDS,
  repairReflowToSpokenWords,
  sameSpokenWords,
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

describe('isChapterHeaderLine', () => {
  it('matches plain and bold chapter headers', () => {
    expect(isChapterHeaderLine('0:00  Intro')).toBe(true);
    expect(isChapterHeaderLine('<b>0:00  Intro</b>')).toBe(true);
    expect(
      isChapterHeaderLine('<b>0:24  The Dance (Inspired by SouthPark)</b>'),
    ).toBe(true);
    expect(isChapterHeaderLine('not a header')).toBe(false);
  });
});

describe('isCurrentScriptFormat', () => {
  it('rejects plain (non-bold) chapter headers', () => {
    expect(
      isCurrentScriptFormat('0:00  Intro\n\nHello world.\nAnother line.'),
    ).toBe(false);
  });

  it('accepts bold chapter headers with complete thought lines', () => {
    expect(
      isCurrentScriptFormat(
        [
          '<b>0:00  Intro</b>',
          '',
          "today we're talking about storytelling",
          'if you want your content to perform better you need to learn how to tell better stories',
          "all right let's dive",
        ].join('\n'),
      ),
    ).toBe(true);
  });

  it('rejects caption-chunk short lines', () => {
    const short = Array.from({ length: 10 }, (_, i) => `chunk ${i} words`).join(
      '\n',
    );
    expect(isCurrentScriptFormat(short)).toBe(false);
  });

  it('rejects mid-thought wraps that hang on function words', () => {
    const bad = [
      '<b>0:00  Intro</b>',
      '',
      "today we're talking about storytelling if you want your content to perform better you need to learn how to tell better stories so in this video I'm",
      'going to walk through my six favorite storytelling techniques',
    ].join('\n');
    expect(isCurrentScriptFormat(bad)).toBe(false);
  });

  it('rejects a wall of text even when chapter headers are valid', () => {
    const giantLine = Array.from(
      { length: MAX_SCRIPT_LINE_WORDS + 1 },
      (_, index) => `word${index}`,
    ).join(' ');
    expect(isCurrentScriptFormat(`<b>0:00  Intro</b>\n\n${giantLine}`)).toBe(
      false,
    );
  });
});

describe('sameSpokenWords', () => {
  it('ignores newlines and chapter headers', () => {
    const draft =
      '<b>0:00  Intro</b>\n\ntoday we are talking about storytelling if you want better stories';
    const formatted = [
      '<b>0:00  Intro</b>',
      '',
      'today we are talking about storytelling',
      'if you want better stories',
    ].join('\n');
    expect(sameSpokenWords(draft, formatted)).toBe(true);
  });

  it('detects added or removed words', () => {
    expect(sameSpokenWords('hello world', 'hello there world')).toBe(false);
  });
});

describe('repairReflowToSpokenWords', () => {
  it('restores spaces the AI dropped while keeping line breaks', () => {
    const draft =
      'Steve would say, by the way, not a nice guy. Not a nice guy. A man or woman that understands the signal noise ratio';
    const reflowed = [
      'Steve would say, by the way, not a niceguy.',
      'Not a nice guy.',
      'A man or woman that understands the signal noise ratio',
    ].join('\n');

    const repaired = repairReflowToSpokenWords(draft, reflowed);
    expect(repaired).toBe(
      [
        'Steve would say, by the way, not a nice guy.',
        'Not a nice guy.',
        'A man or woman that understands the signal noise ratio',
      ].join('\n'),
    );
    expect(sameSpokenWords(draft, repaired!)).toBe(true);
  });

  it('returns null when letter content truly changes', () => {
    expect(
      repairReflowToSpokenWords('hello world', 'hello there world'),
    ).toBeNull();
  });

  it('preserves chapter headers from the reflowed script', () => {
    const draft =
      '<b>0:00  Intro</b>\n\ntoday we are talking about storytelling if you want better stories';
    const reflowed = [
      '<b>0:00  Intro</b>',
      '',
      'today we are talking about storytelling',
      'if you want better stories',
    ].join('\n');

    expect(repairReflowToSpokenWords(draft, reflowed)).toBe(reflowed);
  });
});

describe('indexed script line boundaries', () => {
  const draft = [
    '<b>0:00  Intro</b>',
    '',
    'today we build useful apps for customers',
    '',
    '<b>0:12  Goals</b>',
    '',
    'first choose one clear problem to solve',
  ].join('\n');

  it('indexes words globally and records required chapter endings', () => {
    const indexed = buildIndexedScriptDraft(draft);

    expect(indexed.wordCount).toBe(14);
    expect(indexed.chapterEndIndexes).toEqual([6, 13]);
    expect(indexed.annotated).toContain('[0]today');
    expect(indexed.annotated).toContain('[13]solve');
  });

  it('reconstructs natural lines using untouched draft words', () => {
    const formatted = formatScriptFromLineEnds(draft, [3, 6, 9, 13]);

    expect(formatted).toBe(
      [
        '<b>0:00  Intro</b>',
        '',
        'today we build useful',
        'apps for customers',
        '',
        '<b>0:12  Goals</b>',
        '',
        'first choose one',
        'clear problem to solve',
      ].join('\n'),
    );
    expect(sameSpokenWords(draft, formatted!)).toBe(true);
  });

  it('rejects missing chapter endings and oversized lines', () => {
    expect(formatScriptFromLineEnds(draft, [3, 9, 13])).toBeNull();
    expect(formatScriptFromLineEnds(draft, [3, '6', 9, 13])).toBeNull();
    expect(formatScriptFromLineEnds(draft, [6, 3, 9, 13])).toBeNull();

    const longDraft = Array.from(
      { length: MAX_SCRIPT_LINE_WORDS + 1 },
      (_, index) => `word${index}`,
    ).join(' ');
    expect(
      formatScriptFromLineEnds(longDraft, [MAX_SCRIPT_LINE_WORDS]),
    ).toBeNull();
  });
});

describe('formatScriptWithBoundedLines', () => {
  it('turns a long unpunctuated chapter into readable bounded lines', () => {
    const intro =
      'have you ever wanted to bring an app idea to life and turn it into a source of income this is what being able to code can unlock but here is a common trap most people waste months learning things that do not move them closer to their goals';
    const mindset =
      'before we dive into the road map let us talk about something just as important your mindset first think of yourself as a problem solver not just a programmer and focus on solving real problems for users';
    const draft = [
      '<b>0:00  Intro</b>',
      '',
      intro,
      '',
      '<b>0:46  The mindset you need to adopt</b>',
      '',
      mindset,
    ].join('\n');

    const formatted = formatScriptWithBoundedLines(draft);
    const spokenLines = formatted
      .split('\n')
      .filter((line) => line && !isChapterHeaderLine(line));

    expect(spokenLines.length).toBeGreaterThan(2);
    expect(
      spokenLines.every(
        (line) => line.split(/\s+/).length <= MAX_SCRIPT_LINE_WORDS,
      ),
    ).toBe(true);
    expect(sameSpokenWords(draft, formatted)).toBe(true);
    expect(isCurrentScriptFormat(formatted)).toBe(true);
  });
});

describe('buildScriptDraft', () => {
  it('joins unpunctuated segments into continuous chapter blocks', () => {
    const text = buildScriptDraft(
      {
        videoId: 'x',
        segments: [
          { text: 'today we are talking', duration: 2000, offset: 0 },
          { text: 'about storytelling', duration: 2000, offset: 2000 },
          { text: 'dance between context', duration: 2000, offset: 30_000 },
        ],
        text: 'today we are talking about storytelling dance between context',
      },
      [
        { startSec: 0, title: 'Intro' },
        { startSec: 24, title: 'The Dance (Inspired by SouthPark)' },
      ],
    );

    expect(text).toBe(
      [
        '<b>0:00  Intro</b>',
        '',
        'today we are talking about storytelling',
        '',
        '<b>0:24  The Dance (Inspired by SouthPark)</b>',
        '',
        'dance between context',
      ].join('\n'),
    );
    expect(text).not.toMatch(/talking\nabout/);
  });
});

describe('script-format', () => {
  it('strips caption noise from punctuated script lines', () => {
    const text = formatAsSentenceScript(
      {
        videoId: 'x',
        segments: [
          {
            text: 'How to get [music] whatever you want.',
            duration: 1000,
            offset: 0,
          },
          { text: '>> ask.', duration: 1000, offset: 1000 },
          { text: '[music]', duration: 500, offset: 2000 },
        ],
        text: 'How to get [music] whatever you want. >> ask. [music]',
      },
      [],
    );

    expect(text).toBe('How to get whatever you want.\nask.');
  });

  it('splits into one sentence per line when punctuated', () => {
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

  it('returns continuous draft for unpunctuated ASR (AI reflow input)', () => {
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
      "one of the keys to apple is apple's an incredibly collaborative company we're organized like a startup",
    );
  });

  it('inserts bold chapter headers with two spaces using ms offsets', () => {
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
    expect(text).toContain('<b>0:00  Intro</b>');
    expect(text).toContain('<b>1:00  Main</b>');
    expect(text).toMatch(/<b>0:00 {2}Intro<\/b>\n\nOpening line\./);
    expect(text).toMatch(/<b>1:00 {2}Main<\/b>\n\nLater line\./);
  });

  it('buckets unpunctuated draft into chapters by ms offset', () => {
    const text = buildScriptDraft(
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

    expect(text).toBe(
      '<b>0:00  Intro</b>\n\nintro talk\n\n<b>1:00  Main</b>\n\nmain idea here',
    );
  });

  it('omits chapter headers when fewer than 2 chapters', () => {
    const text = buildScriptDraft(
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
        {
          type: 'rehook',
          start: 10,
          end: sample.length,
          quote: 'ly looking for.',
        },
      ],
      sample,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.quote).toBe(sample);
  });

  it('skips chapter header-only ranges', () => {
    const header = '<b>0:00  Intro</b>';
    const script = `${header}\n\nHello world.`;
    const highlights = normalizeHighlightItems(
      [
        {
          type: 'hook',
          start: 0,
          end: header.length,
          quote: header,
        },
      ],
      script,
    );
    expect(highlights).toHaveLength(0);
  });
});
