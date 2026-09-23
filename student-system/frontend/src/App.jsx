import { useState } from 'react'

const EMPTY_FORM = { idnum: '', year_level: '1st Year', name: '', age: '', program: '' }
const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year']

async function api(path, options) {
  const res = await fetch(path, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.detail || 'Something went wrong.')
  }
  return data
}

function Landing({ onEnter }) {
  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden="true" />
      <div className="landing-content">
        <h1>Student Records</h1>
        <p>
          A small register for keeping ID numbers, year levels, and programs in one
          place, backed by SQL Server on this machine.
        </p>
        <button className="btn btn-primary btn-large" onClick={onEnter}>
          Open the system
        </button>
      </div>
    </div>
  )
}

function Dashboard() {
  const [dbMessage, setDbMessage] = useState(null)
  const [dbBusy, setDbBusy] = useState(false)

  const [form, setForm] = useState(EMPTY_FORM)
  const [formBusy, setFormBusy] = useState(false)
  const [formMessage, setFormMessage] = useState(null)

  const [tableVisible, setTableVisible] = useState(false)
  const [tableBusy, setTableBusy] = useState(false)
  const [tableError, setTableError] = useState(null)
  const [students, setStudents] = useState([])

  async function handleCreateDatabase() {
    setDbBusy(true)
    setDbMessage(null)
    try {
      const data = await api('/api/create-database', { method: 'POST' })
      setDbMessage({ tone: 'good', text: data.message })
    } catch (err) {
      setDbMessage({ tone: 'bad', text: `Couldn't set up the database — ${err.message}` })
    } finally {
      setDbBusy(false)
    }
  }

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleAddStudent(e) {
    e.preventDefault()
    setFormBusy(true)
    setFormMessage(null)
    try {
      await api('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, age: Number(form.age) }),
      })
      setFormMessage({ tone: 'good', text: `${form.name} was added.` })
      setForm(EMPTY_FORM)
      if (tableVisible) refreshTable()
    } catch (err) {
      setFormMessage({ tone: 'bad', text: err.message })
    } finally {
      setFormBusy(false)
    }
  }

  async function refreshTable() {
    setTableBusy(true)
    setTableError(null)
    try {
      const data = await api('/api/students')
      setStudents(data)
    } catch (err) {
      setTableError(`Couldn't load the table — ${err.message}`)
    } finally {
      setTableBusy(false)
    }
  }

  async function handleToggleTable() {
    if (tableVisible) {
      setTableVisible(false)
      return
    }
    setTableVisible(true)
    await refreshTable()
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <span className="wordmark">Student Records</span>
      </header>

      <section className="panel setup-panel">
        <div className="setup-text">
          <h2>Database</h2>
          <p>Create the database and table once, before adding students.</p>
        </div>
        <div className="setup-action">
          <button className="btn btn-accent" onClick={handleCreateDatabase} disabled={dbBusy}>
            {dbBusy ? 'Setting up…' : 'Create database'}
          </button>
          {dbMessage && <p className={`inline-message ${dbMessage.tone}`}>{dbMessage.text}</p>}
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <h2>Add a student</h2>
          <form onSubmit={handleAddStudent} className="student-form">
            <label>
              ID number
              <input
                required
                value={form.idnum}
                onChange={(e) => updateField('idnum', e.target.value)}
                placeholder="2024-00931"
              />
            </label>
            <label>
              Year level
              <select
                value={form.year_level}
                onChange={(e) => updateField('year_level', e.target.value)}
              >
                {YEAR_LEVELS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Full name
              <input
                required
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Dela Cruz, Juan"
              />
            </label>
            <label>
              Age
              <input
                required
                type="number"
                min="10"
                max="100"
                value={form.age}
                onChange={(e) => updateField('age', e.target.value)}
              />
            </label>
            <label>
              Program
              <input
                required
                value={form.program}
                onChange={(e) => updateField('program', e.target.value)}
                placeholder="BS Computer Science"
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={formBusy}>
              {formBusy ? 'Adding…' : 'Add student'}
            </button>
            {formMessage && (
              <p className={`inline-message ${formMessage.tone}`}>{formMessage.text}</p>
            )}
          </form>
        </section>

        <section className="panel">
          <div className="table-header">
            <h2>Records</h2>
            <button className="btn btn-ghost" onClick={handleToggleTable}>
              {tableVisible ? 'Hide table' : 'Show table'}
            </button>
          </div>

          {!tableVisible && <p className="muted">Records stay hidden until you show them.</p>}

          {tableVisible && tableBusy && <p className="muted">Loading…</p>}

          {tableVisible && !tableBusy && tableError && (
            <p className="inline-message bad">{tableError}</p>
          )}

          {tableVisible && !tableBusy && !tableError && students.length === 0 && (
            <p className="muted">No students recorded yet.</p>
          )}

          {tableVisible && !tableBusy && !tableError && students.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ID number</th>
                    <th>Year</th>
                    <th>Name</th>
                    <th>Age</th>
                    <th>Program</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.idnum}>
                      <td>{s.idnum}</td>
                      <td>{s.year_level}</td>
                      <td>{s.name}</td>
                      <td>{s.age}</td>
                      <td>{s.program}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default function App() {
  const [entered, setEntered] = useState(false)
  return entered ? <Dashboard /> : <Landing onEnter={() => setEntered(true)} />
}
