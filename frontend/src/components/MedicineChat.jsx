import { useEffect, useRef, useState } from 'react'
import './MedicineChat.css'

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const disclaimer = 'AI responses are for reference only. Follow the prescription and package label, and consult a doctor or pharmacist when unsure.'

export default function MedicineChat() {
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [recognitionText, setRecognitionText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [pendingQuestion, setPendingQuestion] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [selectedMedicine, setSelectedMedicine] = useState(null)
  const logRef = useRef(null)
  const inputRef = useRef(null)
  const requestRef = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => () => { requestRef.current?.abort(); searchRef.current?.abort() }, [])
  useEffect(() => {
    if (!sending) inputRef.current?.focus({ preventScroll: true })
  }, [sending])
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages, sending, error])

  async function search(event) {
    event.preventDefault()
    const query = searchQuery.trim()
    if (query.length < 2 || sending) return
    searchRef.current?.abort()
    const controller = new AbortController()
    searchRef.current = controller
    setSearching(true)
    setSearchError('')
    setSearchResult(null)
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(`${apiBase}/api/medicine/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Medicine search is temporarily unavailable.')
      if (searchRef.current === controller) setSearchResult(data)
    } catch (failure) {
      if (searchRef.current === controller) setSearchError(failure.name === 'AbortError' ? 'Search timed out. Please try again.' : 'Cannot search medicines right now. Please try again.')
    } finally {
      clearTimeout(timeout)
      if (searchRef.current === controller) { searchRef.current = null; setSearching(false) }
    }
  }

  function selectMedicine(record) {
    if (requestRef.current) return
    searchRef.current?.abort()
    searchRef.current = null
    setSearching(false)
    setSelectedMedicine(record)
    setMessages([])
    setRecognitionText('')
    setSearchResult(null)
    setSearchError('')
    setError('')
    setQuestion('Please explain the appearance information for this medicine.')
    inputRef.current?.focus()
  }

  async function send(event) {
    event.preventDefault()
    const message = question.trim()
    if (!message || requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    const timeout = setTimeout(() => controller.abort(), 125000)
    setSending(true)
    setPendingQuestion(message)
    setError('')
    try {
      const response = await fetch(`${apiBase}/api/medicine/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          history: messages.slice(-20).map(({ role, content }) => ({ role, content })),
          ...(selectedMedicine ? { selectedMedicineId: selectedMedicine.recordId } : {}),
          ...(recognitionText.trim() ? { recognition: { text: recognitionText.trim() } } : {}),
        }),
      })
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error('The server returned an invalid response. Please try again.')
      }
      if (!response.ok || !data.ok) throw new Error(data.error || 'The medicine assistant is temporarily unavailable.')
      if (typeof data.reply?.answer !== 'string' || !Array.isArray(data.reply.warnings) || !Array.isArray(data.reply.followUpQuestions)) {
        throw new Error('The server returned an invalid response. Please try again.')
      }
      setMessages((previous) => [...previous,
        { role: 'user', content: message },
        { role: 'assistant', content: [data.reply.answer, ...data.reply.warnings, ...data.reply.followUpQuestions].join('\n'), reply: data.reply, sources: data.sources || [], catalog: data.catalog },
      ])
      // Keep a uniquely resolved record attached to subsequent follow-up questions.
      if (data.catalog?.status === 'matched' && data.sources?.length === 1) setSelectedMedicine(data.sources[0])
      setQuestion('')
    } catch (failure) {
      setError(failure.name === 'AbortError' ? 'The request timed out. Please try again.' : (failure.message === 'Failed to fetch' ? 'Cannot connect to the medicine assistant. Check the network and try again.' : failure.message))
    } finally {
      clearTimeout(timeout)
      requestRef.current = null
      setSending(false)
      setPendingQuestion('')
    }
  }

  function clearChat() {
    if (requestRef.current) return
    setMessages([])
    setQuestion('')
    setRecognitionText('')
    setSelectedMedicine(null)
    setSearchResult(null)
    setSearchError('')
    searchRef.current?.abort()
    searchRef.current = null
    setSearching(false)
    setError('')
    inputRef.current?.focus()
  }

  return (
    <section className="medicine-chat" aria-label="Medicine question chat">
      <div className="chat-heading">
        <div><h2>Medicine Questions</h2><p>Understand medicine labels and appearance data</p></div>
        <button type="button" onClick={clearChat} disabled={sending}>Clear chat</button>
      </div>
      <details className="recognition-input catalog-search" open>
        <summary>{selectedMedicine ? 'Selected medicine' : 'Search the medicine dataset'}</summary>
        {selectedMedicine ? <div className="selected-medicine">
          <strong>{selectedMedicine.displayName || selectedMedicine.englishName}</strong>
          <p>{selectedMedicine.licenseNumber}</p>
          <button type="button" onClick={clearChat} disabled={sending}>Change medicine and clear chat</button>
        </div> : <>
          <form onSubmit={search}>
            <label htmlFor="medicine-search">Medicine name or license identifier</label>
            <div className="chat-compose">
              <input id="medicine-search" value={searchQuery} maxLength={200} disabled={sending}
                onChange={(event) => setSearchQuery(event.target.value)} placeholder="Example: SODIUM BICARBONATE" />
              <button type="submit" disabled={sending || searching || searchQuery.trim().length < 2}>{searching ? 'Searching…' : 'Search'}</button>
            </div>
          </form>
          {searchError && <p role="alert">{searchError}</p>}
          {searchResult && <div aria-live="polite">
            <p>{searchResult.total} result{searchResult.total === 1 ? '' : 's'} found{searchResult.total > searchResult.records.length ? `. Showing the first ${searchResult.records.length}; add the strength or formulation to narrow the search.` : '.'}</p>
            {searchResult.records.map((record) => <button type="button" className="medicine-result" key={record.recordId}
              onClick={() => selectMedicine(record)} disabled={sending}>
              <strong>{record.displayName || record.englishName}</strong><span>{record.licenseNumber}</span>
            </button>)}
          </div>}
        </>}
        <p>Source: 42_2.csv. It contains names and appearance data, but no indications, adverse effects, or dosage.</p>
      </details>
      <details className="recognition-input">
        <summary>Add recognition data {recognitionText.trim() ? '(added)' : '(optional)'}</summary>
        <label htmlFor="recognition-text">Paste recognized text or package-label content</label>
        <textarea id="recognition-text" rows={3} maxLength={6000} value={recognitionText}
          disabled={sending || messages.length > 0}
          onChange={(event) => setRecognitionText(event.target.value)}
          placeholder="Example: recognized medicine name, strength, or label text" />
        <p>Recognition results must still be checked against the package or by a pharmacist. {messages.length > 0 && 'Clear the chat before replacing this content.'}</p>
      </details>
      <div className="chat-messages" ref={logRef} role="log" aria-label="Chat history" aria-live="polite" aria-relevant="additions text" tabIndex={0}>
        <article className="chat-bubble assistant">
          <strong>Medicine Data Assistant</strong>
          <p>Welcome. You can ask in any language; every response will use American English. Search and select a medicine, or include its name in your question.</p>
        </article>
        {messages.map((item, index) => (
          <article key={index} className={`chat-bubble ${item.role}`}>
            <strong>{item.role === 'user' ? 'You' : 'Medicine Data Assistant'}</strong>
            <p>{item.reply ? item.reply.answer : item.content}</p>
            {item.reply?.warnings.length > 0 && <div className="chat-warnings"><strong>Important</strong><ul>{item.reply.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div>}
            {item.reply?.followUpQuestions.length > 0 && <div className="chat-followups"><strong>Helpful details to provide</strong><ul>{item.reply.followUpQuestions.map((followup, i) => <li key={i}>{followup}</li>)}</ul></div>}
            {item.sources?.length > 0 && <details className="chat-sources" open={item.catalog?.status === 'ambiguous'}>
              <summary>{item.catalog?.status === 'ambiguous' ? 'Select a candidate medicine' : 'View source data'} (42_2.csv)</summary>
              {item.sources.map((record) => <div className="source-record" key={record.recordId}>
                <strong>{record.displayName || record.englishName}</strong>
                <p>{record.licenseNumber}</p>
                <dl>{Object.entries({ englishName: 'English name', shape: 'Shape', color: 'Color', scoreLine: 'Score line', size: 'Appearance size (unit not provided)', imprint1: 'Imprint 1', imprint2: 'Imprint 2' }).map(([field, label]) =>
                  <div key={field}><dt>{label}</dt><dd>{record[field] || 'Not provided'}</dd></div>)}</dl>
                {/^(https?:\/\/)/i.test(record.imageUrl) && <a href={record.imageUrl} target="_blank" rel="noreferrer">Open the source image link</a>}
                {item.catalog?.status === 'ambiguous' && <button type="button" disabled={sending} onClick={() => selectMedicine(record)}>Ask about this medicine</button>}
              </div>)}
            </details>}
          </article>
        ))}
        {sending && <><article className="chat-bubble user"><strong>You</strong><p>{pendingQuestion}</p></article><p role="status">The medicine assistant is replying…</p></>}
        {error && <p className="chat-error" role="alert">{error} Your question was kept so you can submit it again.</p>}
      </div>
      <form className="chat-form" onSubmit={send}>
        <label htmlFor="medicine-question">What would you like to ask?</label>
        <div className="chat-compose">
          <textarea id="medicine-question" ref={inputRef} rows={2} value={question} maxLength={2000}
            disabled={sending} onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                event.stopPropagation()
                event.currentTarget.form.requestSubmit()
              }
            }} placeholder="Enter a medicine-related question…" />
          <button type="submit" disabled={sending || !question.trim()}>{sending ? 'Replying…' : 'Send'}</button>
        </div>
      </form>
      <p className="chat-disclaimer">{disclaimer}</p>
      <p className="chat-privacy">Messages and recognition data are sent to Gemini. Chinese CSV fields are sent to Google Cloud Translation for English translation. This page keeps only the current session and clears it when reloaded.</p>
    </section>
  )
}
