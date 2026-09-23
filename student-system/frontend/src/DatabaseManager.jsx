import { useEffect, useRef, useState } from 'react'
import { api } from './api'

const FIELD_TYPES = [
  { value: 'text', label: 'Text (NVARCHAR)' },
  { value: 'number', label: 'Number (INT)' },
  { value: 'date', label: 'Date (DATE)' },
  { value: 'yesno', label: 'Yes/No (BIT)' },
]

const MAX_FIELDS = 64

function emptyWizard() {
  return {
    step: 1,
    dbName: '',
    tableName: '',
    count: '',
    fields: [],
    message: null,
    busy: false,
  }
}

function toInputValue(col, v) {
  if (col.type === 'BIT') {
    if (v === 1 || v === true || v === '1') return 'yes'
    if (v === 0 || v === false || v === '0') return 'no'
    return ''
  }
  if (v === null || v === undefined) return ''
  return String(v)
}

export default function DatabaseManager() {
  const [dbs, setDbs] = useState([])
  const [dbsError, setDbsError] = useState(null)
  const [wizard, setWizard] = useState(null)
  const [notice, setNotice] = useState(null)

  const [db, setDb] = useState('')
  const [tables, setTables] = useState([])
  const [tablesError, setTablesError] = useState(null)
  const [tablesBusy, setTablesBusy] = useState(false)
  const [table, setTable] = useState('')

  const [columns, setColumns] = useState([])
  const [rows, setRows] = useState([])
  const [rowsBusy, setRowsBusy] = useState(false)
  const [rowsError, setRowsError] = useState(null)

  const [adding, setAdding] = useState(false)
  const [addValues, setAddValues] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [editValues, setEditValues] = useState({})
  const [rowBusy, setRowBusy] = useState(false)

  const [confirmTarget, setConfirmTarget] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)

  const pendingTable = useRef(null)

  async function loadDbs() {
    setDbsError(null)
    try {
      const list = await api('/api/databases')
      setDbs(list)
    } catch (err) {
      setDbsError(`Couldn't load databases — ${err.message}`)
    }
  }

  async function loadTables(dbName) {
    setTablesBusy(true)
    setTablesError(null)
    try {
      const list = await api(`/api/databases/${encodeURIComponent(dbName)}/tables`)
      setTables(list)
      if (pendingTable.current && list.includes(pendingTable.current)) {
        setTable(pendingTable.current)
        pendingTable.current = null
      }
    } catch (err) {
      setTablesError(`Couldn't load tables — ${err.message}`)
    } finally {
      setTablesBusy(false)
    }
  }

  async function loadRows(dbName, tableName) {
    setRowsBusy(true)
    setRowsError(null)
    try {
      const data = await api(
        `/api/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}/rows`
      )
      setColumns(data.columns)
      setRows(data.rows)
    } catch (err) {
      setColumns([])
      setRows([])
      setRowsError(`Couldn't load rows — ${err.message}`)
    } finally {
      setRowsBusy(false)
    }
  }

  useEffect(() => {
    loadDbs()
  }, [])

  useEffect(() => {
    setTable('')
    setColumns([])
    setRows([])
    setEditingId(null)
    setAdding(false)
    if (db) loadTables(db)
    else setTables([])
  }, [db])

  useEffect(() => {
    setEditingId(null)
    setAdding(false)
    if (db && table) loadRows(db, table)
    else {
      setColumns([])
      setRows([])
    }
  }, [table])

  function updateWizard(field, value) {
    setWizard((w) => ({ ...w, [field]: value, message: null }))
  }

  async function submitWizardName(e) {
    e.preventDefault()
    const name = wizard.dbName.trim()
    setWizard((w) => ({ ...w, busy: true, message: null }))
    try {
      const data = await api('/api/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      setWizard((w) => ({ ...w, busy: false, step: 2, dbName: data.name }))
      loadDbs()
    } catch (err) {
      setWizard((w) => ({
        ...w,
        busy: false,
        message: { tone: 'bad', text: `Couldn't create the database — ${err.message}` },
      }))
    }
  }

  function submitFieldCount(e) {
    e.preventDefault()
    const tableName = wizard.tableName.trim()
    const count = Number(wizard.count)
    if (!tableName) {
      setWizard((w) => ({
        ...w,
        message: { tone: 'bad', text: 'Give the first table a name.' },
      }))
      return
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_FIELDS) {
      setWizard((w) => ({
        ...w,
        message: {
          tone: 'bad',
          text: `Enter how many fields the table should have (1–${MAX_FIELDS}).`,
        },
      }))
      return
    }
    setWizard((w) => ({
      ...w,
      step: 3,
      message: null,
      fields: Array.from({ length: count }, () => ({ name: '', type: 'text' })),
    }))
  }

  function updateField(i, key, value) {
    setWizard((w) => {
      const fields = w.fields.map((f, idx) => (idx === i ? { ...f, [key]: value } : f))
      return { ...w, fields, message: null }
    })
  }

  async function submitTable(e) {
    e.preventDefault()
    if (wizard.fields.some((f) => !f.name.trim())) {
      setWizard((w) => ({
        ...w,
        message: { tone: 'bad', text: 'Every field needs a name.' },
      }))
      return
    }
    const dbName = wizard.dbName
    const tableName = wizard.tableName.trim()
    const fields = wizard.fields.map((f) => ({ name: f.name.trim(), type: f.type }))
    setWizard((w) => ({ ...w, busy: true, message: null }))
    try {
      await api(`/api/databases/${encodeURIComponent(dbName)}/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_name: tableName, fields }),
      })
      setNotice({
        tone: 'good',
        text: `Database '${dbName}' and table '${tableName}' are ready.`,
      })
      pendingTable.current = tableName
      setWizard(null)
      if (db === dbName) await loadTables(dbName)
      else setDb(dbName)
      loadDbs()
    } catch (err) {
      setWizard((w) => ({
        ...w,
        busy: false,
        message: { tone: 'bad', text: `Couldn't create the table — ${err.message}` },
      }))
    }
  }

  function startAdd() {
    setEditingId(null)
    setAddValues({})
    setAdding(true)
  }

  function startEdit(row) {
    setAdding(false)
    setEditingId(row.id)
    const values = {}
    for (const col of columns) {
      if (col.name === 'id') continue
      values[col.name] = toInputValue(col, row[col.name])
    }
    setEditValues(values)
  }

  function buildPayload(values) {
    const payload = {}
    for (const col of columns) {
      if (col.name === 'id') continue
      payload[col.name] = values[col.name] ?? ''
    }
    return payload
  }

  async function saveNewRow() {
    setRowBusy(true)
    try {
      await api(
        `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/rows`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(addValues)),
        }
      )
      setAdding(false)
      setAddValues({})
      setNotice({ tone: 'good', text: 'Row added.' })
      await loadRows(db, table)
    } catch (err) {
      setNotice({ tone: 'bad', text: err.message })
    } finally {
      setRowBusy(false)
    }
  }

  async function saveEdit() {
    setRowBusy(true)
    try {
      await api(
        `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/rows/${editingId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(editValues)),
        }
      )
      setEditingId(null)
      setNotice({ tone: 'good', text: `Row ${editingId} updated.` })
      await loadRows(db, table)
    } catch (err) {
      setNotice({ tone: 'bad', text: err.message })
    } finally {
      setRowBusy(false)
    }
  }

  async function deleteRow(rowId) {
    setRowBusy(true)
    try {
      await api(
        `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/rows/${rowId}`,
        { method: 'DELETE' }
      )
      setNotice({ tone: 'good', text: `Row ${rowId} deleted.` })
      await loadRows(db, table)
    } catch (err) {
      setNotice({ tone: 'bad', text: err.message })
    } finally {
      setRowBusy(false)
    }
  }

  async function performDelete() {
    const { kind, name } = confirmTarget
    setActionBusy(true)
    try {
      if (kind === 'table') {
        await api(
          `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(name)}`,
          { method: 'DELETE' }
        )
        setConfirmTarget(null)
        setNotice({ tone: 'good', text: `Table '${name}' deleted.` })
        setTable('')
        await loadTables(db)
      } else {
        await api(`/api/databases/${encodeURIComponent(name)}`, { method: 'DELETE' })
        setConfirmTarget(null)
        setNotice({ tone: 'good', text: `Database '${name}' deleted.` })
        setDb('')
        await loadDbs()
      }
    } catch (err) {
      setConfirmTarget(null)
      setNotice({ tone: 'bad', text: err.message })
    } finally {
      setActionBusy(false)
    }
  }

  function displayValue(col, v) {
    if (col.type === 'BIT') {
      if (v === 1 || v === true || v === '1') return 'Yes'
      if (v === 0 || v === false || v === '0') return 'No'
      return <span className="muted">—</span>
    }
    if (v === null || v === undefined || v === '') return <span className="muted">—</span>
    return String(v)
  }

  function cellInput(col, value, onChange) {
    if (col.type === 'BIT') {
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      )
    }
    if (col.type === 'INT') {
      return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    }
    if (col.type === 'DATE') {
      return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    }
    return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
  }

  return (
    <div className="db-section">
      <section className="panel setup-panel">
        <div className="setup-text">
          <h2>Manage databases</h2>
          <p>
            Create databases and tables on this SQL Server, then browse, edit, and
            delete their rows.
          </p>
        </div>
        <div className="setup-action">
          {!wizard && (
            <button className="btn btn-accent" onClick={() => setWizard(emptyWizard())}>
              Create database
            </button>
          )}
          {notice && <p className={`inline-message ${notice.tone}`}>{notice.text}</p>}
        </div>
      </section>

      {wizard && (
        <section className="panel wizard-panel">
          <h2>
            Create database{wizard.step > 1 ? ` — step ${wizard.step} of 3` : ''}
          </h2>

          {wizard.step === 1 && (
            <form className="student-form" onSubmit={submitWizardName}>
              <label>
                Database name
                <input
                  autoFocus
                  value={wizard.dbName}
                  onChange={(e) => updateWizard('dbName', e.target.value)}
                  placeholder="InventoryDB"
                />
              </label>
              <div className="wizard-actions">
                <button className="btn btn-primary" type="submit" disabled={wizard.busy}>
                  {wizard.busy ? 'Creating…' : 'Continue'}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setWizard(null)}
                >
                  Cancel
                </button>
              </div>
              {wizard.message && (
                <p className={`inline-message ${wizard.message.tone}`}>{wizard.message.text}</p>
              )}
            </form>
          )}

          {wizard.step === 2 && (
            <form className="student-form" onSubmit={submitFieldCount}>
              <p className="muted">
                Database <strong>{wizard.dbName}</strong> was created. Now define its
                first table.
              </p>
              <label>
                Table name
                <input
                  autoFocus
                  value={wizard.tableName}
                  onChange={(e) => updateWizard('tableName', e.target.value)}
                  placeholder="Products"
                />
              </label>
              <label>
                How many fields?
                <input
                  type="number"
                  min="1"
                  max={MAX_FIELDS}
                  value={wizard.count}
                  onChange={(e) => updateWizard('count', e.target.value)}
                  placeholder="4"
                />
              </label>
              <div className="wizard-actions">
                <button className="btn btn-primary" type="submit">
                  Continue
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setWizard(emptyWizard())}
                >
                  Cancel
                </button>
              </div>
              {wizard.message && (
                <p className={`inline-message ${wizard.message.tone}`}>{wizard.message.text}</p>
              )}
            </form>
          )}

          {wizard.step === 3 && (
            <form className="student-form" onSubmit={submitTable}>
              <p className="muted">
                Table <strong>{wizard.tableName}</strong> in{' '}
                <strong>{wizard.dbName}</strong> — every table also gets an automatic
                <strong> id</strong> primary key.
              </p>
              {wizard.fields.map((f, i) => (
                <div className="field-row" key={i}>
                  <label>
                    Field {i + 1} name
                    <input
                      value={f.name}
                      onChange={(e) => updateField(i, 'name', e.target.value)}
                      placeholder={`field_${i + 1}`}
                    />
                  </label>
                  <label>
                    Type
                    <select
                      value={f.type}
                      onChange={(e) => updateField(i, 'type', e.target.value)}
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
              <div className="wizard-actions">
                <button className="btn btn-primary" type="submit" disabled={wizard.busy}>
                  {wizard.busy ? 'Creating…' : 'Create table'}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setWizard((w) => ({ ...w, step: 2, message: null }))}
                >
                  Back
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setWizard(emptyWizard())}
                >
                  Cancel
                </button>
              </div>
              {wizard.message && (
                <p className={`inline-message ${wizard.message.tone}`}>{wizard.message.text}</p>
              )}
            </form>
          )}
        </section>
      )}

      <section className="panel browse-panel">
        <div className="table-header">
          <h2>Browse</h2>
        </div>

        {dbsError && <p className="inline-message bad">{dbsError}</p>}

        {!dbsError && dbs.length === 0 && (
          <p className="muted">No databases yet — create one above to get started.</p>
        )}

        {dbs.length > 0 && (
          <div className="picker-bar">
            <label>
              Database
              <select value={db} onChange={(e) => setDb(e.target.value)}>
                <option value="">Select a database…</option>
                {dbs.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Table
              <select value={table} disabled={!db || tablesBusy} onChange={(e) => setTable(e.target.value)}>
                <option value="">
                  {!db ? 'Select a database first…' : tablesBusy ? 'Loading…' : 'Select a table…'}
                </option>
                {tables.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="picker-spacer" />
            {db && (
              <button
                className="btn btn-danger"
                onClick={() => setConfirmTarget({ kind: 'database', name: db })}
              >
                Delete database
              </button>
            )}
            {table && (
              <button
                className="btn btn-danger"
                onClick={() => setConfirmTarget({ kind: 'table', name: table })}
              >
                Delete table
              </button>
            )}
          </div>
        )}

        {tablesError && <p className="inline-message bad">{tablesError}</p>}

        {confirmTarget && (
          <div className="confirm-bar">
            <span>
              Delete {confirmTarget.kind} <strong>{confirmTarget.name}</strong>? This
              cannot be undone.
            </span>
            <div className="picker-spacer" />
            <button
              className="btn btn-ghost"
              onClick={() => setConfirmTarget(null)}
              disabled={actionBusy}
            >
              Cancel
            </button>
            <button className="btn btn-danger" onClick={performDelete} disabled={actionBusy}>
              {actionBusy ? 'Deleting…' : 'Yes, delete'}
            </button>
          </div>
        )}

        {db && !tablesBusy && !tablesError && tables.length === 0 && (
          <p className="muted">No tables in this database yet.</p>
        )}

        {table && (
          <div>
            <div className="table-header">
              <h2>
                {table} <span className="muted">in {db}</span>
              </h2>
              <div className="row-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => loadRows(db, table)}
                  disabled={rowsBusy}
                >
                  {rowsBusy ? 'Loading…' : 'Refresh'}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={startAdd}
                  disabled={adding || rowsBusy}
                >
                  Add row
                </button>
              </div>
            </div>

            {rowsError && <p className="inline-message bad">{rowsError}</p>}
            {rowsBusy && !rowsError && <p className="muted">Loading…</p>}

            {!rowsBusy && !rowsError && rows.length === 0 && !adding && (
              <p className="muted">No rows yet — use “Add row” to insert one.</p>
            )}

            {!rowsError && columns.length > 0 && (rows.length > 0 || adding) && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th key={c.name}>
                          {c.name} <span className="col-type">{c.type}</span>
                        </th>
                      ))}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adding && (
                      <tr>
                        {columns.map((c) => (
                          <td key={c.name}>
                            {c.name === 'id' ? (
                              <span className="muted">auto</span>
                            ) : (
                              cellInput(c, addValues[c.name] ?? '', (v) =>
                                setAddValues((prev) => ({ ...prev, [c.name]: v }))
                              )
                            )}
                          </td>
                        ))}
                        <td>
                          <div className="row-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={saveNewRow}
                              disabled={rowBusy}
                            >
                              {rowBusy ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setAdding(false)
                                setAddValues({})
                              }}
                              disabled={rowBusy}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {rows.map((row) =>
                      editingId === row.id ? (
                        <tr key={row.id}>
                          {columns.map((c) => (
                            <td key={c.name}>
                              {c.name === 'id' ? (
                                row.id
                              ) : (
                                cellInput(c, editValues[c.name] ?? '', (v) =>
                                  setEditValues((prev) => ({ ...prev, [c.name]: v }))
                                )
                              )}
                            </td>
                          ))}
                          <td>
                            <div className="row-actions">
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={saveEdit}
                                disabled={rowBusy}
                              >
                                {rowBusy ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setEditingId(null)}
                                disabled={rowBusy}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={row.id}>
                          {columns.map((c) => (
                            <td key={c.name}>{displayValue(c, row[c.name])}</td>
                          ))}
                          <td>
                            <div className="row-actions">
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => startEdit(row)}
                                disabled={rowBusy || adding}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => deleteRow(row.id)}
                                disabled={rowBusy}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
