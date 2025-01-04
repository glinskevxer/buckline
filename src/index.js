/**
 * The public surface.
 *
 * Everything a program embedding buckline is allowed to depend on. What is not
 * here is internal and will move without notice, and quite a lot has: the
 * cutting search has been rewritten twice and the bucking optimiser once, and
 * neither is exported because neither has an interface anybody outside should
 * have been holding.
 *
 * The rule for what belongs here: a thing is public if it takes plain data and
 * gives back plain data, and if the mill would recognise what it does. A
 * helper that exists because two modules needed the same loop is not public
 * however useful it looks.
 */

export {
  BucklineError,
  ContractError,
  GradeError,
  ScaleError,
  ValidationError,
  formatError,
  isBucklineError,
} from './errors.js';
export {
  boardFeet,
  cubicFeet,
  cylinderCubicFeet,
  formatQuarters,
  fromMbf,
  inchesFromQuarters,
  quarters,
  toMbf,
} from './units.js';

export {
  lookupSpecies,
  knownSpecies,
  ruleBookFor,
  speciesInGroup,
  speciesKeys,
} from './model/species.js';
export { makeLog, describeLog, isButtLog } from './model/log.js';
export { makeBoard, describeBoard, surfaceMeasure, tallyBoardFeet } from './model/board.js';
export { makeLoad, netWeightLb, weightCheck } from './model/load.js';
export { makeTract, measurementOptions, scalingOptions, tractOpenOn } from './model/tract.js';

export { scalingDiameter } from './measure/diameter.js';
export { scalingLength, nominalLengths } from './measure/length.js';
export { diameterAt, distanceToDiameter, taperRate } from './measure/taper.js';

export {
  getRule,
  ruleIds,
  rulePolicy,
  scaleUnder,
  compareRules,
  crossoverDiameter,
} from './scale/rules/index.js';
export { grossScale, grossScaleAll } from './scale/gross.js';
export { netScale } from './scale/net.js';
export { scaleTicket, cullReport, deductionShare, averageLogSize } from './scale/ticket.js';
export { checkScale, scalerDrift } from './scale/audit.js';
export { measureFactor, estimatedFactor, weightToBoardFeet, factorDrift } from './scale/weight.js';
export { sampleVerdict, expandByPieces } from './scale/sample.js';
export { defectType, defectIds } from './scale/defect/types.js';
export { methodFor } from './scale/defect/policy.js';

export { gradeLog, gradeLoad } from './grade/log/index.js';
export { factoryGrade, meetsGrade } from './grade/log/usfs.js';
export { tieGrade, veneerGrade } from './grade/log/construction.js';
export { grade, gradeTally, bookFor } from './grade/index.js';
export { gradeBoard, meetsLumberGrade } from './grade/lumber/grade.js';
export { reinspect, blendedGrade } from './grade/lumber/reinspect.js';
export { gradePiece, gradeWithout } from './grade/softwood/structural.js';

export { makeStem, cutCandidates, merchantableHeightFt } from './buck/stem.js';
export { withLengthClasses } from './buck/candidates.js';
export { buckStem, compareBucking } from './buck/optimize.js';
export { cuttingCard, expectedTally, againstPlan } from './buck/report.js';

export { saw, comparePatterns, PATTERNS } from './mill/pattern.js';
export { targetThickness, savingFromMachine } from './mill/target-size.js';
export { lumberRecoveryFactor, overrun, overrunUnderEveryRule } from './mill/recovery.js';
export { bestEdging } from './mill/edger.js';
export { bestTrim } from './mill/trimmer.js';

export { scheduleFor, scheduleIds } from './kiln/schedule.js';
export { dryDimensions, gradeIsProvisional, ovenDryMoisture } from './kiln/moisture.js';
export { chargeRisk, degradeCost } from './kiln/degrade.js';
export { planCharges, schedulePiles } from './kiln/charge.js';
export { startRun, record, replay, runState, runTiming } from './kiln/run.js';

export { buildUnits, describeUnit } from './tally/unit.js';
export { byGrade, byThickness, recovery, againstTarget } from './tally/summary.js';

export { makePriceList, priceFor, listOn } from './price/list.js';
export { makeSeries, readingOn, valueOn, averageOver } from './price/series.js';
export { valueLog, valueLoad, compareTerms } from './price/value.js';

export { makeAgreement, rateFor } from './settle/stumpage.js';
export { makeRateCard, haulCharge, compareZones } from './settle/haul.js';
export { applyDeductions } from './settle/deductions.js';
export { makeSplit, divide, underwater, compareArrangements } from './settle/split.js';
export { settle, auditStatement } from './settle/statement.js';
export { rollUp, periodBySpecies } from './settle/period.js';

export { deckEntry, onDeck, deckSummary, oldest, daysOfInventory } from './inventory/deck.js';
export { degradeAfter, holdingCost, safeHoldingDays } from './inventory/degrade.js';

export { scaleTicketDocument, settlementDocument } from './report/documents.js';
export { reconcile, reconcileSeries } from './report/reconciliation.js';
export { studyDeck, studySummary, studyAssumptions } from './report/recovery-study.js';

export { makeLimits, runRules, capability } from './analysis/control.js';

export { openYard, Yard } from './store/repo.js';
export { openJournal } from './store/journal.js';

export { run as runCommandLine, VERSION } from './cli/program.js';
