import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import DeviceShell from "./DeviceShell.jsx";
import "./PhoneGate.css";

export const PHONE_NUMBER_STORAGE_KEY = "medaboutyou-phone-number";

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
  const inputRef = useRef(null);

  if (isRegistered) return children;

  const savePhoneNumber = () => {
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    if (!isValidPhoneNumber(normalizedPhoneNumber)) {
      setError(t("phoneSetup.invalid"));
      inputRef.current?.focus();
      return;
    }

    try {
      localStorage.setItem(PHONE_NUMBER_STORAGE_KEY, normalizedPhoneNumber);
      setIsRegistered(true);
    } catch {
      setError(t("phoneSetup.storageError"));
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== "SoftLeft") return;
    event.preventDefault();
    savePhoneNumber();
  };

  return (
    <DeviceShell
      title={t("phoneSetup.title")}
      left={t("phoneSetup.continue")}
      right=""
      onLeft={savePhoneNumber}
      onCenter={savePhoneNumber}
      centerLabel={t("phoneSetup.continue")}
      noRightLabel={t("common.noRightAction")}
      onKeyDown={handleKeyDown}
    >
      <form
        className="phone-setup"
        onSubmit={(event) => {
          event.preventDefault();
          savePhoneNumber();
        }}
      >
        <p className="prompt">{t("phoneSetup.prompt")}</p>
        <p className="helper">{t("phoneSetup.description")}</p>
        <label htmlFor="phone-number">{t("phoneSetup.label")}</label>
        <input
          ref={inputRef}
          id="phone-number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          value={phoneNumber}
          placeholder={t("phoneSetup.placeholder")}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "phone-number-error" : undefined}
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
      </form>
    </DeviceShell>
  );
}
