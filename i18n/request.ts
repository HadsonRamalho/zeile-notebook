import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !["pt-br", "en"].includes(locale)) {
    locale = "pt-br";
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
