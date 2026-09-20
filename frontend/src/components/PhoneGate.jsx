import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PHONE_NUMBER_STORAGE_KEY } from "../constants/storage.js";
import { FocusableField, ListRow } from "./Controls.jsx";
import DeviceShell from "./DeviceShell.jsx";
import "./PhoneGate.css";

const PHONE_PAGE = "phone";
const LANGUAGE_PAGE = "language";
const LANGUAGE_CODES = ["zh-TW", "en-US"];

const readStoredPhoneNumber = () => {
  try {
    return localStorage.getItem(PHONE_NUMBER_STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
};

const normalizePhoneNumber = (value) =>
  value.trim().replace(/[\s()-]/g, "");

const isValidPhoneNumber = (value) =>
  /^(?:\+[1-9]\d{7,14}|0\d{8,14})$/.test(value);

export default function PhoneGate({ children }) {
  const { t, i18n } = useTranslation();
  const [isRegistered, setIsRegistered] = useState(
    () => Boolean(readStoredPhoneNumber()),
  );
  const [page, setPage] = useState(PHONE_PAGE);
  const [focus, setFocus] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);
  const shellRef = useRef(null);
  const currentLanguage = i18n.resolvedLanguage || i18n.language;
  const isLanguagePage = page === LANGUAGE_PAGE;
  const languages = [
    { code: "zh-TW", label: t("language.zhTW") },
    { code: "en-US", label: t("language.enUS") },
  ];

  useEffect(() => {
    if (!isRegistered && !isEditing) shellRef.current?.focus();
  }, [focus, isRegistered, isEditing, page]);

  useEffect(() => {
    if (isEditing) return undefined;
    const frame = window.requestAnimationFrame(() => {
      shellRef.current
        ?.querySelector('[aria-current="true"]')
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focus, isEditing, page]);

  if (isRegistered) return children;

  const exitApp = () => window.history.back();

  const openLanguagePage = () => {
    setIsEditing(false);
    setPage(LANGUAGE_PAGE);
    const languageIndex = LANGUAGE_CODES.indexOf(currentLanguage);
    setFocus(languageIndex >= 0 ? languageIndex : 0);
  };

  const returnToPhonePage = () => {
    setIsEditing(false);
    setPage(PHONE_PAGE);
    setFocus(1);
  };

  const handleRight = () => {
    if (isLanguagePage) {
      returnToPhonePage();
      return;
    }
    exitApp();
  };

  const selectLanguage = (index = focus) => {
    const language = languages[index];
    if (!language) return;
    i18n.changeLanguage(language.code);
    setFocus(index);
  };

  const handleSelection = () => {
    if (isLanguagePage) {
      selectLanguage();
      return;
    }
    if (focus === 1) {
      openLanguagePage();
      return;
    }
    setIsEditing((editing) => !editing);
  };

  const handleLeft = () => {
    if (isLanguagePage) {
      selectLanguage();
      return;
    }
    if (focus === 1) {
      openLanguagePage();
      return;
    }
    savePhoneNumber();
  };

  const moveFocus = (direction) => {
    const count = isLanguagePage ? languages.length : 2;
    setIsEditing(false);
    setFocus((current) => (current + direction + count) % count);
  };

  const savePhoneNumber = () => {
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    if (!isValidPhoneNumber(normalizedPhoneNumber)) {
      setError(t("phoneSetup.invalid"));
      setIsEditing(true);
      inputRef.current?.focus();
      return;
    }

    try {
      localStorage.setItem(PHONE_NUMBER_STORAGE_KEY, normalizedPhoneNumber);
      setIsRegistered(true);
    } catch {
      setError(t("phoneSetup.storageError"));
      setIsEditing(true);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (event) => {
    if (event.nativeEvent?.isComposing || event.keyCode === 229) return;
    const isRightSoftKey =
      event.code === "ShiftRight" || event.key === "SoftRight";
    if (isRightSoftKey) {
      event.preventDefault();
      handleRight();
      return;
    }
    if (event.key === "Escape" || event.key === "SoftLeft") {
      event.preventDefault();
      handleLeft();
      return;
    }
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === "Enter" && event.target instanceof HTMLButtonElement)
      return;
    if (isLanguagePage && /^[12]$/.test(event.key)) {
      event.preventDefault();
      selectLanguage(Number(event.key) - 1);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (event.key === "Enter" || /^[0oO]$/.test(event.key)) {
      event.preventDefault();
      handleSelection();
    }
  };

  return (
    <DeviceShell
      title={t(isLanguagePage ? "language.title" : "phoneSetup.title")}
      left={t(
        isLanguagePage || focus === 1
          ? "common.select"
          : "phoneSetup.continue",
      )}
      right={t(isLanguagePage ? "common.back" : "common.exit")}
      onLeft={handleLeft}
      onCenter={handleSelection}
      onCenterPointerDown={(event) => {
        // Keep input focus until the click toggles editing off.
        if (!isLanguagePage && focus === 0 && isEditing)
          event.preventDefault();
      }}
      centerLabel={t(isEditing ? "common.finish" : "common.select")}
      onRight={handleRight}
      onKeyDown={handleKeyDown}
      screenRef={shellRef}
    >
      {isLanguagePage ? (
        <div className="phone-language-page">
          <p className="prompt">{t("language.prompt")}</p>
          {languages.map((language, index) => (
            <ListRow
              key={language.code}
              label={`${index + 1}  ${language.label}`}
              trailing={currentLanguage === language.code ? "✓" : "›"}
              selected={focus === index}
              onClick={() => selectLanguage(index)}
            />
          ))}
          <p className="helper">
            {t("language.current", {
              language:
                currentLanguage === "zh-TW"
                  ? t("language.zhTW")
                  : t("language.enUS"),
            })}
          </p>
        </div>
      ) : (
        <form
          className="manual-form phone-setup"
          onSubmit={(event) => {
            event.preventDefault();
            if (focus === 0) savePhoneNumber();
          }}
        >
          <p className="prompt">{t("phoneSetup.prompt")}</p>
          <FocusableField
            inputRef={inputRef}
            id="phone-number"
            label={t("phoneSetup.label")}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            selected={focus === 0}
            editing={focus === 0 && isEditing}
            value={phoneNumber}
            placeholder={t("phoneSetup.placeholder")}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? "phone-number-error" : "phone-number-help"
            }
            onSelect={() => {
              setFocus(0);
              setIsEditing(true);
            }}
            onEditingChange={setIsEditing}
            onChange={(event) => {
              setPhoneNumber(event.target.value);
              if (error) setError("");
            }}
          />
          <ListRow
            label={t("home.language")}
            selected={focus === 1}
            onClick={openLanguagePage}
          />
          {error && (
            <p
              id="phone-number-error"
              className="helper input-error"
              role="alert"
            >
              {error}
            </p>
          )}
          <p id="phone-number-help" className="helper">
            {t("phoneSetup.description")}
          </p>
        </form>
      )}
    </DeviceShell>
  );
}
