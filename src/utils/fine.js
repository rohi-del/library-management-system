const LOAN_DAYS = 14;
const FINE_PER_DAY = 2; // rupees
const MAX_ACTIVE_ISSUES = 3;
const MS_PER_DAY = 86400000;

// Fine = FINE_PER_DAY for every full day after the due date.
function calcFine(dueDate, returnedAt = new Date()) {
  const due = new Date(dueDate);
  const ret = new Date(returnedAt);
  due.setHours(0, 0, 0, 0);
  ret.setHours(0, 0, 0, 0);
  const lateDays = Math.round((ret - due) / MS_PER_DAY);
  return lateDays > 0 ? lateDays * FINE_PER_DAY : 0;
}

module.exports = { calcFine, LOAN_DAYS, FINE_PER_DAY, MAX_ACTIVE_ISSUES };
