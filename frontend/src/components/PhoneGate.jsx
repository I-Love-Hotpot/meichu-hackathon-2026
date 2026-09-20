import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PHONE_NUMBER_STORAGE_KEY } from "../constants/storage.js";
import { FocusableField } from "./Controls.jsx";
import DeviceShell from "./DeviceShell.jsx";
import "./PhoneGate.css";

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
  const { t } = useTranslation();
  const [isRegistered, setIsRegistered] = useState(
    () => Boolean(readStoredPhoneNumber()),
  );
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);
  const shellRef = useRef(null);

  useEffect(() => {
    if (!isRegistered && !isEditing) shellRef.current?.focus();
  }, [isRegistered, isEditing]);

  if (isRegistered) return children;

  const toggleInputMode = () => setIsEditing((editing) => !editing);
  const exitApp = () => window.history.back();

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
      exitApp();
      return;
    }
    if (event.key === "Escape" || event.key === "SoftLeft") {
      event.preventDefault();
      savePhoneNumber();
      return;
    }
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === "Enter" && event.target instanceof HTMLButtonElement)
      return;
    if (event.key === "Enter" || /^[0oO]$/.test(event.key)) {
      event.preventDefault();
      toggleInputMode();
    }
  };

  return (
    <DeviceShell
      title={t("phoneSetup.title")}
      left={t("phoneSetup.continue")}
      right={t("common.exit")}
      onLeft={savePhoneNumber}
      onCenter={toggleInputMode}
      onCenterPointerDown={(event) => {
        // Keep input focus until the click toggles editing off.
        if (isEditing) event.preventDefault();
      }}
      centerLabel={t(isEditing ? "common.finish" : "common.select")}
      onRight={exitApp}
      onKeyDown={handleKeyDown}
      screenRef={shellRef}
    >
      <form
        className="manual-form phone-setup"
        onSubmit={(event) => {
          event.preventDefault();
          savePhoneNumber();
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
          selected
          editing={isEditing}
          value={phoneNumber}
          placeholder={t("phoneSetup.placeholder")}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "phone-number-error" : "phone-number-help"}
          onSelect={() => setIsEditing(true)}
          onEditingChange={setIsEditing}
          onChange={(event) => {
            setPhoneNumber(event.target.value);
            if (error) setError("");
          }}
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
    </DeviceShell>
  );
}
