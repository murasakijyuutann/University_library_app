-- Phase 7.3: seed loan_policy rows so circulation is not hardcoded.
INSERT INTO "loan_policy" ("memberType", "loanDurationDays", "maxRenewals", "finePerDay", "gracePeriodDays", "maxFine")
VALUES
  ('UNDERGRAD', 14, 1, 0.50, 2, 25.00),
  ('GRADUATE', 28, 2, 0.50, 3, 40.00),
  ('FACULTY', 90, 3, 0.25, 7, 50.00),
  ('STAFF', 28, 2, 0.50, 3, 40.00)
ON CONFLICT ("memberType") DO NOTHING;
