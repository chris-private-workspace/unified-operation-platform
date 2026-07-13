import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('parses a simple grid', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps empty leading/middle cells (matrix corner + blank allocations)', () => {
    expect(parseCsv(',RHK,RTH\nM365 E3,661,\nO365 E1,,6')).toEqual([
      ['', 'RHK', 'RTH'],
      ['M365 E3', '661', ''],
      ['O365 E1', '', '6'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields with commas and escaped quotes', () => {
    expect(parseCsv('"M365 E3, No Teams","say ""hi""",5')).toEqual([
      ['M365 E3, No Teams', 'say "hi"', '5'],
    ]);
  });

  it('strips a UTF-8 BOM from Excel export', () => {
    expect(parseCsv('﻿a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('does not emit a trailing empty row when input ends on a newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});
