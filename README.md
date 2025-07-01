# buckline

Log scaling, log and lumber grading, bucking, kiln planning and settlement
accounting for a hardwood sawmill and its woods operations.

A log has one physical volume and several different official volumes, because a
log rule is a contract term rather than a measurement. buckline keeps the
measurement and the rule apart, so the same load can be scaled Doyle for the
stumpage settlement and International for the mill's own recovery study without
either number contaminating the other.

Command line only. No server, no database, no port. The yard book is a file.

## What it does

    buckline scale     -l load.json -t tract.json
    buckline grade     -i logs.json
    buckline buck      -s stem.json -p prices.json -r doyle
    buckline settle    -g graded.json -t terms.json
    buckline tally     recovery -i tally.json
    buckline kiln      plan -u units.json
    buckline deck      aging -d deck.json
    buckline report    reconcile -i logs.json -r doyle --scaled 4800 --tallied 5200
    buckline period    statement -s statements.json -t terms.json -p 2025-06
    buckline audit     check -t ticket.json -c check.json
    buckline yard      receive -y book.jsonl -i load.json
    buckline rules     --rule scribner
    buckline species
    buckline doctor

`buckline commands` prints the lot with a line about each. Anything that
produces a report also takes `-f text|csv|json` and `-o <file>`.

Every example above runs against the files in `examples/`.

## The idea

Nearly everything here is one rule deciding what another rule measures.

The log rule in the contract decides how a defect is deducted, so the same rot
in the same log comes off the length under International, off the diameter
under Scribner and squared out under Doyle, and the three net scales do not
agree. Which of them can be measured at all depends on the shape of the fault,
so a rule that cannot measure a defect falls back to what the defect prefers.

At grade one, the scaling diameter decides how long a clear cutting has to be
before it counts, so a face that passes on a twenty inch log fails on a
fourteen inch one with the same knots on it. On the common lumber grades the
board may take one more cutting in exchange for a higher yield, which means the
number of cuttings allowed depends on the yield achieved and the yield achieved
depends on the cuttings taken. Both branches are tried.

The species picks the rule book before anything is measured, so a knot in the
middle of a board is a downgrade on the hardwood book and nothing at all on the
structural one.

Drying moves the width, and surface measure is width by length, so a board can
change surface measure class in the shed. A grade read green is provisional.

## Layout

    src/units.js        conversions that involve no judgement
    src/measure/        how a stick is measured before any rule is applied
    src/scale/          log rules, defect deductions, net scale, weight, sampling
    src/grade/          log grades, lumber grades, structural grades
    src/buck/           stems, cut candidates, bucking for value
    src/mill/           sawing patterns, target sizing, edger, trimmer, residue
    src/kiln/           schedules, moisture, degrade, charges, runs, conditioning
    src/tally/          packages, recovery, shipments
    src/inventory/      the log deck and what waiting costs
    src/price/          price lists, index series, discounts, valuation
    src/settle/         stumpage, haul, deductions, splits, statements, tax
    src/report/         the documents and the reports that read several things
    src/analysis/       control charts, benchmarking, variance
    src/store/          the append only yard book
    src/cli/            the command line
    tests/              mirrors src, plus property, edge and load tests
    examples/           the files every command in this readme runs against

## Running

    npm install
    npm test
    npm run check        lint, format, tests, smoke and release checks
    npm run coverage

## The yard book

`buckline yard` writes to an append only journal. Nothing is ever edited: a
scale that was wrong is corrected by writing the correction, because the
settlement clerk has to be able to show what was on the ticket in March and
what changed since. Reading is a fold over the entries, snapshots are a cache
that changes no answer, and one writer holds a lock at a time.

## Conventions

Numbers are rounded in one place. Documents are fixed width text with the
numbers lined up, because people add a column by eye when they think the total
is wrong. Errors carry a code and a path, and the exit code is the interface:
two for a usage mistake, three for bad data, four for a missing file, five for
anything else.
