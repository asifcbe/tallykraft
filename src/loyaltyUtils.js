// Points a bill earns. Always computed on the bill amount BEFORE any points
// are redeemed, so redeeming this bill's own points doesn't shrink what it
// earns (and the maths stays non-circular).
export const pointsEarnedOn = (amount, loyalty = {}) => {
  const pointsPerRupee = Number(loyalty.pointsPerRupee) || 0;
  const earnEveryRupees = Number(loyalty.earnEveryRupees) || 1;
  return Math.max(0, Math.floor((Number(amount) / earnEveryRupees) * pointsPerRupee));
};

// Balance after a sale: old balance + points earned on this bill − points
// redeemed on this bill (which may include the points this bill just earned).
export const loyaltyBalanceAfter = (prevPoints, earned, redeemed) =>
  Math.max(0, (Number(prevPoints) || 0) + (Number(earned) || 0) - (Number(redeemed) || 0));
