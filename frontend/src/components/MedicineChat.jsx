import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { FocusableField } from "./Controls.jsx";
import "./MedicineChat.css";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const disclaimer =
  "AI responses are for reference only. Follow the prescription and package label, and consult a doctor or pharmacist when unsure.";

const MedicineChat = forwardRef(function MedicineChat(
  {
    selectedMedicine,
    recognitionText = "",
    onSelectMedicine,
  },
  ref,
) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [focusedId, setFocusedId] = useState("medicine-question");
  const [editingId, setEditingId] = useState(null);
  const rootRef = useRef(null);
  const formRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroller = rootRef.current?.parentElement;
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
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

  const submitQuestion = useCallback(() => {
    formRef.current?.requestSubmit();
  }, []);

  const scrollConversation = useCallback((direction) => {
    setEditingId(null);
    const scroller = rootRef.current?.parentElement;
    if (!scroller) return;
    const distance = Math.max(32, Math.round(scroller.clientHeight * 0.7));
    scroller.scrollBy({ top: direction * distance, behavior: "smooth" });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      activate: activateQuestion,
      send: submitQuestion,
      scroll: scrollConversation,
    }),
    [activateQuestion, scrollConversation, submitQuestion],
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
    onSelectMedicine?.(record);
    setMessages([]);
    setError("");
    setQuestion("Please explain the appearance information for this medicine.");
    setEditingId(null);
    selectFocus("medicine-question");
  };

  async function send(event) {
    event.preventDefault();
    const message = question.trim();
    if (!message || requestRef.current) return;

    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 125000);
    setSending(true);
    setPendingQuestion(message);
    setError("");

    try {
      const response = await fetch(`${apiBase}/api/medicine/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          history: messages
            .slice(-20)
            .map(({ role, content }) => ({ role, content })),
          ...(selectedMedicine?.recordId
            ? { selectedMedicineId: selectedMedicine.recordId }
            : {}),
          ...(recognitionText.trim()
            ? { recognition: { text: recognitionText.trim() } }
            : {}),
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error(
          "The server returned an invalid response. Please try again.",
        );
      }

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error || "The medicine assistant is temporarily unavailable.",
        );
      }
      if (
        typeof data.reply?.answer !== "string" ||
        !Array.isArray(data.reply.warnings) ||
        !Array.isArray(data.reply.followUpQuestions)
      ) {
        throw new Error(
          "The server returned an invalid response. Please try again.",
        );
      }

      setMessages((previous) => [
        ...previous,
        { role: "user", content: message },
        {
          role: "assistant",
          content: [
            data.reply.answer,
            ...data.reply.warnings,
            ...data.reply.followUpQuestions,
          ].join("\n"),
          reply: data.reply,
          sources: data.sources || [],
          catalog: data.catalog,
        },
      ]);
      if (data.catalog?.status === "matched" && data.sources?.length === 1) {
        onSelectMedicine?.(data.sources[0]);
      }
      setQuestion("");
    } catch (failure) {
      setError(
        failure.name === "AbortError"
          ? "The request timed out. Please try again."
          : failure.message === "Failed to fetch"
            ? "Cannot connect to the medicine assistant. Check the network and try again."
            : failure.message,
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
              ? `Ask a question about ${medicineName}.`
              : "Include the medicine name in your question."}
            {recognitionText.trim() && " Package text has also been added."}
          </p>
        </article>

        {messages.map((item, index) => (
          <article key={index} className={`chat-bubble ${item.role}`}>
            <strong>
              {item.role === "user" ? "You" : t("chat.assistant")}
            </strong>
            <p>{item.reply ? item.reply.answer : item.content}</p>
            {item.reply?.warnings.length > 0 && (
              <div className="chat-warnings">
                <strong>Important</strong>
                <ul>
                  {item.reply.warnings.map((warning, warningIndex) => (
                    <li key={warningIndex}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {item.reply?.followUpQuestions.length > 0 && (
              <div className="chat-followups">
                <strong>Helpful details to provide</strong>
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
              <section className="chat-sources" aria-label="Source data">
                <strong>
                  {item.catalog?.status === "ambiguous"
                    ? "Select a candidate medicine"
                    : "Source data"}{" "}
                  (42_2.csv)
                </strong>
                {item.sources.map((record, sourceIndex) => {
                  const sourceId = `source-image-${index}-${sourceIndex}`;
                  const askId = `source-ask-${index}-${sourceIndex}`;
                  return (
                    <div className="source-record" key={record.recordId}>
                      <strong>
                        {record.displayName || record.englishName}
                      </strong>
                      <p>{record.licenseNumber}</p>
                      <dl>
                        {Object.entries({
                          englishName: "English name",
                          shape: "Shape",
                          color: "Color",
                          scoreLine: "Score line",
                          size: "Appearance size (unit not provided)",
                          imprint1: "Imprint 1",
                          imprint2: "Imprint 2",
                        }).map(([field, label]) => (
                          <div key={field}>
                            <dt>{label}</dt>
                            <dd>{record[field] || "Not provided"}</dd>
                          </div>
                        ))}
                      </dl>
                      {/^(https?:\/\/)/i.test(record.imageUrl) && (
                        <a
                          className={
                            focusedId === sourceId ? "is-selected" : ""
                          }
                          href={record.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          {...focusProps(sourceId)}
                        >
                          Open the source image link
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
                          Ask about this medicine
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
              <strong>You</strong>
              <p>{pendingQuestion}</p>
            </article>
            <p role="status">The medicine assistant is replying…</p>
          </>
        )}
        {error && (
          <p className="chat-error" role="alert">
            {error} Your question was kept so you can submit it again.
          </p>
        )}
      </div>

      <form ref={formRef} className="chat-form" onSubmit={send}>
        <FocusableField
          id="medicine-question"
          label="What would you like to ask?"
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
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Enter a medicine-related question…"
        />
      </form>

      <p className="chat-disclaimer">{disclaimer}</p>
      <p className="chat-privacy">
        Messages and package text are sent to Gemini. Chinese CSV fields are
        sent to Google Cloud Translation for English translation. This page
        keeps only the current session and clears it when reloaded.
      </p>
    </section>
  );
});

export default MedicineChat;
