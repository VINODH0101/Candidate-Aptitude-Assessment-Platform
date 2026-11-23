import { describe, expect, it } from 'vitest';
import {
  CSV_HEADERS,
  buildResultsCsv,
  escapeCsvCell,
} from '../src/modules/results/csv';

describe('CSV formatting', () => {
  it('neutralizes spreadsheet formula injection for strings', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('+cmd')).toBe("'+cmd");
    expect(escapeCsvCell('-cmd')).toBe("'-cmd");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
    expect(escapeCsvCell('\tcmd')).toBe("'\tcmd");
    expect(escapeCsvCell('\rcmd')).toBe("\"'\rcmd\"");
  });

  it('keeps numeric values (including negatives) as numbers', () => {
    expect(escapeCsvCell(-10)).toBe('-10');
    expect(escapeCsvCell(0)).toBe('0');
    expect(escapeCsvCell(99)).toBe('99');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
    expect(escapeCsvCell('a\r\nb')).toBe('"a\r\nb"');
    expect(escapeCsvCell('=a,b')).toBe("\"'=a,b\"");
  });

  it('emits only headers for an empty dataset', () => {
    expect(buildResultsCsv([])).toBe(`${CSV_HEADERS.join(',')}\r\n`);
  });
});
