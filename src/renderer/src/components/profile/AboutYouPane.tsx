import { useState, useRef, useEffect } from "react";
import { useI18n } from "../useI18n";
import {
  useProfileEditorLifetime,
  type ProfileEditorScope,
} from "../../hooks/useProfileEditorLifetime";

/**
 * "About you" — the owner's own details.
 *
 * The engine keeps two different files and they answer to different people:
 * `SOUL.md` is who the *assistant* is, and `memories/USER.md` is who *you*
 * are. The engine injects the second into every prompt, but it was only
 * reachable through the agent's memory tab, where it was easy to miss. This
 * pane is the owner's own surface for it.
 */

interface AboutYouPaneProps extends ProfileEditorScope {
  /** Current contents of `memories/USER.md`. */
  content: string;
  /** Engine-enforced size limit for the file. */
  charLimit: number;
  profile?: string;
  onRefresh: () => void;
  onMutationStart?: () => (() => void) | null;
}

export function AboutYouPane({
  content: initialContent,
  charLimit,
  profile,
  onRefresh,
  target,
  isCurrent,
  onMutationStart,
}: AboutYouPaneProps): React.JSX.Element {
  const { t } = useI18n();
  const live = useProfileEditorLifetime({ target, isCurrent });
  const writable = (): boolean => live() && target?.mode !== "remote";
  const [userContent, setUserContent] = useState(initialContent);
  const [userEditing, setUserEditing] = useState(false);
  const [userSaved, setUserSaved] = useState(false);
  const [error, setError] = useState("");

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  async function handleSave(): Promise<void> {
    if (!writable()) return;
    const finish = onMutationStart?.();
    if (onMutationStart && !finish) return;
    setError("");
    try {
      const result = await window.hermesAPI.writeUserProfile(
        userContent,
        profile,
        target,
      );
      if (!live()) return;
      if (result.success) {
        setUserEditing(false);
        setUserSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => {
          if (live()) setUserSaved(false);
        }, 2000);
        onRefresh();
      } else setError(result.error || t("agents.aboutYouSaveFailed"));
    } catch (reason) {
      if (live())
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      finish?.();
    }
  }

  return (
    <div className="memory-profile">
      <div className="memory-profile-header">
        <span className="memory-profile-hint">{t("agents.aboutYouHint")}</span>
        {userSaved && (
          <span
            style={{
              color: "var(--success)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {t("common.saved")}
          </span>
        )}
      </div>

      {error && (
        <div className="memory-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <textarea
        className="memory-profile-textarea"
        value={userContent}
        onChange={(e) => {
          setUserContent(e.target.value);
          setUserEditing(true);
        }}
        placeholder={t("agents.aboutYouPlaceholder")}
        rows={8}
        aria-label={t("agents.aboutYouTitle")}
      />
      <div className="memory-profile-footer">
        <span className="memory-entry-chars">
          {t("memory.chars", { count: userContent.length })} / {charLimit}{" "}
          {t("memory.chars", { count: 1 }).split(" ")[1]}
        </span>
        {userEditing && (
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            {t("agents.aboutYouSave")}
          </button>
        )}
      </div>
    </div>
  );
}

export default AboutYouPane;
