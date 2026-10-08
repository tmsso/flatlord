import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, isLocale, localeCookieName } from "./config";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    // Explicit, not inherited from the server: Vercel runs in UTC, so
    // without this every timestamp (notifications, requests, statement
    // history) rendered an hour or two off for users in Hungary. next-intl
    // passes this to the client provider too, so server and browser agree.
    // Per-property time zones would only matter for properties outside
    // Hungary — not a case today.
    timeZone: "Europe/Budapest",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
