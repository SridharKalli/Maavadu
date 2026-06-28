// IST (India Standard Time = UTC+5:30) helpers.
//
// The naive `new Date().toISOString().split("T")[0]` returns the *UTC* date,
// which silently rolls over to "tomorrow" between 06:30 PM and 11:59 PM IST
// for any user whose device clock matches IST — that means a Chennai customer
// opening the app after 10:30 PM IST would suddenly see Friday's menu on
// Thursday night. We always compute against IST so deliveries stay aligned
// with the kitchen's clock no matter where the device thinks it is.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30

export function istDate(offsetDays = 0): Date {
  const nowUtcMs = Date.now();
  const ist = new Date(nowUtcMs + IST_OFFSET_MS);
  if (offsetDays) ist.setUTCDate(ist.getUTCDate() + offsetDays);
  return ist;
}

export function istDateStr(offsetDays = 0): string {
  // Pull the IST-shifted date in YYYY-MM-DD form. We use UTC getters because
  // we've already shifted the clock by +05:30 above.
  const d = istDate(offsetDays);
  return d.toISOString().split("T")[0];
}
