# buckline

Log scaling, log and lumber grading, bucking and settlement accounting for a
hardwood sawmill and its woods operations.

A log has one physical volume and several different official volumes, because a
log rule is a contract term rather than a measurement. buckline keeps the
measurement and the rule apart, so the same load can be scaled Doyle for the
stumpage settlement and International for the mill's own recovery study without
either number contaminating the other.

## Layout

    src/units.js      conversions that involve no judgement
    src/measure/      how a stick is measured before any rule is applied
    src/scale/        log rules, defect deductions, net scale
    src/grade/        log grades and lumber grades
    tests/            mirrors src/

## Running

    npm install
    npm test
    npm run lint
