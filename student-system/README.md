# Student Records System

React frontend + Python (FastAPI) backend, storing records in your local SQL
Server via Windows Authentication.

## 1. Backend

```
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

`.env` defaults to `SQL_SERVER=localhost` and `DB_NAME=StudentRecordsDB` —
matches your existing setup (localhost, default instance, Windows login).
Edit it only if your server name or desired database name differs.

You need the "ODBC Driver 17 for SQL Server" installed (Microsoft's
download page, if `pip install pyodbc` alone doesn't already have it on
your machine).

Run it:

```
uvicorn main:app --reload --port 8000
```

## 2. Frontend

```
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — you'll land on the intro screen, then click
"Open the system" to reach the dashboard.

## 3. Using it

1. Click **Create database** once — this creates `StudentRecordsDB` and the
   `Students` table if they don't already exist. Safe to click again later;
   it won't duplicate anything.
2. Fill in the form (ID number, year level, name, age, program) and click
   **Add student**.
3. Records stay hidden by default. Click **Show table** to fetch and reveal
   them; click again to hide.

## Notes

- The frontend proxies `/api/*` to `http://localhost:8000` (see
  `frontend/vite.config.js`), so both servers need to be running at once.
- ID numbers are unique — adding a duplicate is rejected with a message
  rather than a raw error.
