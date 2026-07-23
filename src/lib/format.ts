import type { Registrant, WebinarEvent } from "./store.js";

export function formatWebinarLine(w: WebinarEvent): string {
  return `${w.title}\n${w.date_time}`;
}

export function formatRegistrationSummary(reg: {
  name: string;
  email: string;
  phone: string;
}): string {
  return (
    `Name: ${reg.name}\n` +
    `Email: ${reg.email}\n` +
    `Phone: ${reg.phone}`
  );
}

export function formatMyRegistration(reg: Registrant, webinar: WebinarEvent): string {
  const status =
    reg.confirmation_status === "confirmed"
      ? "Confirmed"
      : reg.confirmation_status === "cancelled"
        ? "Cancelled"
        : "Pending";
  return (
    `Your registration for ${webinar.title}\n` +
    `${webinar.date_time}\n\n` +
    `${formatRegistrationSummary(reg)}\n` +
    `Status: ${status}`
  );
}

/** ForceReply markup with a helpful input placeholder. */
export function forceReply(placeholder: string) {
  return {
    force_reply: true as const,
    selective: true,
    input_field_placeholder: placeholder,
  };
}
