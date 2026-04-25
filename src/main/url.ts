import { OVERTHINK_HOME_URL } from "@/shared/branding";

const DEFAULT_SEARCH_URL = "https://www.bing.com/search?q=";

export const DEFAULT_HOME_URL = OVERTHINK_HOME_URL;

export function normalizeNavigationInput(input: string): string {
  const value = input.trim();

  if (!value) {
    return DEFAULT_HOME_URL;
  }

  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(value)) {
    return value;
  }

  if (/^localhost(:\d+)?(\/.*)?$/i.test(value) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(value)) {
    return `http://${value}`;
  }

  if (value.includes(".") && !/\s/.test(value)) {
    return `https://${value}`;
  }

  return `${DEFAULT_SEARCH_URL}${encodeURIComponent(value)}`;
}
