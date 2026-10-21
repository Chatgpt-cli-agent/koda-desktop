import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../../shared/i18n";
import { I18nProvider } from "../I18nProvider";
import { useI18n } from "../useI18n";
import LanguagePane from "./LanguagePane";

function TranslationProbe(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div data-testid="translation-probe">
      {t("common.save")} / {t("welcome.title")}
    </div>
  );
}

describe("Persian locale integration", () => {
  const setLocale = vi.fn().mockResolvedValue("fa");

  beforeEach(() => {
    localStorage.removeItem("hermes-locale");
    setSharedLocale("en");
    setLocale.mockClear();
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: { getLocale: vi.fn().mockResolvedValue("en"), setLocale },
    });
  });

  afterEach(() => {
    setSharedLocale("en");
    localStorage.removeItem("hermes-locale");
    document.documentElement.setAttribute("dir", "ltr");
    document.documentElement.setAttribute("lang", "en");
  });

  // @lat: [[rtl-chat#Persian locale#Language picker persistence and fallback]]
  it("offers Persian by its native name and switches direction, persistence and translated/fallback text", async () => {
    await act(async () => {
      render(
        <I18nProvider>
          <LanguagePane />
          <TranslationProbe />
        </I18nProvider>,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("option", { name: "فارسی" }));
    await waitFor(() => expect(setLocale).toHaveBeenLastCalledWith("fa"));
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(document.documentElement).toHaveAttribute("lang", "fa");
    expect(localStorage.getItem("hermes-locale")).toBe("fa");
    expect(screen.getByTestId("translation-probe")).toHaveTextContent(
      "ذخیره / Welcome to Koda",
    );
    fireEvent.click(screen.getByRole("button", { name: "فارسی" }));
    fireEvent.click(screen.getByRole("option", { name: "English" }));
    await waitFor(() => expect(setLocale).toHaveBeenLastCalledWith("en"));
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(document.documentElement).toHaveAttribute("lang", "en");
  });
});
