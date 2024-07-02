import { describe, expect, it } from 'vitest';
import { makeBoard } from '../../src/model/board.js';
import { asStructuralPiece, bookFor, grade, gradeTally } from '../../src/grade/index.js';

function board(species, defects = [], extra = {}) {
  return makeBoard({
    id: 'B-1',
    species,
    thicknessIn: 1,
    widthIn: 8,
    lengthFt: 12,
    defects,
    ...extra,
  });
}

describe('bookFor', () => {
  it('sends a hardwood to the cutting book and a softwood to the strength book', () => {
    expect(bookFor(board('red oak'))).toBe('nhla');
    expect(bookFor(board('loblolly pine'))).toBe('structural');
  });
});

describe('grade', () => {
  it('grades a clean oak board on the hardwood book', () => {
    const result = grade(board('red oak'));
    expect(result.book).toBe('nhla');
    expect(result.grade).toBe('FAS');
  });

  it('grades a clean pine board on the structural book', () => {
    const result = grade(board('loblolly pine'));
    expect(result.book).toBe('structural');
    expect(result.grade).toBe('SS');
  });

  it('gives the same physical board two different answers by species', () => {
    const defects = [
      { type: 'knot', face: 0, startFt: 5, lengthFt: 1, fromEdgeIn: 3, widthIn: 2 },
      { type: 'knot', face: 1, startFt: 5, lengthFt: 1, fromEdgeIn: 3, widthIn: 2 },
    ];
    const oak = grade(board('red oak', defects));
    const pine = grade(board('loblolly pine', defects));
    expect(oak.grade).not.toBe(pine.grade);
    expect(oak.book).not.toBe(pine.book);
  });

  it('takes centre knots the hardwood book punishes and the strength book does not', () => {
    const defects = [
      { type: 'knot', face: 0, startFt: 4, lengthFt: 1, fromEdgeIn: 3, widthIn: 2 },
      { type: 'knot', face: 1, startFt: 8, lengthFt: 1, fromEdgeIn: 3, widthIn: 2 },
    ];
    expect(grade(board('red oak', defects)).grade).not.toBe('FAS');
    expect(grade(board('loblolly pine', defects)).grade).toBe('SS');
  });

  it('pulls the strength grade down when the same knots line up through the piece', () => {
    const stacked = [
      { type: 'knot', face: 0, startFt: 4, lengthFt: 1, fromEdgeIn: 3, widthIn: 2 },
      { type: 'knot', face: 1, startFt: 4, lengthFt: 1, fromEdgeIn: 3, widthIn: 2 },
    ];
    expect(grade(board('loblolly pine', stacked)).grade).toBe('No1');
  });

  it('carries the species and the board id through', () => {
    const result = grade(board('hard maple'));
    expect(result.species).toBe('hard maple');
    expect(result.boardId).toBe('B-1');
  });

  it('refuses a species the yard does not buy', () => {
    expect(() => grade({ ...board('red oak'), species: 'teak' })).toThrow();
  });
});

describe('asStructuralPiece', () => {
  it('keeps the knots and drops everything else', () => {
    const piece = asStructuralPiece(
      board('loblolly pine', [
        { type: 'knot', startFt: 3, lengthFt: 1, fromEdgeIn: 2, widthIn: 1 },
        { type: 'shake', startFt: 6, lengthFt: 1, fromEdgeIn: 0, widthIn: 2 },
      ])
    );
    expect(piece.knots).toHaveLength(1);
    expect(piece.knots[0].sizeIn).toBe(1);
  });

  it('reads the wane off the two widths', () => {
    const piece = asStructuralPiece(board('loblolly pine', [], { wideWidthIn: 10 }));
    expect(piece.waneShare).toBeCloseTo(0.2, 6);
  });

  it('treats an unrecorded slope as dead straight', () => {
    expect(asStructuralPiece(board('loblolly pine')).slopeRun).toBe(Infinity);
  });
});

describe('gradeTally', () => {
  const boards = [
    board('red oak'),
    board('hard maple'),
    board('loblolly pine'),
    board('shortleaf pine'),
  ];

  it('grades every board under its own book', () => {
    const result = gradeTally(boards);
    expect(result.results.map((r) => r.book)).toEqual(['nhla', 'nhla', 'structural', 'structural']);
  });

  it('counts grades within their own book', () => {
    const summary = gradeTally(boards).byGrade;
    expect(summary.find((row) => row.book === 'nhla').count).toBe(2);
    expect(summary.find((row) => row.book === 'structural').count).toBe(2);
  });

  it('counts the boards nothing would take', () => {
    expect(gradeTally(boards).ungraded).toBe(0);
  });
});
