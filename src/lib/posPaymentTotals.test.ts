import { describe, it, expect } from "vitest";
import { POS_PAYMENT, sumByPaymentMethod } from "./posPaymentTotals";

const sales = [
  { payment_method: "كاش", total_amount: 100 },
  { payment_method: "فودافون كاش", total_amount: 250 },
  { payment_method: "فودافون كاش", total_amount: "50" },
  { payment_method: "انستا باي", total_amount: 70 },
  { payment_method: null, total_amount: 30 },
];

describe("sumByPaymentMethod", () => {
  it("counts Vodafone Cash sales separately from cash", () => {
    expect(sumByPaymentMethod(sales, POS_PAYMENT.vodafoneCash)).toBe(300);
  });

  it("does not count Vodafone Cash as cash in the drawer", () => {
    expect(sumByPaymentMethod(sales, POS_PAYMENT.cash, POS_PAYMENT.cash)).toBe(130);
  });
});
