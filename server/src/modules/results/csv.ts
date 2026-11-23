import type { AdminResultItemDto } from './results.dto';

export const CSV_HEADERS = [
  'Candidate Name',
  'Email',
  'Phone',
  'Age',
  'Score',
  'Percentage',
  'Correct Count',
  'Incorrect Count',
  'Unattempted Count',
  'Pass/Fail',
  'Attempt Date',
  'Time Taken (seconds)',
] as const;

/**
 * Escapes a CSV cell and neutralizes spreadsheet formula injection.
 * Numeric values are emitted as-is (so negative scores stay numbers).
 */
export function escapeCsvCell(value: string | number): string {
  if (typeof value === 'number') return String(value);

  let text = value;
  // Neutralize spreadsheet formulas even when the trigger character is
  // preceded by whitespace/control characters (e.g. "  =1+1" or "\t@cmd").
  if (/^\s*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildResultsCsv(items: AdminResultItemDto[]): string {
  const rows: Array<Array<string | number>> = [
    [...CSV_HEADERS],
    ...items.map((item) => [
      item.candidate.fullName,
      item.candidate.email,
      item.candidate.phone,
      item.candidate.age,
      item.netScore,
      item.percentage,
      item.correctCount,
      item.incorrectCount,
      item.unattemptedCount,
      item.outcome,
      item.startedAt,
      item.timeTakenSeconds,
    ]),
  ];

  return `${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}
