export function toCentavos(value) {
  return Math.round((Number(value) || 0) * 100)
}

export function fromCentavos(cents) {
  return cents / 100
}

export function round2(value) {
  return fromCentavos(toCentavos(value))
}

export function sum(values) {
  return fromCentavos(values.reduce((total, value) => total + toCentavos(value), 0))
}

export function sameMoney(left, right) {
  return toCentavos(left) === toCentavos(right)
}

export function lineTotals(lines) {
  const debit = sum((lines || []).map((line) => line.debit))
  const credit = sum((lines || []).map((line) => line.credit))
  return {
    debit,
    credit,
    balanced: toCentavos(debit) === toCentavos(credit) && toCentavos(debit) > 0,
  }
}
