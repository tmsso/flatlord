import "server-only";
import { Resend } from "resend";
import { EXTERNAL_CALL_TIMEOUT_MS, withTimeout } from "@/lib/async/with-timeout";

type SendResult = Awaited<ReturnType<Resend["emails"]["send"]>>;

// Every notifier sends through this instead of `new Resend()` directly so
// a hung Resend call times out (B-50) and comes back in the SDK's own
// `{ error }` shape — the existing `if (sendError) console.error(...)`
// handling then covers it with no per-call-site changes.
export function createResendClient() {
  const resend = new Resend(process.env.RESEND_API_KEY);
  return {
    emails: {
      send: (...args: Parameters<Resend["emails"]["send"]>): Promise<SendResult> =>
        withTimeout(resend.emails.send(...args), EXTERNAL_CALL_TIMEOUT_MS, () => ({
          data: null,
          error: {
            name: "application_error",
            message: `timed out after ${EXTERNAL_CALL_TIMEOUT_MS} ms`,
            statusCode: null,
          },
          headers: null,
        })),
    },
  };
}
