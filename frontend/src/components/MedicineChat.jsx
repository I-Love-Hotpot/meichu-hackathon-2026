import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { chatWithMedicineAssistant } from "../api/medicine.js";
import { createChatEntityId } from "../hooks/useStoredChatSessions.js";
import { FocusableField } from "./Controls.jsx";
import "./MedicineChat.css";

const fallbackDisclaimer =
  "AI responses are for reference only. Follow the prescription and package label, and consult a doctor or pharmacist when unsure.";
const firstSourceImageUrl = (value = "") =>
  value
    .split(";;;")
    .map((item) => item.trim())
    .find((item) => /^https?:\/\//i.test(item)) || "";

const MedicineChat = forwardRef(function MedicineChat(
  {
    selectedMedicine,
    recognitionText = "",
    messages = [],
    initialDisclaimer = "",
    onMessagesChange,
    onChooseMedicine,
    onSelectMedicine,
  },
  ref,
) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [disclaimer, setDisclaimer] = useState(
    initialDisclaimer || fallbackDisclaimer,
  );
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [focusedId, setFocusedId] = useState("medicine-question");
  const [editingId, setEditingId] = useState(null);
  const rootRef = useRef(null);
  const formRef = useRef(null);
  const requestRef = useRef(null);
  const questionValueRef = useRef("");

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, sending, error]);

  const selectFocus = useCallback((id) => {
    setFocusedId(id);
    window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector(`[data-chat-focus="${id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }, []);

  const activateQuestion = useCallback(() => {
    const questionField = rootRef.current?.querySelector(
      '[data-chat-focus="medicine-question"]',
    );
    if (!questionField || questionField.disabled) return;
    setFocusedId("medicine-question");
    questionField.click();
  }, []);

  const activateFocused = useCallback(() => {
    if (focusedId === "medicine-question") {
      activateQuestion();
      return;
    }
    const target = rootRef.current?.querySelector(
      `[data-chat-focus="${focusedId}"]`,
    );
    if (!target || target.disabled) return;
    target.click();
  }, [activateQuestion, focusedId]);

  const submitQuestion = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return;
    }
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }, []);

  const scrollConversation = useCallback(
    (direction) => {
      setEditingId(null);
      const root = rootRef.current;
      const scroller = root?.parentElement;
      if (!root || !scroller) return;

      const elements = [...root.querySelectorAll("[data-chat-focus]")].filter(
        (element) => !element.disabled,
      );
      const currentIndex = elements.findIndex(
        (element) => element.dataset.chatFocus === focusedId,
      );
      const distance = Math.max(32, Math.round(scroller.clientHeight * 0.7));
      const maxScrollTop = Math.max(
        0,
        scroller.scrollHeight - scroller.clientHeight,
      );
      let targetScrollTop = Math.max(
        0,
        Math.min(maxScrollTop, scroller.scrollTop + direction * distance),
      );
      const scrollerRect = scroller.getBoundingClientRect();
      const sweepStart = Math.min(scroller.scrollTop, targetScrollTop);
      const sweepEnd =
        Math.max(scroller.scrollTop, targetScrollTop) + scroller.clientHeight;
      const focusCandidates = elements
        .map((element, index) => {
          const rect = element.getBoundingClientRect();
          const top = rect.top - scrollerRect.top + scroller.scrollTop;
          return { element, index, top, bottom: top + rect.height };
        })
        .filter(
          ({ index, top, bottom }) =>
            (direction < 0 ? index < currentIndex : index > currentIndex) &&
            bottom > sweepStart &&
            top < sweepEnd,
        );
      const nextFocus =
        direction < 0
          ? focusCandidates.at(-1)
          : focusCandidates.at(0);

      if (nextFocus) {
        setFocusedId(nextFocus.element.dataset.chatFocus);
        if (nextFocus.top < targetScrollTop)
          targetScrollTop = nextFocus.top;
        else if (nextFocus.bottom > targetScrollTop + scroller.clientHeight)
          targetScrollTop = nextFocus.bottom - scroller.clientHeight;
      }

      scroller.scrollTo({
        top: Math.max(0, Math.min(maxScrollTop, targetScrollTop)),
        behavior: "smooth",
      });
    },
    [focusedId],
  );

  const moveFocus = useCallback(
    (direction) => {
      setEditingId(null);
      const elements = [
        ...(rootRef.current?.querySelectorAll("[data-chat-focus]") || []),
      ].filter((element) => !element.disabled);
      if (elements.length <= 1) {
        scrollConversation(direction);
        return;
      }
      const currentIndex = elements.findIndex(
        (element) => element.dataset.chatFocus === focusedId,
      );
      const startIndex = currentIndex < 0 ? elements.length - 1 : currentIndex;
      const nextIndex = Math.max(
        0,
        Math.min(elements.length - 1, startIndex + direction),
      );
      const nextId = elements[nextIndex]?.dataset.chatFocus;
      if (nextId) selectFocus(nextId);
    },
    [focusedId, scrollConversation, selectFocus],
  );

  useImperativeHandle(
    ref,
    () => ({
      activate: activateFocused,
      send: submitQuestion,
      move: moveFocus,
      scroll: scrollConversation,
    }),
    [activateFocused, moveFocus, scrollConversation, submitQuestion],
  );

  const handleEditingChange = useCallback((id, editing) => {
    setFocusedId(id);
    setEditingId(editing ? id : null);
    if (!editing) {
      window.requestAnimationFrame(() => {
        rootRef.current?.focus({ preventScroll: true });
      });
    }
  }, []);

  const focusProps = (id) => ({
    "data-chat-focus": id,
    tabIndex: -1,
    onFocus: () => setFocusedId(id),
  });

  const chooseMedicine = (record) => {
    if (requestRef.current) return;
    onChooseMedicine?.(record);
    setError("");
    setDisclaimer(fallbackDisclaimer);
    const nextQuestion = t("chat.explainAppearance");
    questionValueRef.current = nextQuestion;
    setQuestion(nextQuestion);
    setEditingId(null);
    selectFocus("medicine-question");
  };

  async function send(event) {
    event.preventDefault();
    const fieldValue = rootRef.current?.querySelector(
      "#medicine-question",
    )?.value;
    const message = (
      typeof fieldValue === "string"
        ? fieldValue
        : questionValueRef.current || question
    ).trim();
    if (!message || requestRef.current) return;

    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 125000);
    setSending(true);
    setPendingQuestion(message);
    setError("");

    try {
      const recognition = {};
      const trimmedRecognitionText = recognitionText.trim();
      const selectedMedicineName =
        selectedMedicine?.displayName || selectedMedicine?.englishName;
      if (trimmedRecognitionText) recognition.text = trimmedRecognitionText;
      if (!selectedMedicine?.recordId && selectedMedicineName) {
        recognition.medications = [
          {
            name: selectedMedicineName,
            ...(selectedMedicine.strength
              ? { strength: selectedMedicine.strength }
              : {}),
          },
        ];
      }

      const data = await chatWithMedicineAssistant(
        {
          message,
          history: messages
            .slice(-20)
            .map(({ role, content }) => ({ role, content })),
          ...(selectedMedicine?.recordId
            ? { selectedMedicineId: selectedMedicine.recordId }
            : {}),
          ...(Object.keys(recognition).length ? { recognition } : {}),
        },
        { signal: controller.signal },
      );

      const now = new Date().toISOString();
      const resolvedMedicine =
        data.catalog?.status === "matched" && data.sources?.length === 1
          ? data.sources[0]
          : selectedMedicine;
      const nextDisclaimer = data.disclaimer || fallbackDisclaimer;
      const nextMessages = [
        ...messages,
        {
          id: createChatEntityId("message"),
          role: "user",
          content: message,
          createdAt: now,
        },
        {
          id: createChatEntityId("message"),
          role: "assistant",
          content: [
            data.reply.answer,
            ...data.reply.warnings,
            ...data.reply.followUpQuestions,
          ].join("\n"),
          reply: data.reply,
          sources: data.sources || [],
          catalog: data.catalog,
          createdAt: now,
        },
      ];
      onMessagesChange?.(nextMessages, {
        medicine: resolvedMedicine,
        disclaimer: nextDisclaimer,
      });
      if (resolvedMedicine !== selectedMedicine) {
        onSelectMedicine?.(resolvedMedicine);
      }
      setDisclaimer(nextDisclaimer);
      questionValueRef.current = "";
      setQuestion("");
    } catch (failure) {
      setError(
        failure.name === "AbortError"
          ? t("chat.requestTimedOut")
          : failure.status === 0
            ? t("chat.chatNetworkError")
            : failure.message || t("chat.chatUnavailable"),
      );
    } finally {
      window.clearTimeout(timeout);
      requestRef.current = null;
      setSending(false);
      setPendingQuestion("");
      setEditingId(null);
      selectFocus("medicine-question");
    }
  }

  const medicineName =
    selectedMedicine?.displayName || selectedMedicine?.englishName;

  return (
    <section
      ref={rootRef}
      className="medicine-chat"
      aria-label="Medicine question chat"
      tabIndex={-1}
    >
      <div
        className="chat-messages"
        role="log"
        aria-label="Chat history"
        aria-live="polite"
        aria-relevant="additions text"
      >
        <article className="chat-assistant-header">
          <strong>{t("chat.assistant")}</strong>
          <p>
            {medicineName
              ? t("chat.askAbout", { name: medicineName })
              : t("chat.includeMedicineName")}
            {recognitionText.trim() && ` ${t("chat.packageAdded")}`}
          </p>
        </article>

        {messages.map((item, index) => (
          <article
            key={item.id || index}
            className={`chat-bubble ${item.role}`}
          >
            <strong>
              {item.role === "user" ? t("chat.you") : t("chat.assistant")}
            </strong>
            <p>{item.reply ? item.reply.answer : item.content}</p>
            {item.reply?.warnings.length > 0 && (
              <div className="chat-warnings">
                <strong>{t("chat.important")}</strong>
                <ul>
                  {item.reply.warnings.map((warning, warningIndex) => (
                    <li key={warningIndex}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {item.reply?.followUpQuestions.length > 0 && (
              <div className="chat-followups">
                <strong>{t("chat.helpfulDetails")}</strong>
                <ul>
                  {item.reply.followUpQuestions.map(
                    (followup, followupIndex) => (
                      <li key={followupIndex}>{followup}</li>
                    ),
                  )}
                </ul>
              </div>
            )}
            {item.sources?.length > 0 && (
              <section
                className="chat-sources"
                aria-label={t("chat.sourceData")}
              >
                <strong>
                  {item.catalog?.status === "ambiguous"
                    ? t("chat.selectCandidate")
                    : t("chat.sourceData")}{" "}
                  ({item.catalog?.fileName || "42_2.csv"})
                </strong>
                {item.sources.map((record, sourceIndex) => {
                  const sourceId = `source-image-${index}-${sourceIndex}`;
                  const askId = `source-ask-${index}-${sourceIndex}`;
                  const sourceImageUrl = firstSourceImageUrl(record.imageUrl);
                  return (
                    <div className="source-record" key={record.recordId}>
                      <strong>
                        {record.displayName || record.englishName}
                      </strong>
                      <p>{record.licenseNumber}</p>
                      <dl>
                        {Object.entries({
                          englishName: t("chat.englishName"),
                          shape: t("chat.shape"),
                          dosageForm: t("chat.dosageForm"),
                          color: t("chat.color"),
                          odor: t("chat.odor"),
                          scoreLine: t("chat.scoreLine"),
                          size: t("chat.appearanceSize"),
                          imprint1: t("chat.imprint1"),
                          imprint2: t("chat.imprint2"),
                        }).map(([field, label]) => (
                          <div key={field}>
                            <dt>{label}</dt>
                            <dd>{record[field] || t("chat.notProvided")}</dd>
                          </div>
                        ))}
                      </dl>
                      {sourceImageUrl && (
                        <a
                          className={
                            focusedId === sourceId ? "is-selected" : ""
                          }
                          href={sourceImageUrl}
                          target="_blank"
                          rel="noreferrer"
                          {...focusProps(sourceId)}
                        >
                          {t("chat.openSourceImage")}
                        </a>
                      )}
                      {item.catalog?.status === "ambiguous" && (
                        <button
                          type="button"
                          className={
                            focusedId === askId ? "is-selected" : ""
                          }
                          disabled={sending}
                          onClick={() => chooseMedicine(record)}
                          {...focusProps(askId)}
                        >
                          {t("chat.askThisMedicine")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </section>
            )}
          </article>
        ))}

        {sending && (
          <>
            <article className="chat-bubble user">
              <strong>{t("chat.you")}</strong>
              <p>{pendingQuestion}</p>
            </article>
            <p className="chat-replying" role="status">
              {t("chat.replying")}
            </p>
          </>
        )}
        {error && (
          <p className="chat-error" role="alert">
            {error} {t("chat.retryKept")}
          </p>
        )}
      </div>

      <form ref={formRef} className="chat-form" onSubmit={send}>
        <FocusableField
          id="medicine-question"
          label={t("chat.questionLabel")}
          multiline
          rows={2}
          value={question}
          maxLength={2000}
          disabled={sending}
          focusId="medicine-question"
          className="chat-focusable-field"
          selected={focusedId === "medicine-question"}
          editing={editingId === "medicine-question"}
          onSelect={() => setFocusedId("medicine-question")}
          onEditingChange={(editing) =>
            handleEditingChange("medicine-question", editing)
          }
          onChange={(event) => {
            questionValueRef.current = event.target.value;
            setQuestion(event.target.value);
          }}
          placeholder={t("chat.questionPlaceholder")}
        />
      </form>

      <p className="chat-disclaimer">{disclaimer}</p>
      <p className="chat-privacy">
        {t("chat.privacy")}
      </p>
    </section>
  );
});

export default MedicineChat;
