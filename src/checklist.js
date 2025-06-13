/**
 * Collecting reasons.
 *
 * A dozen places in this program answer the same shape of question: does this
 * thing pass, and if not, why not. Every one of them had grown the same four
 * lines, and two of them had grown a variant that stopped at the first reason.
 * That variant is the bug: somebody with a lapsed certificate who is also not
 * endorsed on the rule needs to be told both, or they renew the certificate
 * and come back to the same refusal.
 *
 * A checklist collects every reason. It never short circuits, and there is no
 * way to make it.
 */

/** Starts a checklist. */
export function checklist() {
  const reasons = [];

  return {
    /** Records a reason when the condition does not hold. */
    require(condition, reason) {
      if (!condition) reasons.push(reason);
      return this;
    },

    /** Records a reason unconditionally. */
    add(reason) {
      if (reason) reasons.push(reason);
      return this;
    },

    /** Records every reason in a list. */
    addAll(list) {
      for (const reason of list ?? []) this.add(reason);
      return this;
    },

    /** True when nothing was recorded. */
    get ok() {
      return reasons.length === 0;
    },

    /** How many reasons were recorded. */
    get count() {
      return reasons.length;
    },

    /** The reasons, as a copy. */
    get reasons() {
      return reasons.slice();
    },

    /** The reasons joined for a message. */
    joined(separator = '; ') {
      return reasons.join(separator);
    },

    /**
     * The answer, under whatever name the caller's layer uses. The name is
     * passed in rather than fixed, because `meets`, `admissible` and `allowed`
     * all read better than a shared word would in their own module.
     */
    verdict(name = 'ok', extra = {}) {
      return { [name]: reasons.length === 0, reasons: reasons.slice(), ...extra };
    },
  };
}

/** A checklist that already holds some reasons. */
export function checklistOf(reasons) {
  const list = checklist();
  list.addAll(reasons);
  return list;
}
