import { Setting } from "../models/Setting.js";

export async function getFxRate() {
  const s = await Setting.findOne({ key: "global" }).lean();
  return s?.fxRateNGNUSD || 0.001; // sensible default
}

export function calcUSD(ngn, fxRate, override) {
  if (override !== undefined && override !== null) return Number(override) || 0;
  return Math.round((Number(ngn || 0) * fxRate + Number.EPSILON) * 100) / 100;
}

export async function attachUSDFields(product) {
  const fx = await getFxRate();
  const price = product.price || {};

  const out = {
    ...product,
    price: {
      ...price,
      monthlyUSD: calcUSD(price.monthlyNGN, fx, price.monthlyUSD),
      yearlyUSD: calcUSD(price.yearlyNGN, fx, price.yearlyUSD),
      installUSD: calcUSD(price.installNGN, fx, price.installUSD),
    },
    fxRateNGNUSD: fx,
  };
  return out;
}

export async function attachUSDList(items) {
  const fx = await getFxRate();
  return items.map((p) => {
    const price = p.price || {};
    return {
      ...p,
      price: {
        ...price,
        monthlyUSD: calcUSD(price.monthlyNGN, fx, price.monthlyUSD),
        yearlyUSD: calcUSD(price.yearlyNGN, fx, price.yearlyUSD),
        installUSD: calcUSD(price.installNGN, fx, price.installUSD),
      },
      fxRateNGNUSD: fx,
    };
  });
}
