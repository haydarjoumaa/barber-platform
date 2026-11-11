import type { MessageKey } from "./messages";

/** Two-step reschedule form state shared by the staff and client apps. */
export interface RescheduleState {
  error?: MessageKey;
  success?: boolean;
  /** Shop-local date the open starts were found for. */
  date?: string;
  /** UTC epoch milliseconds; the server revalidates the chosen start before moving. */
  starts?: number[];
  /** New start after a successful move. */
  startsAt?: string;
  deadlinePassed?: boolean;
}
