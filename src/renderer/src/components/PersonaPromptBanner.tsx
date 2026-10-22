import { useContext, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "./useI18n";
import { ProfileModalContext } from "./profile/ProfileModalContext";
import { isDefaultPersona } from "../../../shared/koda-persona";

/**
 * "Make it yours" banner.
 *
 * The assistant's persona is the app's own idea of who the assistant is.
 * When it is still the stock one, the user has never customized it — and the
 * app has no other place that offers the change. This banner offers it once,
 * at the top of the chat, and opens the agent's Persona tab directly.
 *
 * The banner is gone for good once the persona is written, and a dismissal
 * is remembered so it never nags.
 */

const DISMISS_STORAGE_KEY = "hermes-persona-prompt-dismissed";

interface PersonaPromptBannerProps {
  /** Active profile whose persona is inspected. */
  profile?: string;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, "1");
  } catch {
    // localStorage can be unavailable in some sandboxed renderers.
  }
}

export function PersonaPromptBanner({
  profile,
}: PersonaPromptBannerProps): React.JSX.Element | null {
  const { t } = useI18n();
  // The banner offers a jump into the agent's persona editor, so it needs
  // the profile modal. It is read defensively: without the provider there is
  // nothing to open, and a banner that cannot act is not worth showing.
  const modal = useContext(ProfileModalContext);
  const [untouched, setUntouched] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    let cancelled = false;
    const readSoul = window.hermesAPI?.readSoul;
    if (typeof readSoul !== "function") return;
    void readSoul(profile)
      .then((soul) => {
        if (!cancelled) setUntouched(isDefaultPersona(soul));
      })
      .catch(() => {
        // Best effort — no banner if the persona cannot be read.
      });
    return (): void => {
      cancelled = true;
    };
  }, [profile]);

  if (!untouched || dismissed || !modal) return null;

  return (
    <div
      className="persona-prompt-banner"
      role="status"
      data-testid="persona-prompt-banner"
    >
      <span className="persona-prompt-text">{t("soul.promptBanner")}</span>
      <div className="persona-prompt-actions">
        <button
          className="persona-prompt-link"
          type="button"
          onClick={() => {
            setUntouched(false);
            modal.openProfile(profile || "default", {
              initialSection: "persona",
            });
          }}
        >
          {t("soul.promptCustomize")}
        </button>
        <button
          className="persona-prompt-dismiss"
          type="button"
          aria-label={t("common.dismiss")}
          onClick={() => {
            rememberDismissed();
            setDismissed(true);
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export default PersonaPromptBanner;
