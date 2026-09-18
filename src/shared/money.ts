// 金額一律以「分」（TWD 的 1/100）為整數單位存放，避免浮點誤差；顯示時才換回元。

export const MINOR_UNITS_PER_DOLLAR = 100;

export function dollars_to_cents(value: number): number {
  return Math.round(value * MINOR_UNITS_PER_DOLLAR);
}

export function cents_to_dollars(cents: number): number {
  return cents / MINOR_UNITS_PER_DOLLAR;
}

/** NT$ 90 或 NT$ 90.5（有零頭才顯示小數） */
export function format_cents(cents: number, currency = "NT$"): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / MINOR_UNITS_PER_DOLLAR);
  const remainder = abs % MINOR_UNITS_PER_DOLLAR;
  const body =
    remainder === 0
      ? whole.toLocaleString("en-US")
      : `${whole.toLocaleString("en-US")}.${String(remainder).padStart(2, "0").replace(/0$/, "")}`;
  return `${negative ? "-" : ""}${currency} ${body}`;
}

/**
 * 把金額平均分給 n 個人，且總和完全等於原金額。
 * 除不盡的餘數逐一分給前面的人，不讓誤差沉沒。
 */
export function split_evenly(total_cents: number, people: number): number[] {
  if (people <= 0) {
    return [];
  }
  const base = Math.trunc(total_cents / people);
  let remainder = total_cents - base * people;
  const step = remainder >= 0 ? 1 : -1;
  const shares = new Array<number>(people).fill(base);
  for (let index = 0; remainder !== 0; index = (index + 1) % people) {
    shares[index] = (shares[index] ?? 0) + step;
    remainder -= step;
  }
  return shares;
}

/** 由字串解析價格；接受「90」「$90」「90元」「NT$90」「1,200」。 */
export function parse_price_to_cents(raw: string): number | undefined {
  const cleaned = raw
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[,\s]/g, "")
    .replace(/(nt\$|nt|\$|元|圓|塊)/gi, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) {
    return undefined;
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
    return undefined;
  }
  return dollars_to_cents(value);
}
