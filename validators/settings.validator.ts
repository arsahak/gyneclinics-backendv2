import { body, type ValidationChain } from "express-validator";
import { PAYOUT_SCHEDULES } from "../models/platformSetting.model";
import { REGION_IDS } from "../utils/regions";

/** PUT /settings/fees — super admin. Rates are fractions (0.2 = 20%). */
export const saveFeesRules: ValidationChain[] = [
  body("commissionRate").isFloat({ min: 0, max: 0.5 }).withMessage("Commission must be 0% to 50%").toFloat(),
  body("minWithdrawalGBP").isFloat({ min: 0, max: 1000 }).withMessage("Minimum withdrawal must be £0 to £1000").toFloat(),
  body("payoutSchedule").isIn(PAYOUT_SCHEDULES).withMessage("Payout schedule must be on_request or weekly"),
  body("regionMultipliers").optional().isObject().withMessage("Region prices must be an object"),
  body("regionMultipliers")
    .optional()
    .custom((value: Record<string, unknown>) => Object.keys(value).every((k) => (REGION_IDS as string[]).includes(k)))
    .withMessage(`Regions must be: ${REGION_IDS.join(", ")}`),
  ...REGION_IDS.map((id) =>
    body(`regionMultipliers.${id}`).optional().isFloat({ min: 0.05, max: 3 }).withMessage("A region's price must be 5% to 300% of the UK fee").toFloat()
  ),
  body("overrides").isArray({ max: 500 }).withMessage("Overrides must be a list"),
  body("overrides.*.doctorId").isMongoId().withMessage("Invalid doctor id"),
  body("overrides.*.rate").isFloat({ min: 0, max: 0.5 }).withMessage("A doctor's commission must be 0% to 50%").toFloat(),
  body("overrides.*.note").optional().isString().isLength({ max: 200 }).withMessage("Note is too long (200 characters)"),
];
