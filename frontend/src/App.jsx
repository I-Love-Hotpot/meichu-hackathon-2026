import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import DeviceShell from "./components/DeviceShell.jsx";
import MedicineChat from "./components/MedicineChat.jsx";
import MedicineMatchDeck from "./components/MedicineMatchDeck.jsx";
import {
  Decision,
  FeedbackCard,
  FocusableField,
  ListRow,
  MedicineRow,
  QuantityPicker,
} from "./components/Controls.jsx";
import {
  historyDays,
  medicineCandidates,
  medicines,
  todayDoses as initialDoses,
} from "./data/fixtures.js";
import "./app.css";

const SCREEN = {
  HOME: "home",
  ADD_METHOD: "add-method",
  UPLOAD: "upload",
  MANUAL: "manual",
  RECOGNIZING: "recognizing",
  MATCHES: "matches",
  DAILY: "daily",
  REMINDER_SETUP: "reminder-setup",
  ADD_COMPLETE: "add-complete",
  REMINDER_ALERT: "reminder-alert",
  RECORD_TODAY: "record-today",
  RECORD_COMPLETE: "record-complete",
  HISTORY: "history",
  HISTORY_DETAIL: "history-detail",
  UPDATE_RECORD: "update-record",
  QUANTITY: "quantity",
  MEDICINES: "medicines",
  MEDICINE_DETAIL: "medicine-detail",
  EDIT_DIRECTIONS: "edit-directions",
  EDIT_REMINDERS: "edit-reminders",
  CUSTOM_REMINDER: "custom-reminder",
  ARCHIVED_MEDICINES: "archived-medicines",
  DELETE_MEDICINE: "delete-medicine",
  EMERGENCY: "emergency",
  MEDICATION_EMERGENCY: "medication-emergency",
  FIRST_AID: "first-aid",
  FIRST_AID_WOUND: "first-aid-wound",
  FIRST_AID_PREGNANCY: "first-aid-pregnancy",
  CPR_GUIDE: "cpr-guide",
  MEDICINE_CHAT: "medicine-chat",
  LANGUAGE: "language",
};

const HISTORY_KEY = "medaboutyou";
const SCREEN_VALUES = new Set(Object.values(SCREEN));
const LANGUAGE_CODES = ["zh-TW", "en-US"];
const CPR_STEP_COUNT = 6;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const getDefaultFocusForScreen = (screen, currentLanguage) => {
  if (screen !== SCREEN.LANGUAGE) return 0;
  const languageIndex = LANGUAGE_CODES.findIndex(
    (code) => code === currentLanguage,
  );
  return languageIndex >= 0 ? languageIndex : 0;
};

function useStoredDoses() {
  const [doses, setDoses] = useState(() => {
    try {
      const saved = localStorage.getItem("medaboutyou-today-doses");
      const parsed = saved ? JSON.parse(saved) : null;
      const isCurrentSchema =
        Array.isArray(parsed) &&
        parsed.every((dose) => dose.medicineId && dose.time && dose.unit);
      return isCurrentSchema ? parsed : initialDoses;
    } catch {
      return initialDoses;
    }
  });

  useEffect(() => {
    localStorage.setItem("medaboutyou-today-doses", JSON.stringify(doses));
  }, [doses]);

  return [doses, setDoses];
}

function useStoredUserMedicines() {
  const [userMedicines, setUserMedicines] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("medaboutyou-user-medicines") || "[]",
      );
      if (!Array.isArray(saved)) return [];
      return saved
        .filter((medicine) => medicine.id && medicine.customName)
        .map(({ customDescription, ...medicine }) => ({
          ...medicine,
          customDirections:
            medicine.customDirections ?? customDescription ?? "",
        }));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(
      "medaboutyou-user-medicines",
      JSON.stringify(userMedicines),
    );
  }, [userMedicines]);

  return [userMedicines, setUserMedicines];
}

function useStoredMedicineSettings() {
  const [medicineSettings, setMedicineSettings] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("medaboutyou-medicine-settings") || "{}",
      );
      return saved && typeof saved === "object" && !Array.isArray(saved)
        ? saved
        : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(
      "medaboutyou-medicine-settings",
      JSON.stringify(medicineSettings),
    );
  }, [medicineSettings]);

  return [medicineSettings, setMedicineSettings];
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [screen, setScreen] = useState(SCREEN.HOME);
  const [focus, setFocus] = useState(0);
  const [decision, setDecision] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [manualName, setManualName] = useState("");
  const [manualDirections, setManualDirections] = useState("");
  const [manualEntryMode, setManualEntryMode] = useState("search");
  const [manualEditingField, setManualEditingField] = useState(null);
  const [savedManualMedicine, setSavedManualMedicine] = useState(null);
  const [selectedReminderTimes, setSelectedReminderTimes] = useState([]);
  const [editDirections, setEditDirections] = useState("");
  const [customReminderTime, setCustomReminderTime] = useState("");
  const [reminderReturnScreen, setReminderReturnScreen] = useState(
    SCREEN.REMINDER_SETUP,
  );
  const [reminderInputError, setReminderInputError] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState(medicines[0]);
  const [selectedCandidate, setSelectedCandidate] = useState(
    medicineCandidates[0],
  );
  const [uploadedName, setUploadedName] = useState("");
  const [cprStep, setCprStep] = useState(0);
  const [doses, setDoses] = useStoredDoses();
  const [userMedicines, setUserMedicines] = useStoredUserMedicines();
  const [medicineSettings, setMedicineSettings] = useStoredMedicineSettings();
  const fileInputRef = useRef(null);
  const shellRef = useRef(null);
  const matchScrollRef = useRef(null);
  const quantityBufferRef = useRef("");
  const quantityTimerRef = useRef(null);
  const pendingResetRef = useRef(null);

  const currentLanguage = i18n.resolvedLanguage || i18n.language;
  const currentLanguageRef = useRef(currentLanguage);
  currentLanguageRef.current = currentLanguage;
  const allMedicines = [...medicines, ...userMedicines];
  const medicineName = (medicineOrId) => {
    const medicine =
      typeof medicineOrId === "string"
        ? allMedicines.find((item) => item.id === medicineOrId)
        : medicineOrId;
    return (
      medicine?.customName ||
      t(`medicines.${medicine?.id || medicineOrId}.name`)
    );
  };
  const medicineSchedule = (medicine) =>
    medicine.customDirections ||
    (medicine.isCustom
      ? t("medicines.manualEntry")
      : t(`medicines.${medicine.id}.schedule`));
  const medicineUsage = (id) => t(`medicines.${id}.usage`);
  const medicineDirections = (medicine) => {
    if (medicine.isCustom) return medicine.customDirections || "";
    return (
      medicineSettings[medicine.id]?.directions ?? medicineUsage(medicine.id)
    );
  };
  const medicineReminders = (medicine) =>
    medicine.isCustom
      ? medicine.reminders || []
      : (medicineSettings[medicine.id]?.reminders ?? medicine.reminders ?? []);
  const isMedicineArchived = (medicine) =>
    medicine.isCustom
      ? Boolean(medicine.archived)
      : Boolean(medicineSettings[medicine.id]?.archived);
  const isMedicineDeleted = (medicine) =>
    !medicine.isCustom && Boolean(medicineSettings[medicine.id]?.deleted);
  const activeMedicines = allMedicines.filter(
    (medicine) => !isMedicineArchived(medicine) && !isMedicineDeleted(medicine),
  );
  const archivedMedicines = allMedicines.filter(
    (medicine) => isMedicineArchived(medicine) && !isMedicineDeleted(medicine),
  );
  const reminderOptions = [
    ...new Set([
      ...activeMedicines.flatMap(medicineReminders),
      ...selectedReminderTimes,
    ]),
  ].sort();
  const doseDetail = ({ time, amount, unit }) =>
    t("dose.detail", {
      time,
      amount,
      unit: t(`dose.${unit}`),
    });
  const quantityLabels = {
    valueLabel: t("dose.quantityValue", { value: quantity.toFixed(1) }),
    decreaseLabel: t("dose.decrease"),
    increaseLabel: t("dose.increase"),
  };
  const localizedCandidates = medicineCandidates.map((candidate) => {
    const name = t(`candidates.${candidate.id}`);
    return {
      ...candidate,
      name,
      genericName: t(`candidateDetails.${candidate.id}.genericName`),
      primaryEffect: t(`candidateDetails.${candidate.id}.primaryEffect`),
      sideEffects: t(`candidateDetails.${candidate.id}.sideEffects`),
      indications: t(`candidateDetails.${candidate.id}.indications`),
      imageAlt: t("matchCard.imageAlt", { name }),
    };
  });

  const persistCurrentFocus = (value = focus) => {
    const entry = window.history.state;
    if (!entry?.[HISTORY_KEY] || entry.screen !== screen) return;
    window.history.replaceState({ ...entry, focus: value }, "");
  };

  const navigate = (next, fromFocus = focus) => {
    persistCurrentFocus(fromFocus);
    const depth = Number(window.history.state?.depth || 0) + 1;
    const nextFocus = getDefaultFocusForScreen(next, currentLanguage);
    window.history.pushState(
      { [HISTORY_KEY]: true, screen: next, depth, focus: nextFocus },
      "",
    );
    setScreen(next);
    setFocus(nextFocus);
  };

  const replace = useCallback(
    (next) => {
      const depth = Number(window.history.state?.depth || 0);
      const nextFocus = getDefaultFocusForScreen(next, currentLanguage);
      window.history.replaceState(
        { [HISTORY_KEY]: true, screen: next, depth, focus: nextFocus },
        "",
      );
      setScreen(next);
      setFocus(nextFocus);
    },
    [currentLanguage],
  );

  const resetFlow = (next) => {
    const depth = Number(window.history.state?.depth || 0);
    if (depth === 0) {
      navigate(next);
      return;
    }
    pendingResetRef.current = next;
    window.history.go(-depth);
  };

  const goBack = () => {
    window.history.back();
  };

  useEffect(() => {
    const entry = window.history.state;

    if (
      entry?.[HISTORY_KEY] &&
      SCREEN_VALUES.has(entry.screen) &&
      Number.isInteger(entry.depth)
    ) {
      setScreen(entry.screen);
      setFocus(
        Number.isInteger(entry.focus)
          ? entry.focus
          : getDefaultFocusForScreen(entry.screen, currentLanguageRef.current),
      );
    } else {
      window.history.replaceState(
        {
          [HISTORY_KEY]: true,
          screen: SCREEN.HOME,
          depth: 0,
          focus: getDefaultFocusForScreen(
            SCREEN.HOME,
            currentLanguageRef.current,
          ),
        },
        "",
      );
      setScreen(SCREEN.HOME);
      setFocus(
        getDefaultFocusForScreen(SCREEN.HOME, currentLanguageRef.current),
      );
    }

    const handlePopState = (event) => {
      if (!event.state?.[HISTORY_KEY] || !SCREEN_VALUES.has(event.state.screen))
        return;
      if (pendingResetRef.current && event.state.depth === 0) {
        const next = pendingResetRef.current;
        pendingResetRef.current = null;
        const nextFocus = getDefaultFocusForScreen(
          next,
          currentLanguageRef.current,
        );
        window.history.pushState(
          { [HISTORY_KEY]: true, screen: next, depth: 1, focus: nextFocus },
          "",
        );
        setScreen(next);
        setFocus(nextFocus);
        return;
      }
      setScreen(event.state.screen);
      setFocus(
        Number.isInteger(event.state.focus)
          ? event.state.focus
          : getDefaultFocusForScreen(
              event.state.screen,
              currentLanguageRef.current,
            ),
      );
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const entry = window.history.state;
    if (
      !entry?.[HISTORY_KEY] ||
      entry.screen !== screen ||
      entry.focus === focus
    )
      return;
    window.history.replaceState({ ...entry, focus }, "");
  }, [focus, screen]);

  useEffect(() => {
    shellRef.current?.focus();
    if (screen !== SCREEN.MANUAL) setManualEditingField(null);
    quantityBufferRef.current = "";
    window.clearTimeout(quantityTimerRef.current);
  }, [screen]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      shellRef.current
        ?.querySelector(".is-selected")
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focus, screen, userMedicines.length]);

  useEffect(() => {
    document.documentElement.lang = currentLanguage;
  }, [currentLanguage]);

  useEffect(() => () => window.clearTimeout(quantityTimerRef.current), []);

  useEffect(() => {
    if (screen !== SCREEN.RECOGNIZING) return undefined;
    const timer = window.setTimeout(() => {
      replace(SCREEN.MATCHES);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [replace, screen]);

  const adjustQuantity = (amount) => {
    quantityBufferRef.current = "";
    setQuantity((current) => clamp(current + amount, 0.5, 99.5));
  };

  const enterQuantityDigit = (key) => {
    const character = key === "*" ? "." : key;
    let next = quantityBufferRef.current;

    if (character === ".") {
      if (next.includes(".")) return;
      next = `${next || "0"}.`;
    } else {
      next = next === "0" ? character : `${next}${character}`;
    }

    next = next.slice(0, 4);
    const parsed = Number(next);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 99.5) {
      setQuantity(Math.round(parsed * 10) / 10);
    }

    quantityBufferRef.current = next;
    window.clearTimeout(quantityTimerRef.current);
    quantityTimerRef.current = window.setTimeout(() => {
      quantityBufferRef.current = "";
    }, 1200);
  };

  const scrollMatchCard = (direction) => {
    const element = matchScrollRef.current;
    if (!element) return;
    const distance = Math.max(36, Math.round(element.clientHeight * 0.65));
    element.scrollBy({ top: direction * distance, behavior: "smooth" });
  };

  const openManualEntry = (mode, fromFocus = focus) => {
    setManualName("");
    setManualDirections("");
    setManualEntryMode(mode);
    setManualEditingField(null);
    setSavedManualMedicine(null);
    setSelectedReminderTimes([]);
    setDecision(0);
    navigate(SCREEN.MANUAL, fromFocus);
  };

  const enterManualInputMode = (index = focus) => {
    const fieldIndex = clamp(index, 0, 1);
    setFocus(fieldIndex);
    setManualEditingField(fieldIndex);
  };

  const leaveManualInputMode = () => {
    setManualEditingField(null);
    window.requestAnimationFrame(() => shellRef.current?.focus());
  };

  const openPhotoUpload = (fromFocus = focus) => {
    setSavedManualMedicine(null);
    setSelectedReminderTimes([]);
    setDecision(0);
    navigate(SCREEN.UPLOAD, fromFocus);
  };

  const submitManualEntry = () => {
    const name = manualName.trim();
    if (!name) return;

    if (manualEntryMode === "search") {
      setSavedManualMedicine(null);
      navigate(SCREEN.RECOGNIZING);
      return;
    }

    const medicine = {
      id: `manual-${Date.now()}`,
      isCustom: true,
      customName: name,
      customDirections: manualDirections.trim(),
      reminders: [],
    };
    setUserMedicines((items) => [...items, medicine]);
    setSavedManualMedicine(medicine);
    setSelectedMedicine(medicine);
    resetFlow(SCREEN.ADD_COMPLETE);
  };

  const updateSavedManualMedicine = (updates) => {
    if (!savedManualMedicine) return;
    const medicine = { ...savedManualMedicine, ...updates };
    setSavedManualMedicine(medicine);
    setSelectedMedicine(medicine);
    setUserMedicines((items) =>
      items.map((item) => (item.id === medicine.id ? medicine : item)),
    );
  };

  const toggleReminder = (time) => {
    setSelectedReminderTimes((times) =>
      times.includes(time)
        ? times.filter((item) => item !== time)
        : [...times, time].sort(),
    );
  };

  const completeDailyChoice = () => {
    if (decision === 0) {
      navigate(SCREEN.REMINDER_SETUP);
      return;
    }
    setSelectedReminderTimes([]);
    updateSavedManualMedicine({ reminders: [] });
    resetFlow(SCREEN.ADD_COMPLETE);
  };

  const completeReminderSetup = () => {
    updateSavedManualMedicine({ reminders: selectedReminderTimes });
    resetFlow(SCREEN.ADD_COMPLETE);
  };

  const updateSelectedMedicine = (updates) => {
    if (selectedMedicine.isCustom) {
      const medicine = { ...selectedMedicine, ...updates };
      setSelectedMedicine(medicine);
      setSavedManualMedicine((current) =>
        current?.id === medicine.id ? medicine : current,
      );
      setUserMedicines((items) =>
        items.map((item) => (item.id === medicine.id ? medicine : item)),
      );
      return;
    }

    setMedicineSettings((settings) => ({
      ...settings,
      [selectedMedicine.id]: {
        ...settings[selectedMedicine.id],
        ...updates,
      },
    }));
  };

  const openDirectionsEditor = (fromFocus = focus) => {
    setEditDirections(medicineDirections(selectedMedicine));
    navigate(SCREEN.EDIT_DIRECTIONS, fromFocus);
  };

  const openRemindersEditor = (fromFocus = focus) => {
    setSelectedReminderTimes(medicineReminders(selectedMedicine));
    setReminderInputError(false);
    navigate(SCREEN.EDIT_REMINDERS, fromFocus);
  };

  const saveDirections = () => {
    updateSelectedMedicine({
      ...(selectedMedicine.isCustom
        ? { customDirections: editDirections.trim() }
        : { directions: editDirections.trim() }),
    });
    goBack();
  };

  const openCustomReminder = (returnScreen, fromFocus = focus) => {
    setCustomReminderTime("");
    setReminderInputError(false);
    setReminderReturnScreen(returnScreen);
    navigate(SCREEN.CUSTOM_REMINDER, fromFocus);
  };

  const saveReminders = () => {
    updateSelectedMedicine({ reminders: selectedReminderTimes });
    goBack();
  };

  const saveCustomReminder = () => {
    const match = customReminderTime.match(/^(\d{2}):(\d{2})$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      setReminderInputError(true);
      return;
    }
    setSelectedReminderTimes((times) =>
      [...new Set([...times, customReminderTime])].sort(),
    );
    setReminderInputError(false);
    goBack();
  };

  const archiveSelectedMedicine = () => {
    updateSelectedMedicine({ archived: !isMedicineArchived(selectedMedicine) });
    resetFlow(SCREEN.MEDICINES);
  };

  const openDeleteMedicine = (fromFocus = focus) => {
    setDecision(1);
    navigate(SCREEN.DELETE_MEDICINE, fromFocus);
  };

  const deleteSelectedMedicine = () => {
    if (selectedMedicine.isCustom) {
      setUserMedicines((items) =>
        items.filter((item) => item.id !== selectedMedicine.id),
      );
      setSavedManualMedicine((current) =>
        current?.id === selectedMedicine.id ? null : current,
      );
    } else {
      setMedicineSettings((settings) => ({
        ...settings,
        [selectedMedicine.id]: {
          ...settings[selectedMedicine.id],
          deleted: true,
          archived: false,
        },
      }));
    }
    resetFlow(SCREEN.MEDICINES);
  };

  const toggleDose = (index) => {
    setDoses((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, taken: !item.taken } : item,
      ),
    );
  };

  const homeItems = useMemo(
    () => [
      { label: t("home.recordToday"), target: SCREEN.RECORD_TODAY },
      { label: t("home.history"), target: SCREEN.HISTORY },
      { label: t("home.myMedicines"), target: SCREEN.MEDICINES },
      { label: t("home.emergency"), target: SCREEN.EMERGENCY, state: "danger" },
      { label: t("home.medicineQuestions"), target: SCREEN.MEDICINE_CHAT },
    ],
    [t],
  );

  const move = (delta, count) =>
    setFocus((current) => (current + delta + count) % count);

  const screenConfig = (() => {
    switch (screen) {
      case SCREEN.HOME:
        return {
          title: t("home.title"),
          left: t("common.select"),
          right: t("common.exit"),
          count: homeItems.length,
          onEnter: () => navigate(homeItems[focus].target),
          onNumber: (number) => {
            if (number === 9) {
              navigate(SCREEN.REMINDER_ALERT);
              return;
            }
            if (homeItems[number - 1])
              navigate(homeItems[number - 1].target, number - 1);
          },
          content: (
            <div className="dense-list">
              {homeItems.map((item, index) => (
                <ListRow
                  key={item.label}
                  label={`${index + 1}  ${item.label}`}
                  state={item.state}
                  selected={focus === index}
                  onClick={() => navigate(item.target, index)}
                />
              ))}
            </div>
          ),
        };

      case SCREEN.ADD_METHOD:
        return {
          title: t("add.title"),
          count: 2,
          left: t("common.select"),
          right: t("common.back"),
          onEnter: () => {
            if (focus === 0) openPhotoUpload();
            else openManualEntry("search");
          },
          onNumber: (number) => {
            if (number === 1) openPhotoUpload(0);
            if (number === 2) openManualEntry("search", 1);
          },
          content: (
            <>
              <p className="prompt">{t("add.chooseMethod")}</p>
              <ListRow
                label={`1  ${t("add.photo")}`}
                selected={focus === 0}
                onClick={() => openPhotoUpload(0)}
              />
              <ListRow
                label={`2  ${t("add.keyboard")}`}
                selected={focus === 1}
                onClick={() => openManualEntry("search", 1)}
              />
              <p className="helper">{t("add.navigationHelp")}</p>
            </>
          ),
        };

      case SCREEN.UPLOAD:
        return {
          title: t("add.uploadTitle"),
          count: 1,
          left: t("common.select"),
          right: t("common.back"),
          onEnter: () => fileInputRef.current?.click(),
          content: (
            <>
              <p className="prompt">{t("add.newPhoto")}</p>
              <ListRow
                label={t("add.photo")}
                selected
                onClick={() => fileInputRef.current?.click()}
              />
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const [file] = event.target.files;
                  if (!file) return;
                  setUploadedName(file.name);
                  navigate(SCREEN.RECOGNIZING);
                  event.target.value = "";
                }}
              />
              <p className="helper">
                {t("add.pickerHelp")}
                <br />
                {t("add.noPreview")}
              </p>
            </>
          ),
        };

      case SCREEN.MANUAL:
        return {
          title: t("add.manualTitle"),
          count: 2,
          left: t("common.confirm"),
          right: t("common.back"),
          onLeft: submitManualEntry,
          onEnter: () => {
            if (manualEditingField !== null) leaveManualInputMode();
            else enterManualInputMode();
          },
          onInputKey: () => {
            if (manualEditingField !== null) leaveManualInputMode();
            else enterManualInputMode();
          },
          content: (
            <form
              className="manual-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitManualEntry();
              }}
            >
              <FocusableField
                id="medicine-name"
                label={t("add.medicineName")}
                value={manualName}
                placeholder={t("add.medicinePlaceholder")}
                selected={focus === 0}
                editing={manualEditingField === 0}
                onChange={(event) => setManualName(event.target.value)}
                onSelect={() => setFocus(0)}
                onEditingChange={(editing) => {
                  if (editing) enterManualInputMode(0);
                  else if (manualEditingField === 0) leaveManualInputMode();
                }}
                required
              />
              <FocusableField
                id="medicine-directions"
                label={t("add.directions")}
                value={manualDirections}
                placeholder={t("add.directionsPlaceholder")}
                selected={focus === 1}
                editing={manualEditingField === 1}
                onChange={(event) => setManualDirections(event.target.value)}
                onSelect={() => setFocus(1)}
                onEditingChange={(editing) => {
                  if (editing) enterManualInputMode(1);
                  else if (manualEditingField === 1) leaveManualInputMode();
                }}
                multiline
              />
              <p className="helper">{t("add.manualContinueHelp")}</p>
            </form>
          ),
        };

      case SCREEN.RECOGNIZING:
        return {
          title: t("add.recognizingTitle"),
          count: 0,
          left: "",
          right: t("common.cancel"),
          content: (
            <div className="processing" aria-live="polite">
              <p className="prompt">{t("add.recognizing")}</p>
              <div className="progress" aria-label={t("add.recognizingTitle")}>
                <span />
              </div>
              <p className="helper">
                {uploadedName || manualName || t("add.recognizingHelp")}
              </p>
            </div>
          ),
        };

      case SCREEN.MATCHES: {
        const activateMatch = () => {
          const candidate = medicineCandidates[focus];
          if (candidate) {
            setSavedManualMedicine(null);
            setSelectedReminderTimes([]);
            setDecision(0);
            setSelectedCandidate(candidate);
            navigate(SCREEN.DAILY);
            return;
          }
          openManualEntry("direct");
        };

        return {
          title: t("add.matchesTitle"),
          count: medicineCandidates.length + 1,
          left: t("common.confirm"),
          right: t("common.back"),
          onEnter: activateMatch,
          onNumber: (number) => {
            if (number >= 1 && number <= medicineCandidates.length + 1)
              setFocus(number - 1);
          },
          onArrowLeft: () =>
            setFocus((current) =>
              clamp(current - 1, 0, medicineCandidates.length),
            ),
          onArrowRight: () =>
            setFocus((current) =>
              clamp(current + 1, 0, medicineCandidates.length),
            ),
          onArrowUp: () => scrollMatchCard(-1),
          onArrowDown: () => scrollMatchCard(1),
          content: (
            <MedicineMatchDeck
              candidates={localizedCandidates}
              index={focus}
              onChange={setFocus}
              onActivate={activateMatch}
              scrollRef={matchScrollRef}
              labels={{
                primaryEffect: t("matchCard.primaryEffect"),
                sideEffects: t("matchCard.sideEffects"),
                indications: t("matchCard.indications"),
                manualTitle: t("matchCard.manualTitle"),
                manualHelp: t("matchCard.manualHelp"),
              }}
            />
          ),
        };
      }

      case SCREEN.DAILY:
        return {
          title: t("add.dailyTitle"),
          count: 2,
          left: t("common.confirm"),
          right: t("common.back"),
          horizontal: true,
          onEnter: completeDailyChoice,
          content: (
            <>
              <p className="prompt">{t("add.dailyQuestion")}</p>
              <Decision
                selected={decision}
                left={t("add.yes")}
                right={t("add.no")}
                onSelect={setDecision}
                ariaLabel={t("common.select")}
              />
              <p className="helper">{t("add.binaryHelp")}</p>
            </>
          ),
        };

      case SCREEN.REMINDER_SETUP:
        return {
          title: t("add.reminderTitle"),
          count: reminderOptions.length + 1,
          left: t("common.finish"),
          right: t("common.back"),
          onLeft: completeReminderSetup,
          onEnter: () => {
            if (focus === reminderOptions.length)
              openCustomReminder(SCREEN.REMINDER_SETUP);
            else toggleReminder(reminderOptions[focus]);
          },
          onNumber: (number) => {
            if (number >= 1 && number <= reminderOptions.length + 1)
              setFocus(number - 1);
          },
          content: (
            <>
              <p className="prompt">{t("add.chooseReminder")}</p>
              <div className="reminder-list">
                {reminderOptions.map((time, index) => (
                  <ListRow
                    key={time}
                    label={`${index + 1}  ${time}`}
                    trailing={selectedReminderTimes.includes(time) ? "✓" : "○"}
                    selected={focus === index}
                    onClick={() => {
                      setFocus(index);
                      toggleReminder(time);
                    }}
                  />
                ))}
                <ListRow
                  label={`${reminderOptions.length + 1}  ${t("add.otherReminder")}`}
                  selected={focus === reminderOptions.length}
                  onClick={() =>
                    openCustomReminder(
                      SCREEN.REMINDER_SETUP,
                      reminderOptions.length,
                    )
                  }
                />
              </div>
              <p className="helper">{t("add.reminderHelp")}</p>
            </>
          ),
        };

      case SCREEN.CUSTOM_REMINDER:
        return {
          title: t("add.customReminderTitle"),
          count: 1,
          left: t("common.save"),
          right: t("common.back"),
          onEnter: saveCustomReminder,
          content: (
            <form
              className="manual-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveCustomReminder();
              }}
            >
              <label htmlFor="custom-reminder-time">
                {t("add.customReminderLabel")}
              </label>
              <input
                id="custom-reminder-time"
                type="time"
                value={customReminderTime}
                onChange={(event) => {
                  setCustomReminderTime(event.target.value);
                  setReminderInputError(false);
                }}
                aria-invalid={reminderInputError}
                required
                autoFocus
              />
              <p
                className={`helper${reminderInputError ? " input-error" : ""}`}
                aria-live="polite"
              >
                {reminderInputError
                  ? t("medicines.invalidReminders")
                  : t(
                      reminderReturnScreen === SCREEN.EDIT_REMINDERS
                        ? "medicines.customReminderHelp"
                        : "add.customReminderHelp",
                    )}
              </p>
            </form>
          ),
        };

      case SCREEN.ADD_COMPLETE:
        return {
          title: t("add.completeTitle"),
          count: 1,
          left: t("common.medicines"),
          right: t("common.back"),
          onEnter: () => replace(SCREEN.MEDICINES),
          content: (
            <>
              <FeedbackCard title={t("add.added")}>
                <span>
                  {savedManualMedicine?.customName ||
                    t(`candidates.${selectedCandidate.id}`)}
                </span>
                {savedManualMedicine?.customDirections && (
                  <small>{savedManualMedicine.customDirections}</small>
                )}
              </FeedbackCard>
              <p className="helper centered">
                {savedManualMedicine
                  ? savedManualMedicine.reminders.length > 0
                    ? t("add.remindersSaved", {
                        times: savedManualMedicine.reminders.join(" / "),
                      })
                    : t("add.noReminderSaved")
                  : t("add.nextReminder")}
              </p>
            </>
          ),
        };

      case SCREEN.REMINDER_ALERT:
        return {
          title: t("dose.reminderTitle"),
          date: "09/19",
          time: "08:00",
          count: 2,
          left: t("common.record"),
          right: t("common.later"),
          onEnter: () => resetFlow(SCREEN.RECORD_COMPLETE),
          content: (
            <>
              <MedicineRow
                medicine={medicineName("pressure")}
                detail={`1 ${t("dose.unitPill")} · ${medicineUsage("pressure")}`}
                selected={focus === 0}
              />
              <QuantityPicker
                value={quantity}
                selected={focus === 1}
                onChange={adjustQuantity}
                {...quantityLabels}
              />
              <p className="helper">{t("dose.enterToRecord")}</p>
            </>
          ),
        };

      case SCREEN.RECORD_TODAY:
        return {
          title: t("dose.recordTodayTitle"),
          date: "09/19",
          time: t("common.now"),
          count: doses.length,
          left: t("common.finish"),
          right: t("common.back"),
          onLeft: () => resetFlow(SCREEN.RECORD_COMPLETE),
          onEnter: () => toggleDose(focus),
          onNumber: (number) => {
            if (doses[number - 1]) {
              setFocus(number - 1);
              toggleDose(number - 1);
            }
          },
          content: doses.map((dose, index) => (
            <MedicineRow
              key={dose.id}
              medicine={`${index + 1}  ${medicineName(dose.medicineId)}`}
              detail={doseDetail(dose)}
              checked={dose.taken}
              selected={focus === index}
              onClick={() => {
                setFocus(index);
                toggleDose(index);
              }}
            />
          )),
        };

      case SCREEN.RECORD_COMPLETE:
        return {
          title: t("dose.completeTitle"),
          count: 1,
          left: t("common.mainMenu"),
          right: t("common.back"),
          onEnter: goBack,
          content: (
            <>
              <FeedbackCard title={t("dose.recorded")} />
              <p className="helper centered">
                {t("dose.progress", {
                  done: doses.filter((dose) => dose.taken).length,
                  total: doses.length,
                })}
              </p>
            </>
          ),
        };

      case SCREEN.HISTORY:
        return {
          title: t("history.title"),
          date: "09/19",
          time: "",
          count: historyDays.length,
          left: t("common.open"),
          right: t("common.back"),
          onEnter: () => navigate(SCREEN.HISTORY_DETAIL),
          onNumber: (number) => {
            if (historyDays[number - 1])
              navigate(SCREEN.HISTORY_DETAIL, number - 1);
          },
          content: historyDays.map((day, index) => (
            <ListRow
              key={day.id}
              label={`${index + 1}  ${t("history.dayLabel", {
                date: day.date,
                relative: t(`history.${day.relative}`),
                done: day.done,
                total: day.total,
              })}`}
              state={day.state}
              selected={focus === index}
              onClick={() => navigate(SCREEN.HISTORY_DETAIL, index)}
            />
          )),
        };

      case SCREEN.HISTORY_DETAIL:
        return {
          title: t("history.detailTitle"),
          count: 2,
          left: t("common.update"),
          right: t("common.back"),
          onLeft: () => navigate(SCREEN.UPDATE_RECORD),
          onEnter: () => navigate(SCREEN.UPDATE_RECORD),
          onNumber: (number) => {
            if (number >= 1 && number <= 2) setFocus(number - 1);
          },
          content: (
            <>
              <p className="prompt">2026/09/19</p>
              <MedicineRow
                medicine={`1  ${medicineName("pressure")}`}
                detail={doseDetail({
                  time: "08:05",
                  amount: 1,
                  unit: "unitPill",
                })}
                checked
                selected={focus === 0}
              />
              <MedicineRow
                medicine={`2  ${medicineName("vitamin-d")}`}
                detail={doseDetail({
                  time: "12:10",
                  amount: 1,
                  unit: "unitCapsule",
                })}
                checked
                selected={focus === 1}
              />
            </>
          ),
        };

      case SCREEN.UPDATE_RECORD:
        return {
          title: t("history.updateTitle"),
          count: 2,
          left: t("common.save"),
          right: t("common.back"),
          horizontal: true,
          onEnter: () =>
            navigate(decision === 0 ? SCREEN.QUANTITY : SCREEN.HISTORY_DETAIL),
          content: (
            <>
              <MedicineRow
                medicine={medicineName("vitamin-d")}
                detail={doseDetail({
                  time: "12:10",
                  amount: 1,
                  unit: "unitCapsule",
                })}
                checked
                selected
              />
              <p className="prompt">{t("history.changeQuantity")}</p>
              <Decision
                selected={decision}
                left={t("add.yes")}
                right={t("add.no")}
                onSelect={setDecision}
                ariaLabel={t("common.select")}
              />
            </>
          ),
        };

      case SCREEN.QUANTITY:
        return {
          title: t("dose.quantityTitle"),
          count: 1,
          left: t("common.save"),
          right: t("common.back"),
          horizontal: true,
          onEnter: () => replace(SCREEN.HISTORY_DETAIL),
          content: (
            <>
              <p className="prompt">{t("dose.quantityPrompt")}</p>
              <QuantityPicker
                value={quantity}
                onChange={adjustQuantity}
                {...quantityLabels}
              />
              <p className="helper">{t("dose.quantityHelp")}</p>
            </>
          ),
        };

      case SCREEN.MEDICINES: {
        const archivedIndex = activeMedicines.length;
        const addIndex = archivedIndex + (archivedMedicines.length ? 1 : 0);
        const activateMedicineMenu = (index) => {
          if (archivedMedicines.length && index === archivedIndex) {
            navigate(SCREEN.ARCHIVED_MEDICINES, index);
            return;
          }
          if (index === addIndex) {
            navigate(SCREEN.ADD_METHOD, index);
            return;
          }
          const medicine = activeMedicines[index];
          if (!medicine) return;
          setSelectedMedicine(medicine);
          navigate(SCREEN.MEDICINE_DETAIL, index);
        };

        return {
          title: t("medicines.title"),
          count: addIndex + 1,
          left: t("common.open"),
          right: t("common.back"),
          onEnter: () => activateMedicineMenu(focus),
          onNumber: (number) => activateMedicineMenu(number - 1),
          content: (
            <div className="medicine-list">
              {activeMedicines.map((medicine, index) => (
                <MedicineRow
                  key={medicine.id}
                  medicine={`${index + 1}  ${medicineName(medicine.id)}`}
                  detail={medicineSchedule(medicine)}
                  selected={focus === index}
                  onClick={() => activateMedicineMenu(index)}
                />
              ))}
              {archivedMedicines.length > 0 && (
                <ListRow
                  label={`${archivedIndex + 1}  ${t("medicines.archived", { count: archivedMedicines.length })}`}
                  selected={focus === archivedIndex}
                  onClick={() => activateMedicineMenu(archivedIndex)}
                />
              )}
              <ListRow
                label={`${addIndex + 1}  ${t("medicines.add")}`}
                selected={focus === addIndex}
                onClick={() => activateMedicineMenu(addIndex)}
              />
            </div>
          ),
        };
      }

      case SCREEN.ARCHIVED_MEDICINES:
        return {
          title: t("medicines.archivedTitle"),
          count: archivedMedicines.length,
          left: t("common.open"),
          right: t("common.back"),
          onEnter: () => {
            const medicine = archivedMedicines[focus];
            if (!medicine) return;
            setSelectedMedicine(medicine);
            navigate(SCREEN.MEDICINE_DETAIL);
          },
          onNumber: (number) => {
            const medicine = archivedMedicines[number - 1];
            if (!medicine) return;
            setSelectedMedicine(medicine);
            navigate(SCREEN.MEDICINE_DETAIL, number - 1);
          },
          content: (
            <div className="medicine-list">
              {archivedMedicines.map((medicine, index) => (
                <MedicineRow
                  key={medicine.id}
                  medicine={`${index + 1}  ${medicineName(medicine.id)}`}
                  detail={t("medicines.archivedStatus")}
                  selected={focus === index}
                  onClick={() => {
                    setSelectedMedicine(medicine);
                    navigate(SCREEN.MEDICINE_DETAIL, index);
                  }}
                />
              ))}
            </div>
          ),
        };

      case SCREEN.MEDICINE_DETAIL: {
        const reminders = medicineReminders(selectedMedicine);
        const activateDetailAction = () => {
          if (focus === 0) openDirectionsEditor();
          else if (focus === 1) openRemindersEditor();
          else if (focus === 2) archiveSelectedMedicine();
          else openDeleteMedicine();
        };
        const medicineDetail = selectedMedicine.isCustom
          ? t("medicines.manualEntry")
          : selectedMedicine.strength;
        const directions =
          medicineDirections(selectedMedicine) || t("medicines.noDirections");
        return {
          title: t("medicines.detailTitle"),
          count: 4,
          left: t("common.update"),
          right: t("common.back"),
          onLeft: activateDetailAction,
          onEnter: activateDetailAction,
          content: (
            <div className="medicine-detail-list">
              <MedicineRow
                medicine={medicineName(selectedMedicine)}
                detail={medicineDetail}
              />
              <ListRow
                label={t("medicines.usage", { usage: directions })}
                selected={focus === 0}
                onClick={() => openDirectionsEditor(0)}
              />
              <ListRow
                label={t("medicines.reminders", {
                  times: reminders.length
                    ? reminders.join(" / ")
                    : t("medicines.none"),
                })}
                selected={focus === 1}
                onClick={() => openRemindersEditor(1)}
              />
              <ListRow
                label={
                  isMedicineArchived(selectedMedicine)
                    ? t("medicines.unarchive")
                    : t("medicines.archive")
                }
                selected={focus === 2}
                onClick={() => {
                  setFocus(2);
                  archiveSelectedMedicine();
                }}
              />
              <ListRow
                label={t("medicines.delete")}
                state="danger"
                selected={focus === 3}
                onClick={() => openDeleteMedicine(3)}
              />
            </div>
          ),
        };
      }

      case SCREEN.EDIT_DIRECTIONS:
        return {
          title: t("medicines.editDirectionsTitle"),
          count: 1,
          left: t("common.save"),
          right: t("common.back"),
          onEnter: saveDirections,
          content: (
            <form
              className="manual-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveDirections();
              }}
            >
              <label htmlFor="medicine-directions">
                {t("medicines.directionsLabel")}
              </label>
              <textarea
                id="medicine-directions"
                value={editDirections}
                placeholder={t("medicines.directionsPlaceholder")}
                onChange={(event) => setEditDirections(event.target.value)}
                autoFocus
              />
              <p className="helper">{t("medicines.editDirectionsHelp")}</p>
            </form>
          ),
        };

      case SCREEN.EDIT_REMINDERS:
        return {
          title: t("medicines.editRemindersTitle"),
          count: reminderOptions.length + 1,
          left: t("common.save"),
          right: t("common.back"),
          onLeft: saveReminders,
          onEnter: () => {
            if (focus === reminderOptions.length)
              openCustomReminder(SCREEN.EDIT_REMINDERS);
            else toggleReminder(reminderOptions[focus]);
          },
          onNumber: (number) => {
            if (number >= 1 && number <= reminderOptions.length + 1)
              setFocus(number - 1);
          },
          content: (
            <>
              <p className="prompt">{t("medicines.chooseReminders")}</p>
              <div className="reminder-list">
                {reminderOptions.map((time, index) => (
                  <ListRow
                    key={time}
                    label={`${index + 1}  ${time}`}
                    trailing={selectedReminderTimes.includes(time) ? "✓" : "○"}
                    selected={focus === index}
                    onClick={() => {
                      setFocus(index);
                      toggleReminder(time);
                    }}
                  />
                ))}
                <ListRow
                  label={`${reminderOptions.length + 1}  ${t("add.otherReminder")}`}
                  selected={focus === reminderOptions.length}
                  onClick={() =>
                    openCustomReminder(
                      SCREEN.EDIT_REMINDERS,
                      reminderOptions.length,
                    )
                  }
                />
              </div>
            </>
          ),
        };

      case SCREEN.DELETE_MEDICINE:
        return {
          title: t("medicines.deleteTitle"),
          count: 2,
          left: t("common.confirm"),
          right: t("common.back"),
          horizontal: true,
          onEnter: () => {
            if (decision === 0) deleteSelectedMedicine();
            else goBack();
          },
          content: (
            <>
              <MedicineRow
                medicine={medicineName(selectedMedicine)}
                detail={t("medicines.deleteWarning")}
              />
              <Decision
                selected={decision}
                left={t("medicines.deleteYes")}
                right={t("common.cancel")}
                onSelect={setDecision}
                ariaLabel={t("medicines.deleteTitle")}
              />
            </>
          ),
        };

      case SCREEN.EMERGENCY:
        return {
          title: t("emergency.title"),
          count: 3,
          left: t("common.open"),
          right: t("common.back"),
          emergency: true,
          onEnter: () => {
            if (focus === 0) navigate(SCREEN.MEDICATION_EMERGENCY);
            else if (focus === 1) navigate(SCREEN.FIRST_AID);
            else {
              setCprStep(0);
              navigate(SCREEN.CPR_GUIDE);
            }
          },
          onNumber: (number) => {
            if (number === 1) navigate(SCREEN.MEDICATION_EMERGENCY, 0);
            else if (number === 2) navigate(SCREEN.FIRST_AID, 1);
            else if (number === 3) {
              setCprStep(0);
              navigate(SCREEN.CPR_GUIDE, 2);
            }
          },
          content: (
            <div className="dense-list">
              <ListRow
                label={`1  ${t("emergency.medicationCategory")}`}
                state="danger"
                selected={focus === 0}
                onClick={() => navigate(SCREEN.MEDICATION_EMERGENCY, 0)}
              />
              <ListRow
                label={`2  ${t("emergency.firstAidCategory")}`}
                selected={focus === 1}
                onClick={() => navigate(SCREEN.FIRST_AID, 1)}
              />
              <ListRow
                label={`3  ${t("emergency.cprCategory")}`}
                state="danger"
                selected={focus === 2}
                onClick={() => {
                  setCprStep(0);
                  navigate(SCREEN.CPR_GUIDE, 2);
                }}
              />
            </div>
          ),
        };

      case SCREEN.MEDICATION_EMERGENCY:
        return {
          title: t("emergency.medicationTitle"),
          count: 1,
          left: "",
          right: t("common.back"),
          emergency: true,
          content: (
            <div className="emergency-detail">
              <p className="emergency-detail__label">
                {t("emergency.allergyLabel")}
              </p>
              <p className="emergency-result">{t("emergency.allergyValue")}</p>
              <p className="emergency-detail__label">
                {t("emergency.currentMedicationLabel")}
              </p>
              <p>{t("emergency.currentMedicine")}</p>
              <p className="emergency-warning">
                {t("emergency.medicationWarning")}
              </p>
            </div>
          ),
        };

      case SCREEN.FIRST_AID:
        return {
          title: t("emergency.firstAidTitle"),
          count: 2,
          left: t("common.open"),
          right: t("common.back"),
          emergency: true,
          onEnter: () =>
            navigate(
              focus === 0 ? SCREEN.FIRST_AID_WOUND : SCREEN.FIRST_AID_PREGNANCY,
            ),
          onNumber: (number) => {
            if (number === 1) navigate(SCREEN.FIRST_AID_WOUND, 0);
            if (number === 2) navigate(SCREEN.FIRST_AID_PREGNANCY, 1);
          },
          content: (
            <>
              <p className="prompt">{t("emergency.chooseFirstAid")}</p>
              <ListRow
                label={`1  ${t("emergency.woundTitle")}`}
                selected={focus === 0}
                onClick={() => navigate(SCREEN.FIRST_AID_WOUND, 0)}
              />
              <ListRow
                label={`2  ${t("emergency.pregnancyTitle")}`}
                selected={focus === 1}
                onClick={() => navigate(SCREEN.FIRST_AID_PREGNANCY, 1)}
              />
            </>
          ),
        };

      case SCREEN.MEDICINE_CHAT:
        return {
          title: t("chat.title"),
          count: 0,
          left: null,
          right: t("common.back"),
          content: (
            <div className="medicine-chat-screen">
              <MedicineChat />
            </div>
          ),
        };

      case SCREEN.FIRST_AID_WOUND:
        return {
          title: t("emergency.woundTitle"),
          count: 1,
          left: "",
          right: t("common.back"),
          emergency: true,
          content: (
            <div className="emergency-detail">
              <ol>
                {[1, 2, 3, 4].map((step) => (
                  <li key={step}>{t(`emergency.woundSteps.step${step}`)}</li>
                ))}
              </ol>
              <p className="emergency-warning">{t("emergency.woundWarning")}</p>
            </div>
          ),
        };

      case SCREEN.FIRST_AID_PREGNANCY:
        return {
          title: t("emergency.pregnancyTitle"),
          count: 1,
          left: "",
          right: t("common.back"),
          emergency: true,
          content: (
            <div className="emergency-detail">
              <ol>
                {[1, 2, 3].map((step) => (
                  <li key={step}>
                    {t(`emergency.pregnancySteps.step${step}`)}
                  </li>
                ))}
              </ol>
              <p className="emergency-warning">
                {t("emergency.pregnancyWarning")}
              </p>
            </div>
          ),
        };

      case SCREEN.CPR_GUIDE: {
        const isLastCprStep = cprStep === CPR_STEP_COUNT - 1;
        const advanceCpr = () => {
          if (isLastCprStep) resetFlow(SCREEN.HOME);
          else
            setCprStep((current) => Math.min(current + 1, CPR_STEP_COUNT - 1));
        };
        return {
          title: t("emergency.cprTitle"),
          count: 1,
          left: isLastCprStep ? t("common.mainMenu") : t("emergency.nextStep"),
          right: t("common.back"),
          emergency: true,
          onEnter: advanceCpr,
          onLeft: advanceCpr,
          content: (
            <div className="cpr-step" aria-live="polite">
              <p className="cpr-step__progress">
                {t("emergency.stepProgress", {
                  current: cprStep + 1,
                  total: CPR_STEP_COUNT,
                })}
              </p>
              <strong>{t(`emergency.cprSteps.step${cprStep + 1}Title`)}</strong>
              <p>{t(`emergency.cprSteps.step${cprStep + 1}Body`)}</p>
              {cprStep === 3 && (
                <p className="cpr-step__tempo">100–120 / min</p>
              )}
              <p className="emergency-warning">{t("emergency.cprWarning")}</p>
            </div>
          ),
        };
      }

      case SCREEN.LANGUAGE: {
        const languages = [{ code: "en-US", label: t("language.enUS") }];
        const selectLanguage = (index) => {
          const language = languages[index];
          if (!language) return;
          i18n.changeLanguage(language.code);
          setFocus(index);
        };

        return {
          title: t("language.title"),
          count: languages.length,
          left: t("common.select"),
          right: t("common.back"),
          onEnter: () => selectLanguage(focus),
          onNumber: (number) => selectLanguage(number - 1),
          content: (
            <>
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
            </>
          ),
        };
      }

      default:
        return { title: "MedAboutYou", count: 0, content: null };
    }
  })();

  useEffect(() => {
    const maxFocus = Math.max(0, screenConfig.count - 1);
    if (focus > maxFocus) setFocus(maxFocus);
  }, [focus, screenConfig.count]);

  const onLeft = screenConfig.onLeft || screenConfig.onEnter;
  const onCenter = screenConfig.onEnter;
  const onRight = goBack;

  const handleKeyDown = (event) => {
    const isTextField =
      (event.target instanceof HTMLInputElement &&
        event.target.type !== "file") ||
      event.target instanceof HTMLTextAreaElement;
    if (isTextField && event.key !== "Escape" && event.key !== "SoftLeft")
      return;

    if (/^[0oO]$/.test(event.key) && screenConfig.onInputKey) {
      event.preventDefault();
      screenConfig.onInputKey();
      return;
    }

    const isQuantityEntry =
      screen === SCREEN.QUANTITY ||
      (screen === SCREEN.REMINDER_ALERT && focus === 1);

    if (isQuantityEntry && (/^[0-9]$/.test(event.key) || event.key === "*")) {
      event.preventDefault();
      enterQuantityDigit(event.key);
      return;
    }

    if (/^[1-9]$/.test(event.key) && screenConfig.onNumber) {
      event.preventDefault();
      screenConfig.onNumber(Number(event.key));
      return;
    }

    switch (event.key) {
      case "ArrowUp":
        if (screenConfig.onArrowUp) screenConfig.onArrowUp();
        else if (!screenConfig.horizontal && screenConfig.count > 1)
          move(-1, screenConfig.count);
        break;
      case "ArrowDown":
        if (screenConfig.onArrowDown) screenConfig.onArrowDown();
        else if (!screenConfig.horizontal && screenConfig.count > 1)
          move(1, screenConfig.count);
        break;
      case "ArrowLeft":
        if (
          screen === SCREEN.QUANTITY ||
          (screen === SCREEN.REMINDER_ALERT && focus === 1)
        )
          adjustQuantity(-0.5);
        else if (screenConfig.onArrowLeft) screenConfig.onArrowLeft();
        else if (screenConfig.horizontal) setDecision(0);
        break;
      case "ArrowRight":
        if (
          screen === SCREEN.QUANTITY ||
          (screen === SCREEN.REMINDER_ALERT && focus === 1)
        )
          adjustQuantity(0.5);
        else if (screenConfig.onArrowRight) screenConfig.onArrowRight();
        else if (screenConfig.horizontal) setDecision(1);
        break;
      case "Enter":
        onCenter?.();
        break;
      case "Escape":
      case "SoftLeft":
        onLeft?.();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <DeviceShell
      title={screenConfig.title}
      date={screenConfig.date}
      time={screenConfig.time}
      emergency={screenConfig.emergency}
      left={screenConfig.left}
      right={screenConfig.right}
      onLeft={onLeft}
      onCenter={onCenter}
      onRight={onRight}
      centerLabel={t("common.confirm")}
      noLeftLabel={t("common.noLeftAction")}
      noRightLabel={t("common.noRightAction")}
      onKeyDown={handleKeyDown}
      screenRef={shellRef}
    >
      {screenConfig.content}
    </DeviceShell>
  );
}
