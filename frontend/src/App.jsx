import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  recognizeMedicineImage,
  searchMedicines,
} from "./api/medicine.js";
import DeviceShell from "./components/DeviceShell.jsx";
import MedicineChat from "./components/MedicineChat.jsx";
import MedicineMatchDeck from "./components/MedicineMatchDeck.jsx";
import {
  createChatEntityId,
  snapshotChatMedicine,
  useStoredChatSessions,
} from "./hooks/useStoredChatSessions.js";
import {
  getLocalDateKey,
  useStoredDoseLog,
} from "./hooks/useStoredDoseLog.js";
import {
  Decision,
  FeedbackCard,
  FocusableField,
  ListRow,
  MedicineRow,
  QuantityPicker,
} from "./components/Controls.jsx";
import {
  demoDoseDays,
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
  DOSE_MENU: "dose-menu",
  RECORD_TODAY: "record-today",
  RECORD_COMPLETE: "record-complete",
  HISTORY: "history",
  HISTORY_DETAIL: "history-detail",
  UPDATE_RECORD: "update-record",
  DELETE_DOSE_RECORD: "delete-dose-record",
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
  MEDICINE_CHAT_MENU: "medicine-chat-menu",
  MEDICINE_CHAT_SEARCH_MENU: "medicine-chat-search-menu",
  MEDICINE_CHAT_MEDICINE: "medicine-chat-medicine",
  MEDICINE_CHAT_BAG: "medicine-chat-bag",
  MEDICINE_CHAT_CONTEXT: "medicine-chat-context",
  MEDICINE_CHAT_ASSISTANT_MENU: "medicine-chat-assistant-menu",
  MEDICINE_CHAT_HISTORY: "medicine-chat-history",
  MEDICINE_CHAT_CLEAR_HISTORY: "medicine-chat-clear-history",
  MEDICINE_CHAT: "medicine-chat",
  LANGUAGE: "language",
  RESET_DEMO: "reset-demo",
};

const HISTORY_KEY = "medaboutyou";
const DEMO_DATA_STORAGE_KEYS = [
  "medaboutyou-chat-sessions",
  "medaboutyou-dose-log",
  "medaboutyou-dose-log-initial-days-v1",
  "medaboutyou-today-doses",
  "medaboutyou-user-medicines",
  "medaboutyou-medicine-settings",
];
const DEMO_RESET_PRESS_COUNT = 6;
const DEMO_RESET_MAX_GAP_MS = 2000;
const SCREEN_VALUES = new Set(Object.values(SCREEN));
const CHAT_SESSION_SCREENS = new Set([
  SCREEN.MEDICINE_CHAT_CONTEXT,
  SCREEN.MEDICINE_CHAT,
]);
const LANGUAGE_CODES = ["zh-TW", "en-US"];
const CPR_STEP_COUNT = 6;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const defaultDoseSchedule = initialDoses.map((dose) => ({
  ...dose,
  taken: false,
}));
const localDateFromKey = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
};
const shortDateFor = (dateKey) => dateKey.slice(5).replace("-", "/");
const splitSourceVariants = (value = "") =>
  value.split(";;;").map((item) => item.trim());
const imageVariantFor = (value = "") => {
  const variants = splitSourceVariants(value);
  const index = variants.findIndex((item) => /^https?:\/\//i.test(item));
  return { index: Math.max(0, index), url: index >= 0 ? variants[index] : "" };
};
const sourceVariantAt = (value = "", index = 0) => {
  const variants = splitSourceVariants(value);
  return variants.length === 1 ? variants[0] : variants[index] || "";
};
const extractStrength = (record) =>
  `${record.displayName} ${record.englishName}`.match(
    /\b\d+(?:\.\d+)?\s*(?:mcg|mg|g|iu|ml|%)\b/i,
  )?.[0] || "";
const normalizeMedicineText = (value = "") =>
  value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const recognitionStrengthFor = (record, recognition) => {
  const medications = recognition?.medications || [];
  const names = [record.displayName, record.englishName]
    .map(normalizeMedicineText)
    .filter(Boolean);
  const matched = medications.find((medicine) => {
    const medicineName = normalizeMedicineText(medicine.name);
    return names.some(
      (name) => name.includes(medicineName) || medicineName.includes(name),
    );
  });
  return matched?.strength || "";
};
const chatTitleFor = (messages, fallback) => {
  const title =
    messages
      .find((message) => message.role === "user")
      ?.content.replace(/\s+/g, " ")
      .trim() || fallback;
  return title.length > 42 ? `${title.slice(0, 41)}…` : title;
};
const getDefaultFocusForScreen = (screen, currentLanguage) => {
  if (screen !== SCREEN.LANGUAGE) return 0;
  const languageIndex = LANGUAGE_CODES.findIndex(
    (code) => code === currentLanguage,
  );
  return languageIndex >= 0 ? languageIndex : 0;
};

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
  const todayDateKey = getLocalDateKey();
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
  const [editDirectionsEditing, setEditDirectionsEditing] = useState(false);
  const [customReminderTime, setCustomReminderTime] = useState("");
  const [reminderReturnScreen, setReminderReturnScreen] = useState(
    SCREEN.REMINDER_SETUP,
  );
  const [reminderInputError, setReminderInputError] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [chatSearchResult, setChatSearchResult] = useState(null);
  const [chatSearching, setChatSearching] = useState(false);
  const [chatSearchError, setChatSearchError] = useState("");
  const [chatMedicine, setChatMedicine] = useState(null);
  const [chatRecognitionText, setChatRecognitionText] = useState("");
  const [chatEditingField, setChatEditingField] = useState(null);
  const [chatSessions, setChatSessions] = useStoredChatSessions();
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatDisclaimer, setChatDisclaimer] = useState("");
  const [selectedMedicine, setSelectedMedicine] = useState(medicines[0]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [recognitionRecords, setRecognitionRecords] = useState([]);
  const [recognitionEvidence, setRecognitionEvidence] = useState(null);
  const [recognitionStatus, setRecognitionStatus] = useState("idle");
  const [recognitionError, setRecognitionError] = useState("");
  const [cprStep, setCprStep] = useState(0);
  const [doseDays, setDoseDays] = useStoredDoseLog(
    defaultDoseSchedule,
    demoDoseDays,
    todayDateKey,
  );
  const [selectedDoseDate, setSelectedDoseDate] = useState(() => {
    const storedDate = window.history.state?.doseDate;
    return localDateFromKey(storedDate) ? storedDate : todayDateKey;
  });
  const [selectedDoseId, setSelectedDoseId] = useState(() => {
    const storedId = window.history.state?.doseId;
    return typeof storedId === "string" ? storedId : null;
  });
  const [userMedicines, setUserMedicines] = useStoredUserMedicines();
  const [medicineSettings, setMedicineSettings] = useStoredMedicineSettings();
  const fileInputRef = useRef(null);
  const shellRef = useRef(null);
  const matchScrollRef = useRef(null);
  const medicineChatRef = useRef(null);
  const chatSearchRequestRef = useRef(null);
  const recognitionRequestRef = useRef(null);
  const recognitionSourceRef = useRef(null);
  const quantityBufferRef = useRef("");
  const quantityTimerRef = useRef(null);
  const demoResetPressesRef = useRef(0);
  const demoResetLastPressRef = useRef(0);
  const pendingResetRef = useRef(null);
  const activeScreenRef = useRef(screen);
  activeScreenRef.current = screen;
  const chatSessionsRef = useRef(chatSessions);
  chatSessionsRef.current = chatSessions;
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;

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
    (medicine.isCatalog
      ? medicine.strength || t("medicines.catalogEntry")
      : medicine.isCustom
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
  const sortedDoseDays = [...doseDays].sort((left, right) =>
    right.date.localeCompare(left.date),
  );
  const todayDoseDay = sortedDoseDays.find(
    (day) => day.date === todayDateKey,
  );
  const doses = todayDoseDay?.doses || defaultDoseSchedule;
  const selectedDoseDay =
    sortedDoseDays.find((day) => day.date === selectedDoseDate) ||
    todayDoseDay ||
    sortedDoseDays[0] ||
    null;
  const selectedDoseRecord =
    selectedDoseDay?.doses.find((dose) => dose.id === selectedDoseId) ||
    selectedDoseDay?.doses[focus] ||
    selectedDoseDay?.doses[0] ||
    null;
  const doseMedicineName = (dose) =>
    dose.medicineName || medicineName(dose.medicineId);
  const formatFullDoseDate = (dateKey) => {
    const date = localDateFromKey(dateKey);
    if (!date) return dateKey;
    return new Intl.DateTimeFormat(currentLanguage, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  };
  const relativeDoseDate = (dateKey) => {
    const date = localDateFromKey(dateKey);
    const today = localDateFromKey(todayDateKey);
    if (!date || !today) return "";
    const dayNumber = (value) =>
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) /
      86_400_000;
    const difference = dayNumber(date) - dayNumber(today);
    if (difference === 0) return t("history.today");
    if (difference === -1) return t("history.yesterday");
    return new Intl.DateTimeFormat(currentLanguage, {
      weekday: "long",
    }).format(date);
  };
  const historyDays = sortedDoseDays.map((day) => {
    const done = day.doses.filter((dose) => dose.taken).length;
    const total = day.doses.length;
    return {
      ...day,
      done,
      total,
      relative: relativeDoseDate(day.date),
      state: total > 0 && done === total ? "success" : done > 0 ? "focus" : "default",
    };
  });
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
  const quantityLabelsFor = (unit = "unitPill") => ({
    valueLabel: t("dose.quantityValue", {
      value: quantity.toFixed(1),
      unit: t(`dose.${unit}`),
    }),
    decreaseLabel: t("dose.decrease", { unit: t(`dose.${unit}`) }),
    increaseLabel: t("dose.increase", { unit: t(`dose.${unit}`) }),
  });
  const localizedCandidates = recognitionRecords.map((record) => {
    const name =
      record.displayName || record.englishName || record.licenseNumber;
    const imageVariant = imageVariantFor(record.imageUrl);
    const imprints = [
      sourceVariantAt(record.imprint1, imageVariant.index),
      sourceVariantAt(record.imprint2, imageVariant.index),
    ]
      .filter(Boolean)
      .join(" / ");
    return {
      id: record.recordId,
      recordId: record.recordId,
      name,
      genericName: name,
      strength:
        extractStrength(record) ||
        recognitionStrengthFor(record, recognitionEvidence),
      image: imageVariant.url,
      imageAlt: t("matchCard.imageAlt", { name }),
      sourceRecord: record,
      details: [
        {
          label: t("matchCard.licenseNumber"),
          value: record.licenseNumber,
        },
        {
          label: t("matchCard.dosageForm"),
          value: sourceVariantAt(record.dosageForm, imageVariant.index),
        },
        {
          label: t("matchCard.shape"),
          value: sourceVariantAt(record.shape, imageVariant.index),
        },
        {
          label: t("matchCard.color"),
          value: sourceVariantAt(record.color, imageVariant.index),
        },
        {
          label: t("matchCard.scoreLine"),
          value: sourceVariantAt(record.scoreLine, imageVariant.index),
        },
        {
          label: t("matchCard.size"),
          value: sourceVariantAt(record.size, imageVariant.index),
        },
        { label: t("matchCard.imprints"), value: imprints },
      ].filter((detail) => detail.value),
    };
  });
  const chatBagCandidates = activeMedicines.map((medicine) => {
    const reminders = medicineReminders(medicine);
    const name = medicineName(medicine);
    return {
      id: medicine.id,
      name,
      genericName: name,
      sourceMedicine: medicine,
      details: [
        ...(medicine.strength
          ? [{ label: t("chat.strength"), value: medicine.strength }]
          : []),
        {
          label: t("chat.directions"),
          value: medicineDirections(medicine) || t("medicines.noDirections"),
        },
        {
          label: t("chat.reminders"),
          value: reminders.length ? reminders.join(" / ") : t("medicines.none"),
        },
      ],
    };
  });

  const persistCurrentFocus = (value = focus) => {
    const entry = window.history.state;
    if (!entry?.[HISTORY_KEY] || entry.screen !== screen) return;
    window.history.replaceState({ ...entry, focus: value }, "");
  };

  const navigate = (next, fromFocus = focus, state = {}) => {
    persistCurrentFocus(fromFocus);
    const depth = Number(window.history.state?.depth || 0) + 1;
    const nextFocus = getDefaultFocusForScreen(next, currentLanguage);
    window.history.pushState(
      {
        ...state,
        [HISTORY_KEY]: true,
        screen: next,
        depth,
        focus: nextFocus,
      },
      "",
    );
    activeScreenRef.current = next;
    setScreen(next);
    setFocus(nextFocus);
  };

  const replace = useCallback(
    (next, state = {}) => {
      const depth = Number(window.history.state?.depth || 0);
      const nextFocus = Number.isInteger(state.focus)
        ? state.focus
        : getDefaultFocusForScreen(next, currentLanguage);
      window.history.replaceState(
        {
          ...state,
          [HISTORY_KEY]: true,
          screen: next,
          depth,
          focus: nextFocus,
        },
        "",
      );
      activeScreenRef.current = next;
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

  const scrollScreenContent = (direction) => {
    const screenContent = shellRef.current?.querySelector(".screen-content");
    if (!screenContent) return;
    const candidates = [
      screenContent,
      ...screenContent.querySelectorAll(".emergency-detail, .cpr-step"),
    ];
    const scroller =
      candidates.find(
        (candidate) => candidate.scrollHeight > candidate.clientHeight + 1,
      ) || screenContent;
    const distance = Math.max(32, Math.round(scroller.clientHeight * 0.7));
    scroller.scrollBy({ top: direction * distance, behavior: "smooth" });
  };

  const resetDemoData = () => {
    chatSearchRequestRef.current?.abort();
    recognitionRequestRef.current?.abort();
    DEMO_DATA_STORAGE_KEYS.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Reload still resets in-memory state when storage is unavailable.
      }
    });
    window.history.replaceState(
      {
        [HISTORY_KEY]: true,
        screen: SCREEN.HOME,
        depth: 0,
        focus: 0,
      },
      "",
    );
    window.location.reload();
  };

  const registerDemoResetPress = () => {
    const now = Date.now();
    if (now - demoResetLastPressRef.current > DEMO_RESET_MAX_GAP_MS) {
      demoResetPressesRef.current = 0;
    }
    demoResetLastPressRef.current = now;
    demoResetPressesRef.current += 1;
    if (demoResetPressesRef.current < DEMO_RESET_PRESS_COUNT) return;
    demoResetPressesRef.current = 0;
    demoResetLastPressRef.current = 0;
    setDecision(1);
    navigate(SCREEN.RESET_DEMO, focus);
  };

  const startNewChatSession = () => {
    const chatId = createChatEntityId("chat");
    setActiveChatId(chatId);
    setChatMessages([]);
    setChatDisclaimer("");
    return chatId;
  };

  const applyStoredChatSession = useCallback((session) => {
    setActiveChatId(session.id);
    setChatMessages(session.messages);
    setChatMedicine(session.medicine);
    setChatRecognitionText("");
    setChatDisclaimer(session.disclaimer || "");
  }, []);

  const saveChatMessages = (
    nextMessages,
    { medicine: resolvedMedicine, disclaimer } = {},
  ) => {
    const now = new Date().toISOString();
    const chatId = activeChatId || createChatEntityId("chat");
    const boundedMessages = nextMessages.slice(-40);
    const medicine = snapshotChatMedicine(resolvedMedicine || chatMedicine);

    if (!activeChatId) setActiveChatId(chatId);
    setChatMessages(boundedMessages);
    setChatDisclaimer(disclaimer || "");
    setChatSessions((current) => {
      const existing = current.find((session) => session.id === chatId);
      const session = {
        id: chatId,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        locale: currentLanguage,
        title:
          existing?.title ||
          chatTitleFor(boundedMessages, t("chat.untitled")),
        medicine: medicine || existing?.medicine || null,
        messages: boundedMessages,
        disclaimer: disclaimer || existing?.disclaimer || "",
        requiresPackageText:
          !medicine?.recordId &&
          (Boolean(chatRecognitionText.trim()) ||
            existing?.requiresPackageText === true),
      };
      return [session, ...current.filter((item) => item.id !== chatId)];
    });

    const entry = window.history.state;
    if (
      entry?.[HISTORY_KEY] &&
      entry.screen === SCREEN.MEDICINE_CHAT &&
      entry.chatId !== chatId
    ) {
      window.history.replaceState({ ...entry, chatId }, "");
    }
  };

  const openStoredChatSession = (session, fromFocus = focus) => {
    applyStoredChatSession(session);
    const needsPackageText =
      session.requiresPackageText && !session.medicine?.recordId;
    navigate(
      needsPackageText
        ? SCREEN.MEDICINE_CHAT_CONTEXT
        : SCREEN.MEDICINE_CHAT,
      fromFocus,
      { chatId: session.id },
    );
  };

  const chooseChatCandidate = (record) => {
    const chatId = startNewChatSession();
    setChatMedicine(record);
    setChatRecognitionText("");
    const entry = window.history.state;
    if (entry?.[HISTORY_KEY] && entry.screen === SCREEN.MEDICINE_CHAT) {
      window.history.replaceState({ ...entry, chatId }, "");
    }
  };

  const clearStoredChatSessions = () => {
    setChatSessions([]);
    setActiveChatId(null);
    setChatMessages([]);
    setChatDisclaimer("");
    setChatMedicine(null);
    setChatRecognitionText("");
    setFocus(0);
  };

  const formatChatHistoryDate = (timestamp) => {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat(currentLanguage, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const clearChatSetup = () => {
    chatSearchRequestRef.current?.abort();
    chatSearchRequestRef.current = null;
    setChatSearchQuery("");
    setChatSearchResult(null);
    setChatSearching(false);
    setChatSearchError("");
    setChatMedicine(null);
    setChatRecognitionText("");
    setChatEditingField(null);
    setActiveChatId(null);
    setChatMessages([]);
    setChatDisclaimer("");
  };

  const startMedicineChat = (fromFocus = focus) => {
    clearChatSetup();
    navigate(SCREEN.MEDICINE_CHAT_MENU, fromFocus);
  };

  const completeChatSetup = () => {
    const chatId = activeChatId || startNewChatSession();
    setChatEditingField(null);
    navigate(SCREEN.MEDICINE_CHAT, focus, { chatId });
  };

  const enterChatInputMode = (field) => {
    setChatEditingField(field);
  };

  const leaveChatInputMode = () => {
    setChatEditingField(null);
    window.requestAnimationFrame(() => shellRef.current?.focus());
  };

  const searchChatMedicine = async () => {
    const query = chatSearchQuery.trim();
    if (query.length < 2 || query.length > 200) {
      setChatSearchError(t("chat.searchValidation"));
      return;
    }
    if (chatSearching) return;

    chatSearchRequestRef.current?.abort();
    const controller = new AbortController();
    chatSearchRequestRef.current = controller;
    setChatEditingField(null);
    setChatSearching(true);
    setChatSearchError("");
    setChatSearchResult(null);

    try {
      const result = await searchMedicines(query, {
        signal: controller.signal,
      });
      if (chatSearchRequestRef.current !== controller) return;
      if (activeScreenRef.current !== SCREEN.MEDICINE_CHAT_MEDICINE) return;
      setChatSearchResult(result);
      setFocus(result.records.length ? 1 : 0);
    } catch (error) {
      if (error.name === "AbortError") return;
      if (chatSearchRequestRef.current !== controller) return;
      if (activeScreenRef.current !== SCREEN.MEDICINE_CHAT_MEDICINE) return;
      setChatSearchError(
        error.status === 400
          ? t("chat.searchValidation")
          : error.status === 0
            ? t("chat.searchNetworkError")
            : t("chat.searchUnavailable"),
      );
      setFocus(0);
    } finally {
      if (chatSearchRequestRef.current === controller) {
        chatSearchRequestRef.current = null;
        setChatSearching(false);
      }
    }
  };

  const recognitionFailureMessage = (error, sourceKind) => {
    if (error.status === 400)
      return t(
        sourceKind === "text"
          ? "add.searchValidation"
          : "add.invalidImage",
      );
    if (error.status === 413) return t("add.imageTooLarge");
    if (error.status === 415) return t("add.unsupportedImage");
    if (error.status === 422) return t("add.unreadableImage");
    if (error.status === 429) return t("add.recognitionBusy");
    if (error.status === 504) return t("add.recognitionTimedOut");
    if (error.status === 0) return t("add.recognitionNetworkError");
    return t("add.recognitionUnavailable");
  };

  const runRecognition = async (source) => {
    recognitionRequestRef.current?.abort();
    recognitionSourceRef.current = source;
    if (
      source.kind === "text" &&
      (source.query.length < 2 || source.query.length > 200)
    ) {
      recognitionRequestRef.current = null;
      setRecognitionRecords([]);
      setRecognitionEvidence(null);
      setRecognitionStatus("error");
      setRecognitionError(t("add.searchValidation"));
      setSelectedCandidate(null);
      setFocus(0);
      return;
    }

    const controller = new AbortController();
    recognitionRequestRef.current = controller;
    setRecognitionRecords([]);
    setRecognitionEvidence(null);
    setRecognitionError("");
    setRecognitionStatus("loading");
    setSelectedCandidate(null);
    setFocus(0);

    try {
      const result =
        source.kind === "photo"
          ? await recognizeMedicineImage(source.file, {
              signal: controller.signal,
            })
          : await searchMedicines(source.query, {
              signal: controller.signal,
            });
      if (recognitionRequestRef.current !== controller) return;
      if (activeScreenRef.current !== SCREEN.RECOGNIZING) return;

      const records = result.records.slice(0, 8);
      setRecognitionRecords(records);
      setRecognitionEvidence(
        source.kind === "photo" ? result.recognition : null,
      );
      setRecognitionStatus(records.length ? "success" : "empty");
      setFocus(0);
      replace(SCREEN.MATCHES);
    } catch (error) {
      if (error.name === "AbortError") return;
      if (recognitionRequestRef.current !== controller) return;
      setRecognitionStatus("error");
      setRecognitionEvidence(null);
      setRecognitionError(recognitionFailureMessage(error, source.kind));
      setFocus(0);
    } finally {
      if (recognitionRequestRef.current === controller) {
        recognitionRequestRef.current = null;
      }
    }
  };

  const retryRecognition = () => {
    const source = recognitionSourceRef.current;
    if (!source) return;
    if (screen !== SCREEN.RECOGNIZING) replace(SCREEN.RECOGNIZING);
    void runRecognition(source);
  };

  useEffect(() => {
    const entry = window.history.state;

    if (
      entry?.[HISTORY_KEY] &&
      SCREEN_VALUES.has(entry.screen) &&
      Number.isInteger(entry.depth)
    ) {
      if (localDateFromKey(entry.doseDate)) {
        setSelectedDoseDate(entry.doseDate);
      }
      setSelectedDoseId(
        typeof entry.doseId === "string" ? entry.doseId : null,
      );
      const storedChat =
        CHAT_SESSION_SCREENS.has(entry.screen) &&
        typeof entry.chatId === "string"
          ? chatSessionsRef.current.find(
              (session) => session.id === entry.chatId,
            )
          : null;
      const restoredScreen = [SCREEN.RECOGNIZING, SCREEN.MATCHES].includes(
        entry.screen,
      )
        ? SCREEN.ADD_METHOD
        : entry.screen === SCREEN.MEDICINE_CHAT_CLEAR_HISTORY
          ? SCREEN.MEDICINE_CHAT_HISTORY
          : CHAT_SESSION_SCREENS.has(entry.screen) && !storedChat
            ? SCREEN.MEDICINE_CHAT_ASSISTANT_MENU
            : entry.screen;
      if (storedChat) applyStoredChatSession(storedChat);
      if (restoredScreen !== entry.screen) {
        window.history.replaceState(
          {
            ...entry,
            screen: restoredScreen,
            focus: getDefaultFocusForScreen(
              restoredScreen,
              currentLanguageRef.current,
            ),
          },
          "",
        );
      }
      activeScreenRef.current = restoredScreen;
      setScreen(restoredScreen);
      setFocus(
        restoredScreen === entry.screen && Number.isInteger(entry.focus)
          ? entry.focus
          : getDefaultFocusForScreen(
              restoredScreen,
              currentLanguageRef.current,
            ),
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
      activeScreenRef.current = SCREEN.HOME;
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
        activeScreenRef.current = next;
        setScreen(next);
        setFocus(nextFocus);
        return;
      }
      let nextScreen = event.state.screen;
      if (localDateFromKey(event.state.doseDate)) {
        setSelectedDoseDate(event.state.doseDate);
      }
      setSelectedDoseId(
        typeof event.state.doseId === "string" ? event.state.doseId : null,
      );
      if (CHAT_SESSION_SCREENS.has(nextScreen)) {
        const storedChat = chatSessionsRef.current.find(
          (session) => session.id === event.state.chatId,
        );
        if (storedChat) {
          applyStoredChatSession(storedChat);
        } else if (activeChatIdRef.current !== event.state.chatId) {
          nextScreen = SCREEN.MEDICINE_CHAT_ASSISTANT_MENU;
          window.history.replaceState(
            {
              ...event.state,
              screen: nextScreen,
              focus: getDefaultFocusForScreen(
                nextScreen,
                currentLanguageRef.current,
              ),
            },
            "",
          );
        }
      }
      activeScreenRef.current = nextScreen;
      setScreen(nextScreen);
      setFocus(
        nextScreen === event.state.screen && Number.isInteger(event.state.focus)
          ? event.state.focus
          : getDefaultFocusForScreen(
              nextScreen,
              currentLanguageRef.current,
            ),
      );
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyStoredChatSession]);

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
    setChatEditingField(null);
    quantityBufferRef.current = "";
    window.clearTimeout(quantityTimerRef.current);
  }, [screen]);

  useEffect(() => {
    if (screen === SCREEN.HOME) return;
    demoResetPressesRef.current = 0;
    demoResetLastPressRef.current = 0;
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

  useEffect(
    () => () => {
      window.clearTimeout(quantityTimerRef.current);
      chatSearchRequestRef.current?.abort();
      recognitionRequestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (screen === SCREEN.MEDICINE_CHAT_MEDICINE) return;
    chatSearchRequestRef.current?.abort();
    chatSearchRequestRef.current = null;
    setChatSearching(false);
  }, [screen]);

  useEffect(() => {
    if (screen === SCREEN.RECOGNIZING || recognitionStatus !== "loading")
      return;
    recognitionRequestRef.current?.abort();
    recognitionRequestRef.current = null;
    setRecognitionStatus("error");
    setRecognitionError(t("add.recognitionCanceled"));
  }, [recognitionStatus, screen, t]);

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
    if (mode === "search") {
      recognitionRequestRef.current?.abort();
      recognitionRequestRef.current = null;
      recognitionSourceRef.current = null;
      setRecognitionRecords([]);
      setRecognitionEvidence(null);
      setRecognitionStatus("idle");
      setRecognitionError("");
      setSelectedCandidate(null);
    }
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
    recognitionRequestRef.current?.abort();
    recognitionRequestRef.current = null;
    recognitionSourceRef.current = null;
    setRecognitionRecords([]);
    setRecognitionEvidence(null);
    setRecognitionStatus("idle");
    setRecognitionError("");
    setSelectedCandidate(null);
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
      void runRecognition({ kind: "text", query: name });
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

  const commitSavedMedicine = (updates) => {
    if (!savedManualMedicine) return;
    const medicine = { ...savedManualMedicine, ...updates };
    setSavedManualMedicine(medicine);
    setSelectedMedicine(medicine);
    setUserMedicines((items) => {
      const exists = items.some((item) => item.id === medicine.id);
      return exists
        ? items.map((item) => (item.id === medicine.id ? medicine : item))
        : [...items, medicine];
    });
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
    commitSavedMedicine({ reminders: [] });
    resetFlow(SCREEN.ADD_COMPLETE);
  };

  const completeReminderSetup = () => {
    commitSavedMedicine({ reminders: selectedReminderTimes });
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
    setEditDirectionsEditing(false);
    navigate(SCREEN.EDIT_DIRECTIONS, fromFocus);
  };

  const openRemindersEditor = (fromFocus = focus) => {
    setSelectedReminderTimes(medicineReminders(selectedMedicine));
    setReminderInputError(false);
    navigate(SCREEN.EDIT_REMINDERS, fromFocus);
  };

  const saveDirections = () => {
    setEditDirectionsEditing(false);
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

  const updateDoseDay = (dateKey, updateDoses, fallbackDoses = []) => {
    setDoseDays((days) => {
      const existing = days.find((day) => day.date === dateKey);
      const sourceDoses = existing?.doses || fallbackDoses;
      const nextDoses = updateDoses(sourceDoses.map((dose) => ({ ...dose })));
      const updatedDay = {
        date: dateKey,
        updatedAt: new Date().toISOString(),
        doses: nextDoses,
      };
      return [updatedDay, ...days.filter((day) => day.date !== dateKey)];
    });
  };

  const toggleDose = (index) => {
    const target = doses[index];
    if (!target) return;
    updateDoseDay(
      todayDateKey,
      (items) =>
        items.map((item) =>
          item.id === target.id
            ? {
                ...item,
                medicineName:
                  item.medicineName || medicineName(item.medicineId),
                taken: !item.taken,
              }
            : item,
        ),
      defaultDoseSchedule,
    );
  };

  const openDoseHistoryDay = (day, fromFocus = focus) => {
    if (!day) return;
    setSelectedDoseDate(day.date);
    setSelectedDoseId(null);
    navigate(SCREEN.HISTORY_DETAIL, fromFocus, { doseDate: day.date });
  };

  const openDoseRecordUpdate = (index = focus) => {
    const dose = selectedDoseDay?.doses[index];
    if (!selectedDoseDay || !dose) return;
    setSelectedDoseDate(selectedDoseDay.date);
    setSelectedDoseId(dose.id);
    setQuantity(dose.amount);
    setDecision(0);
    navigate(SCREEN.UPDATE_RECORD, index, {
      doseDate: selectedDoseDay.date,
      doseId: dose.id,
    });
  };

  const openDoseRecordAction = (index = focus) => {
    if (!selectedDoseDay || !selectedDoseRecord) return;
    const state = {
      doseDate: selectedDoseDay.date,
      doseId: selectedDoseRecord.id,
    };
    if (index === 0) {
      setQuantity(selectedDoseRecord.amount);
      navigate(SCREEN.QUANTITY, index, state);
      return;
    }
    if (index === 1) {
      setDecision(1);
      navigate(SCREEN.DELETE_DOSE_RECORD, index, state);
    }
  };

  const saveDoseQuantity = () => {
    if (!selectedDoseDay || !selectedDoseRecord) return;
    updateDoseDay(selectedDoseDay.date, (items) =>
      items.map((item) =>
        item.id === selectedDoseRecord.id
          ? {
              ...item,
              medicineName:
                item.medicineName || medicineName(item.medicineId),
              amount: quantity,
            }
          : item,
      ),
    );
    if (Number(window.history.state?.depth || 0) >= 2) {
      window.history.go(-2);
      return;
    }
    replace(SCREEN.HISTORY_DETAIL, {
      doseDate: selectedDoseDay.date,
      doseId: selectedDoseRecord.id,
    });
  };

  const deleteDoseRecord = () => {
    if (!selectedDoseDay || !selectedDoseRecord) return;
    const remainingDoses = selectedDoseDay.doses.filter(
      (dose) => dose.id !== selectedDoseRecord.id,
    );
    const keepEmptyToday = selectedDoseDay.date === todayDateKey;
    setDoseDays((days) => {
      const otherDays = days.filter(
        (day) => day.date !== selectedDoseDay.date,
      );
      if (!remainingDoses.length && !keepEmptyToday) return otherDays;
      return [
        {
          date: selectedDoseDay.date,
          updatedAt: new Date().toISOString(),
          doses: remainingDoses,
        },
        ...otherDays,
      ];
    });
    setSelectedDoseId(null);

    const returnToHistory = !remainingDoses.length && !keepEmptyToday;
    const historySteps = returnToHistory ? -3 : -2;
    if (
      Number(window.history.state?.depth || 0) >= Math.abs(historySteps)
    ) {
      window.history.go(historySteps);
      return;
    }
    replace(
      returnToHistory ? SCREEN.HISTORY : SCREEN.HISTORY_DETAIL,
      returnToHistory ? {} : { doseDate: selectedDoseDay.date },
    );
  };

  const homeItems = useMemo(
    () => [
      { label: t("home.medicineRecognition"), target: SCREEN.ADD_METHOD },
      {
        label: t("home.medicineQuestions"),
        target: SCREEN.MEDICINE_CHAT_MENU,
      },
      { label: t("home.recordMedicine"), target: SCREEN.DOSE_MENU },
      { label: t("home.myMedicines"), target: SCREEN.MEDICINES },
      { label: t("home.emergency"), target: SCREEN.EMERGENCY, state: "danger" },
      { label: t("home.language"), target: SCREEN.LANGUAGE },
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
          onEnter: () => {
            const item = homeItems[focus];
            if (item.target === SCREEN.MEDICINE_CHAT_MENU) startMedicineChat();
            else navigate(item.target);
          },
          onNumber: (number) => {
            if (number === 9) {
              navigate(SCREEN.REMINDER_ALERT);
              return;
            }
            const item = homeItems[number - 1];
            if (!item) return;
            if (item.target === SCREEN.MEDICINE_CHAT_MENU)
              startMedicineChat(number - 1);
            else navigate(item.target, number - 1);
          },
          content: (
            <div className="dense-list">
              {homeItems.map((item, index) => (
                <ListRow
                  key={item.label}
                  label={`${index + 1}  ${item.label}`}
                  state={item.state}
                  selected={focus === index}
                  onClick={() => {
                    if (item.target === SCREEN.MEDICINE_CHAT_MENU)
                      startMedicineChat(index);
                    else navigate(item.target, index);
                  }}
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
              <div className="dense-list">
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
              </div>
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
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(event) => {
                  const [file] = event.target.files;
                  if (!file) return;
                  navigate(SCREEN.RECOGNIZING);
                  void runRecognition({ kind: "photo", file });
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
                maxLength={200}
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

      case SCREEN.RECOGNIZING: {
        const failed = recognitionStatus === "error";
        const recognitionSource = recognitionSourceRef.current;
        const recognitionSourceLabel =
          recognitionSource?.kind === "photo"
            ? recognitionSource.file?.name
            : recognitionSource?.query;
        return {
          title: t("add.recognizingTitle"),
          count: 0,
          left: failed ? t("common.retry") : "",
          right: t(failed ? "common.back" : "common.cancel"),
          onLeft: failed ? retryRecognition : undefined,
          onEnter: failed ? retryRecognition : undefined,
          content: (
            <div
              className="processing"
              aria-live="polite"
              role={failed ? "alert" : "status"}
            >
              <p className="prompt">
                {failed ? t("add.recognitionFailed") : t("add.recognizing")}
              </p>
              {!failed && (
                <div
                  className="progress"
                  aria-label={t("add.recognizingTitle")}
                >
                  <span />
                </div>
              )}
              <p className={`helper${failed ? " input-error" : ""}`}>
                {failed
                  ? recognitionError
                  : recognitionSourceLabel || t("add.recognizingHelp")}
              </p>
            </div>
          ),
        };
      }

      case SCREEN.MATCHES: {
        const activateMatch = () => {
          const candidate = localizedCandidates[focus];
          if (candidate) {
            const existingMedicine = userMedicines.find(
              (medicine) =>
                medicine.catalogRecordId === candidate.recordId,
            );
            const medicine = {
              ...existingMedicine,
              id:
                existingMedicine?.id ||
                `catalog-${candidate.recordId}`,
              isCustom: true,
              isCatalog: true,
              catalogRecordId: candidate.recordId,
              recordId: candidate.recordId,
              sourceRecord: candidate.sourceRecord,
              customName: existingMedicine?.customName || candidate.name,
              strength:
                existingMedicine?.strength || candidate.strength || "",
              customDirections:
                existingMedicine?.customDirections || manualDirections.trim(),
              reminders: existingMedicine?.reminders || [],
            };

            setSavedManualMedicine(medicine);
            setSelectedMedicine(medicine);
            setSelectedReminderTimes(medicine.reminders);
            setDecision(0);
            setSelectedCandidate(candidate);
            navigate(SCREEN.DAILY);
            return;
          }
          openManualEntry("direct");
        };

        return {
          title: t("add.matchesTitle"),
          count: localizedCandidates.length + 1,
          left: localizedCandidates.length
            ? t("common.confirm")
            : t("common.retry"),
          right: t("common.back"),
          onLeft: localizedCandidates.length
            ? undefined
            : retryRecognition,
          onEnter: activateMatch,
          onNumber: (number) => {
            if (number >= 1 && number <= localizedCandidates.length + 1)
              setFocus(number - 1);
          },
          onArrowLeft: () =>
            setFocus((current) =>
              clamp(current - 1, 0, localizedCandidates.length),
            ),
          onArrowRight: () =>
            setFocus((current) =>
              clamp(current + 1, 0, localizedCandidates.length),
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
                manualHelp: t(
                  localizedCandidates.length
                    ? "matchCard.manualHelp"
                    : "matchCard.noMatchesManualHelp",
                ),
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
                    selectedCandidate?.name ||
                    t("medicines.manualEntry")}
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
          date: shortDateFor(todayDateKey),
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
                {...quantityLabelsFor("unitPill")}
              />
              <p className="helper">{t("dose.enterToRecord")}</p>
            </>
          ),
        };

      case SCREEN.DOSE_MENU: {
        const menuItems = [t("home.recordToday"), t("home.history")];
        const openDoseSection = (index = focus) => {
          navigate(index === 0 ? SCREEN.RECORD_TODAY : SCREEN.HISTORY, index);
        };

        return {
          title: t("home.recordMedicine"),
          count: menuItems.length,
          left: t("common.select"),
          right: t("common.back"),
          onEnter: () => openDoseSection(),
          onNumber: (number) => {
            if (number >= 1 && number <= menuItems.length)
              openDoseSection(number - 1);
          },
          content: (
            <div className="dense-list">
              {menuItems.map((label, index) => (
                <ListRow
                  key={label}
                  label={`${index + 1}  ${label}`}
                  selected={focus === index}
                  onClick={() => openDoseSection(index)}
                />
              ))}
            </div>
          ),
        };
      }

      case SCREEN.RECORD_TODAY:
        return {
          title: t("dose.recordTodayTitle"),
          date: shortDateFor(todayDateKey),
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
              medicine={`${index + 1}  ${doseMedicineName(dose)}`}
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
          date: shortDateFor(todayDateKey),
          time: "",
          count: historyDays.length,
          left: t("common.open"),
          right: t("common.back"),
          onEnter: () => openDoseHistoryDay(historyDays[focus]),
          onNumber: (number) => {
            const day = historyDays[number - 1];
            if (day) openDoseHistoryDay(day, number - 1);
          },
          content: historyDays.length ? (
            historyDays.map((day, index) => (
              <ListRow
                key={day.date}
                label={`${index + 1}  ${t("history.dayLabel", {
                  date: shortDateFor(day.date),
                  relative: day.relative,
                  done: day.done,
                  total: day.total,
                })}`}
                state={day.state}
                selected={focus === index}
                onClick={() => openDoseHistoryDay(day, index)}
              />
            ))
          ) : (
            <p className="helper centered">{t("history.empty")}</p>
          ),
        };

      case SCREEN.HISTORY_DETAIL:
        return {
          title: t("history.detailTitle"),
          count: selectedDoseDay?.doses.length || 0,
          left: t("common.update"),
          right: t("common.back"),
          onLeft: () => openDoseRecordUpdate(),
          onEnter: () => openDoseRecordUpdate(),
          onNumber: (number) => {
            const dose = selectedDoseDay?.doses[number - 1];
            if (!dose) return;
            setFocus(number - 1);
            setSelectedDoseId(dose.id);
          },
          content: (
            <>
              <p className="prompt">
                {selectedDoseDay
                  ? formatFullDoseDate(selectedDoseDay.date)
                  : t("history.empty")}
              </p>
              {selectedDoseDay?.doses.map((dose, index) => (
                <MedicineRow
                  key={dose.id}
                  medicine={`${index + 1}  ${doseMedicineName(dose)}`}
                  detail={doseDetail(dose)}
                  checked={dose.taken}
                  selected={focus === index}
                  onClick={() => openDoseRecordUpdate(index)}
                />
              ))}
            </>
          ),
        };

      case SCREEN.UPDATE_RECORD:
        return {
          title: t("history.updateTitle"),
          count: 2,
          left: t("common.select"),
          right: t("common.back"),
          onEnter: () => openDoseRecordAction(),
          onNumber: (number) => openDoseRecordAction(number - 1),
          content: (
            <>
              {selectedDoseRecord ? (
                <>
                  <MedicineRow
                    medicine={doseMedicineName(selectedDoseRecord)}
                    detail={doseDetail(selectedDoseRecord)}
                    checked={selectedDoseRecord.taken}
                  />
                  <ListRow
                    label={`1  ${t("history.editQuantity")}`}
                    selected={focus === 0}
                    onClick={() => openDoseRecordAction(0)}
                  />
                  <ListRow
                    label={`2  ${t("history.deleteRecord")}`}
                    state="danger"
                    selected={focus === 1}
                    onClick={() => openDoseRecordAction(1)}
                  />
                </>
              ) : (
                <p className="helper centered">{t("history.empty")}</p>
              )}
            </>
          ),
        };

      case SCREEN.DELETE_DOSE_RECORD:
        return {
          title: t("history.deleteTitle"),
          count: 2,
          left: t("common.confirm"),
          right: t("common.back"),
          horizontal: true,
          onEnter: () => {
            if (decision === 0) deleteDoseRecord();
            else goBack();
          },
          content: (
            <>
              {selectedDoseRecord && (
                <MedicineRow
                  medicine={doseMedicineName(selectedDoseRecord)}
                  detail={t("history.deleteWarning")}
                  checked={selectedDoseRecord.taken}
                />
              )}
              <Decision
                selected={decision}
                left={t("history.deleteConfirm")}
                right={t("common.cancel")}
                onSelect={setDecision}
                ariaLabel={t("history.deleteTitle")}
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
          onEnter: saveDoseQuantity,
          content: (
            <>
              <p className="prompt">{t("dose.quantityPrompt")}</p>
              <QuantityPicker
                value={quantity}
                onChange={adjustQuantity}
                {...quantityLabelsFor(selectedDoseRecord?.unit)}
              />
              <p className="helper">{t("dose.quantityHelp")}</p>
            </>
          ),
        };

      case SCREEN.MEDICINES: {
        const archivedIndex = activeMedicines.length;
        const itemCount = archivedIndex + (archivedMedicines.length ? 1 : 0);
        const activateMedicineMenu = (index) => {
          if (archivedMedicines.length && index === archivedIndex) {
            navigate(SCREEN.ARCHIVED_MEDICINES, index);
            return;
          }
          const medicine = activeMedicines[index];
          if (!medicine) return;
          setSelectedMedicine(medicine);
          navigate(SCREEN.MEDICINE_DETAIL, index);
        };

        return {
          title: t("medicines.title"),
          count: itemCount,
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
        const medicineDetail = selectedMedicine.isCatalog
          ? selectedMedicine.strength ||
            selectedMedicine.sourceRecord?.licenseNumber ||
            t("medicines.catalogEntry")
          : selectedMedicine.isCustom
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
          onLeft: saveDirections,
          onEnter: () => setEditDirectionsEditing((editing) => !editing),
          onInputKey: () =>
            setEditDirectionsEditing((editing) => !editing),
          content: (
            <form
              className="manual-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveDirections();
              }}
            >
              <FocusableField
                id="medicine-directions"
                label={t("medicines.directionsLabel")}
                value={editDirections}
                placeholder={t("medicines.directionsPlaceholder")}
                selected
                editing={editDirectionsEditing}
                multiline
                onChange={(event) => setEditDirections(event.target.value)}
                onSelect={() => setFocus(0)}
                onEditingChange={setEditDirectionsEditing}
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
          onArrowUp: () => scrollScreenContent(-1),
          onArrowDown: () => scrollScreenContent(1),
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

      case SCREEN.MEDICINE_CHAT_MENU: {
        const openChatSection = (index = focus) => {
          if (index === 0) {
            startNewChatSession();
            setChatMedicine(null);
            setChatRecognitionText("");
            navigate(SCREEN.MEDICINE_CHAT_SEARCH_MENU, index);
            return;
          }
          if (index === 1) {
            const chatId = startNewChatSession();
            setChatMedicine(null);
            setChatRecognitionText("");
            navigate(SCREEN.MEDICINE_CHAT_CONTEXT, index, { chatId });
            return;
          }
          setChatMedicine(null);
          setChatRecognitionText("");
          navigate(SCREEN.MEDICINE_CHAT_ASSISTANT_MENU, index);
        };

        const menuItems = [
          t("chat.searchMedicine"),
          t("chat.addPackageText"),
          t("chat.assistant"),
        ];

        return {
          title: t("chat.title"),
          count: menuItems.length,
          left: t("common.select"),
          right: t("common.back"),
          onEnter: () => openChatSection(),
          onNumber: (number) => {
            if (number >= 1 && number <= menuItems.length)
              openChatSection(number - 1);
          },
          content: (
            <div className="dense-list medicine-chat-menu">
              {menuItems.map((label, index) => (
                <ListRow
                  key={label}
                  label={`${index + 1}  ${label}`}
                  selected={focus === index}
                  onClick={() => openChatSection(index)}
                />
              ))}
            </div>
          ),
        };
      }

      case SCREEN.MEDICINE_CHAT_SEARCH_MENU: {
        const menuItems = [t("chat.textSearch"), t("chat.selectFromBag")];
        const openSearchMethod = (index = focus) => {
          navigate(
            index === 0
              ? SCREEN.MEDICINE_CHAT_MEDICINE
              : SCREEN.MEDICINE_CHAT_BAG,
            index,
          );
        };

        return {
          title: t("chat.searchTitle"),
          count: menuItems.length,
          left: t("common.select"),
          right: t("common.back"),
          onEnter: () => openSearchMethod(),
          onNumber: (number) => {
            if (number >= 1 && number <= menuItems.length)
              openSearchMethod(number - 1);
          },
          content: (
            <div className="dense-list medicine-chat-menu">
              {menuItems.map((label, index) => (
                <ListRow
                  key={label}
                  label={`${index + 1}  ${label}`}
                  selected={focus === index}
                  onClick={() => openSearchMethod(index)}
                />
              ))}
            </div>
          ),
        };
      }

      case SCREEN.MEDICINE_CHAT_ASSISTANT_MENU: {
        const menuItems = [t("chat.history"), t("chat.newChat")];
        const openAssistantSection = (index = focus) => {
          if (index === 0) {
            navigate(SCREEN.MEDICINE_CHAT_HISTORY, index);
            return;
          }
          const chatId = startNewChatSession();
          setChatMedicine(null);
          setChatRecognitionText("");
          navigate(SCREEN.MEDICINE_CHAT, index, { chatId });
        };

        return {
          title: t("chat.assistant"),
          count: menuItems.length,
          left: t("common.select"),
          right: t("common.back"),
          onEnter: () => openAssistantSection(),
          onNumber: (number) => {
            if (number >= 1 && number <= menuItems.length)
              openAssistantSection(number - 1);
          },
          content: (
            <div className="dense-list medicine-chat-menu">
              {menuItems.map((label, index) => (
                <ListRow
                  key={label}
                  label={`${index + 1}  ${label}`}
                  selected={focus === index}
                  onClick={() => openAssistantSection(index)}
                />
              ))}
            </div>
          ),
        };
      }

      case SCREEN.MEDICINE_CHAT_HISTORY: {
        if (!chatSessions.length) {
          return {
            title: t("chat.history"),
            count: 0,
            left: null,
            right: t("common.back"),
            content: (
              <p className="chat-history-empty">{t("chat.historyEmpty")}</p>
            ),
          };
        }

        const clearIndex = chatSessions.length;
        const activateHistoryItem = (index = focus) => {
          if (index === clearIndex) {
            setDecision(1);
            navigate(SCREEN.MEDICINE_CHAT_CLEAR_HISTORY, clearIndex);
            return;
          }
          const session = chatSessions[index];
          if (session) openStoredChatSession(session, index);
        };

        return {
          title: t("chat.history"),
          count: chatSessions.length + 1,
          left:
            focus === clearIndex
              ? t("common.confirm")
              : t("common.open"),
          right: t("common.back"),
          onEnter: () => activateHistoryItem(),
          onNumber: (number) => {
            if (number >= 1 && number <= chatSessions.length) {
              activateHistoryItem(number - 1);
            }
          },
          content: (
            <div className="chat-history-list">
              {chatSessions.map((session, index) => {
                const lastMessage =
                  session.messages[session.messages.length - 1];
                const preview =
                  lastMessage?.reply?.answer || lastMessage?.content || "";
                const medicine =
                  session.medicine?.displayName ||
                  session.medicine?.englishName ||
                  t("chat.generalChat");
                return (
                  <button
                    type="button"
                    className={`chat-history-row${
                      focus === index ? " is-selected" : ""
                    }`}
                    onClick={() => activateHistoryItem(index)}
                    tabIndex={-1}
                    aria-current={focus === index ? "true" : undefined}
                    key={session.id}
                  >
                    <span className="chat-history-copy">
                      <strong>{`${index + 1}  ${session.title}`}</strong>
                      <small>
                        {medicine} · {formatChatHistoryDate(session.updatedAt)}
                      </small>
                      <small>{preview}</small>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                );
              })}
              <ListRow
                label={t("chat.clearHistory")}
                selected={focus === clearIndex}
                state="danger"
                trailing=""
                onClick={() => activateHistoryItem(clearIndex)}
              />
            </div>
          ),
        };
      }

      case SCREEN.MEDICINE_CHAT_CLEAR_HISTORY: {
        const finishClearHistory = () => {
          if (decision === 0) clearStoredChatSessions();
          goBack();
        };

        return {
          title: t("chat.clearHistoryTitle"),
          count: 2,
          left: t("common.confirm"),
          right: t("common.back"),
          horizontal: true,
          onEnter: finishClearHistory,
          onLeft: finishClearHistory,
          content: (
            <>
              <p className="prompt">{t("chat.clearHistoryConfirm")}</p>
              <Decision
                selected={decision}
                left={t("chat.clearHistoryAction")}
                right={t("common.cancel")}
                onSelect={setDecision}
                ariaLabel={t("chat.clearHistoryTitle")}
              />
            </>
          ),
        };
      }

      case SCREEN.MEDICINE_CHAT_MEDICINE: {
        const records = chatSearchResult?.records || [];
        const itemCount = records.length + 1;
        const activateChatMedicineItem = (index = focus) => {
          if (index === 0) {
            if (chatEditingField === "medicine-search") leaveChatInputMode();
            else enterChatInputMode("medicine-search");
            return;
          }

          const record = records[index - 1];
          if (record) {
            const chatId = startNewChatSession();
            setChatRecognitionText("");
            setChatMedicine(record);
            navigate(SCREEN.MEDICINE_CHAT_CONTEXT, index, { chatId });
          }
        };

        return {
          title: t("chat.searchTitle"),
          count: itemCount,
          left: focus === 0 ? t("chat.searchAction") : t("common.select"),
          right: t("common.back"),
          onLeft: () => {
            if (focus === 0) searchChatMedicine();
            else activateChatMedicineItem();
          },
          onEnter: () => activateChatMedicineItem(),
          onInputKey: () => activateChatMedicineItem(),
          onNumber: (number) => {
            if (number >= 1 && number <= itemCount) setFocus(number - 1);
          },
          content: (
            <div className="chat-medicine-search-page">
              <form
                className="manual-form chat-search-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  searchChatMedicine();
                }}
              >
                <FocusableField
                  id="chat-medicine-search"
                  label={t("chat.searchLabel")}
                  value={chatSearchQuery}
                  placeholder={t("chat.searchPlaceholder")}
                  selected={focus === 0}
                  editing={chatEditingField === "medicine-search"}
                  disabled={chatSearching}
                  maxLength={200}
                  onChange={(event) => {
                    setChatSearchQuery(event.target.value);
                    setChatSearchError("");
                  }}
                  onSelect={() => setFocus(0)}
                  onEditingChange={(editing) => {
                    if (editing) enterChatInputMode("medicine-search");
                    else if (chatEditingField === "medicine-search")
                      leaveChatInputMode();
                  }}
                />
              </form>
              {chatSearching && (
                <p className="chat-search-status" role="status">
                  {t("chat.searching")}
                </p>
              )}
              {chatSearchError && (
                <p className="chat-search-status input-error" role="alert">
                  {chatSearchError}
                </p>
              )}
              {chatSearchResult && (
                <p className="chat-search-status" aria-live="polite">
                  {chatSearchResult.total
                    ? t("chat.results", { count: chatSearchResult.total })
                    : t("chat.noResults")}
                </p>
              )}
              <div className="medicine-list chat-medicine-results">
                {records.map((record, index) => (
                  <MedicineRow
                    key={record.recordId}
                    medicine={`${index + 2}  ${record.displayName || record.englishName}`}
                    detail={record.licenseNumber}
                    selected={focus === index + 1}
                    checked={chatMedicine?.recordId === record.recordId}
                    onClick={() => activateChatMedicineItem(index + 1)}
                  />
                ))}
              </div>
            </div>
          ),
        };
      }

      case SCREEN.MEDICINE_CHAT_BAG: {
        const activateBagMedicine = (index = focus) => {
          const candidate = chatBagCandidates[index];
          if (!candidate) return;
          const chatId = startNewChatSession();
          setChatRecognitionText("");
          setChatMedicine({
            ...candidate.sourceMedicine,
            displayName: candidate.name,
            englishName: candidate.name,
          });
          navigate(SCREEN.MEDICINE_CHAT_CONTEXT, index, { chatId });
        };

        if (!chatBagCandidates.length) {
          return {
            title: t("chat.bagTitle"),
            count: 0,
            left: null,
            right: t("common.back"),
            content: <p className="chat-history-empty">{t("chat.emptyBag")}</p>,
          };
        }

        return {
          title: t("chat.bagTitle"),
          count: chatBagCandidates.length,
          left: t("common.select"),
          right: t("common.back"),
          onEnter: () => activateBagMedicine(),
          onNumber: (number) => {
            if (number >= 1 && number <= chatBagCandidates.length)
              setFocus(number - 1);
          },
          onArrowLeft: () =>
            setFocus((current) =>
              clamp(current - 1, 0, chatBagCandidates.length - 1),
            ),
          onArrowRight: () =>
            setFocus((current) =>
              clamp(current + 1, 0, chatBagCandidates.length - 1),
            ),
          onArrowUp: () => scrollMatchCard(-1),
          onArrowDown: () => scrollMatchCard(1),
          content: (
            <MedicineMatchDeck
              candidates={chatBagCandidates}
              index={focus}
              onChange={setFocus}
              onActivate={activateBagMedicine}
              scrollRef={matchScrollRef}
              includeManual={false}
              labels={{
                primaryEffect: t("matchCard.primaryEffect"),
                sideEffects: t("matchCard.sideEffects"),
                indications: t("matchCard.indications"),
                manualTitle: "",
                manualHelp: "",
              }}
            />
          ),
        };
      }

      case SCREEN.MEDICINE_CHAT_CONTEXT:
        return {
          title: t("chat.packageTitle"),
          count: 1,
          left: t("chat.next"),
          right: t("common.back"),
          onLeft: completeChatSetup,
          onEnter: () => {
            if (chatEditingField === "recognition") leaveChatInputMode();
            else enterChatInputMode("recognition");
          },
          onInputKey: () => {
            if (chatEditingField === "recognition") leaveChatInputMode();
            else enterChatInputMode("recognition");
          },
          content: (
            <form
              className="manual-form chat-context-form"
              onSubmit={(event) => {
                event.preventDefault();
                completeChatSetup();
              }}
            >
              {chatMedicine && (
                <p className="chat-selected-medicine">
                  {t("chat.selectedMedicine", {
                    name: chatMedicine.displayName || chatMedicine.englishName,
                  })}
                </p>
              )}
              <FocusableField
                id="chat-recognition-text"
                label={t("chat.packageLabel")}
                value={chatRecognitionText}
                placeholder={t("chat.packagePlaceholder")}
                selected
                editing={chatEditingField === "recognition"}
                multiline
                maxLength={6000}
                onChange={(event) => setChatRecognitionText(event.target.value)}
                onSelect={() => setFocus(0)}
                onEditingChange={(editing) => {
                  if (editing) enterChatInputMode("recognition");
                  else if (chatEditingField === "recognition")
                    leaveChatInputMode();
                }}
              />
              <p className="helper">{t("chat.packageHelp")}</p>
            </form>
          ),
        };

      case SCREEN.MEDICINE_CHAT:
        return {
          title: t("chat.title"),
          count: 1,
          left: t("chat.send"),
          right: t("common.back"),
          onLeft: () => medicineChatRef.current?.send(),
          onEnter: () => medicineChatRef.current?.activate(),
          onInputKey: () => medicineChatRef.current?.activate(),
          onArrowUp: () => medicineChatRef.current?.scroll(-1),
          onArrowDown: () => medicineChatRef.current?.scroll(1),
          onArrowLeft: () => medicineChatRef.current?.move(-1),
          onArrowRight: () => medicineChatRef.current?.move(1),
          content: (
            <div className="medicine-chat-screen">
              <MedicineChat
                ref={medicineChatRef}
                selectedMedicine={chatMedicine}
                recognitionText={chatRecognitionText}
                messages={chatMessages}
                initialDisclaimer={chatDisclaimer}
                onMessagesChange={saveChatMessages}
                onChooseMedicine={chooseChatCandidate}
                onSelectMedicine={setChatMedicine}
              />
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
          onArrowUp: () => scrollScreenContent(-1),
          onArrowDown: () => scrollScreenContent(1),
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
          onArrowUp: () => scrollScreenContent(-1),
          onArrowDown: () => scrollScreenContent(1),
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
          onArrowUp: () => scrollScreenContent(-1),
          onArrowDown: () => scrollScreenContent(1),
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

      case SCREEN.RESET_DEMO: {
        const finishDemoReset = () => {
          if (decision === 0) resetDemoData();
          else goBack();
        };

        return {
          title: t("demoReset.title"),
          count: 2,
          left: t("common.confirm"),
          right: t("common.back"),
          emergency: true,
          horizontal: true,
          onEnter: finishDemoReset,
          onLeft: finishDemoReset,
          onArrowUp: () => scrollScreenContent(-1),
          onArrowDown: () => scrollScreenContent(1),
          content: (
            <div className="demo-reset-content">
              <FeedbackCard danger title={t("demoReset.warningTitle")}>
                <span>{t("demoReset.description")}</span>
              </FeedbackCard>
              <Decision
                selected={decision}
                left={t("demoReset.yes")}
                right={t("demoReset.no")}
                onSelect={setDecision}
                ariaLabel={t("demoReset.choiceLabel")}
              />
              <p className="helper centered">
                {t("demoReset.irreversible")}
              </p>
            </div>
          ),
        };
      }

      case SCREEN.LANGUAGE: {
        const languages = [
          { code: "zh-TW", label: t("language.zhTW") },
          { code: "en-US", label: t("language.enUS") },
        ];
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

    const isDemoResetKey =
      event.key === "0" || event.code === "Numpad0";
    if (screen === SCREEN.HOME && isDemoResetKey) {
      event.preventDefault();
      if (!event.repeat) registerDemoResetPress();
      return;
    }
    if (screen === SCREEN.HOME && !event.repeat) {
      demoResetPressesRef.current = 0;
      demoResetLastPressRef.current = 0;
    }

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
