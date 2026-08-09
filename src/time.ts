const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function timeToMinutes(value: string): number {
  if (!TIME_PATTERN.test(value)) {
    throw new Error(`Invalid HH:mm value: ${value}`);
  }

  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

export function minutesInTimezone(now: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function isInsideActiveWindow(
  now: Date,
  timezone: string,
  activeStart: string,
  activeEnd: string,
): boolean {
  const current = minutesInTimezone(now, timezone);
  const start = timeToMinutes(activeStart);
  const end = timeToMinutes(activeEnd);

  if (start === end) {
    return true;
  }

  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

export function formatTimeInTimezone(timestamp: number, timezone: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}
